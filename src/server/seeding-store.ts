import "server-only";

import { sb, toRow } from "@/lib/store/supabase";
import type { Store } from "@/lib/store/types";

/**
 * A write-behind store for building a demo workspace against Supabase (about 230 store
 * calls, one round trip each, used to take 4–5 s). Writes are queued in order and
 * runs of consecutive messages or tickets go out as one bulk insert; anything that
 * reads (or whose result is used) first flushes the queue, so seeds always see their
 * own writes. Ticket numbers are allocated locally (nobody else can file tickets in a
 * workspace that's still being built) and the counter is set once at the end.
 * Only for createSandbox: call flush() before handing the workspace over.
 */
type Op =
  | { kind: "message"; row: Record<string, unknown> }
  | { kind: "ticket"; row: Record<string, unknown> }
  | { kind: "call"; run: () => Promise<unknown>; quiet: boolean };

/** Writes whose result seeds don't use: safe to queue. */
const QUEUED = new Set([
  "react", "updateMessage", "insertAction", "saveTicket", "saveTeamDecision", "addReminder", "addAgentMemory", "addMissionEvent",
  "saveMission", "saveDecision", "saveOpenQuestion", "saveTriage", "savePlaybook", "bumpWeek", "logEvent",
]);
/** Seeds already ignore failures of these (as the store calls did before). */
const QUIET = new Set(["react", "updateMessage", "addReminder"]);

export function seedingStore(store: Store, ws: { id: string; ticketPrefix: string }): Store & { flush(): Promise<void> } {
  if (store.kind !== "supabase") return Object.assign(store, { flush: async () => {} });
  const queue: Op[] = [];
  let seq: number | null = null;
  let issued = 0;

  const flush = async () => {
    while (queue.length) {
      const op = queue[0];
      if (op.kind === "call") {
        queue.shift();
        try {
          await op.run();
        } catch (e) {
          if (!op.quiet) throw e;
        }
        continue;
      }
      // A run of the same kind: one bulk insert, in order (seq follows row order).
      let n = 0;
      while (n < queue.length && queue[n].kind === op.kind) n++;
      const rows = queue.splice(0, n).map((o) => (o as { row: Record<string, unknown> }).row);
      const { error } = await sb().from(op.kind === "message" ? "messages" : "tickets").insert(rows);
      if (error) throw new Error(`seed ${op.kind}s: ${error.message}`);
    }
    // Keep the workspace's ticket counter in step with the numbers handed out.
    if (seq !== null && issued !== seq) {
      const { error } = await sb().from("workspaces").update({ ticket_seq: seq }).eq("id", ws.id);
      if (error) throw new Error(`seed ticket counter: ${error.message}`);
      issued = seq;
    }
  };

  const proxy = new Proxy(store, {
    get(target, key) {
      if (key === "flush") return flush;
      const value = (target as unknown as Record<string | symbol, unknown>)[key];
      if (typeof value !== "function") return value;
      const fn = value as (...a: unknown[]) => Promise<unknown>;
      if (key === "appendMessage") {
        return async (chatId: string, msg: { id: string; who: string; text: string; time: string; ticket?: string | null; actionId?: string | null }, threadId?: string | null) => {
          queue.push({
            kind: "message",
            row: {
              workspace_id: ws.id, id: msg.id, chat_id: chatId, thread_id: threadId ?? null, parent_id: null, who: msg.who, text: msg.text,
              ticket_id: msg.ticket ?? null, time_label: msg.time, action_id: msg.actionId ?? null,
            },
          });
          return threadId ? { ...msg } : { ...msg, replies: [] };
        };
      }
      if (key === "insertTicket") {
        return async (t: Parameters<typeof toRow>[0]) => {
          queue.push({ kind: "ticket", row: { ...toRow(t), workspace_id: ws.id } });
        };
      }
      if (key === "nextTicketId") {
        return async () => {
          if (seq === null) {
            const { data, error } = await sb().from("workspaces").select("ticket_seq").eq("id", ws.id).single();
            if (error) throw new Error(`seed ticket counter: ${error.message}`);
            seq = issued = (data as { ticket_seq: number }).ticket_seq ?? 0;
          }
          seq += 1;
          return `${ws.ticketPrefix}-${seq}`;
        };
      }
      if (QUEUED.has(String(key))) {
        return async (...args: unknown[]) => {
          queue.push({ kind: "call", run: () => fn.apply(target, args), quiet: QUIET.has(String(key)) });
        };
      }
      // Reads, and writes whose result matters: everything queued goes first.
      return async (...args: unknown[]) => {
        await flush();
        return fn.apply(target, args);
      };
    },
  });
  return proxy as Store & { flush(): Promise<void> };
}
