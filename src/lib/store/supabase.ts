import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { toView, type ActionRecord } from "../agent/actions";
import { RUN_MAX_ATTEMPTS, RUN_RECENT_MS, RUN_STALE_MS, type AgentRun } from "../agent/runs";
import { todayIndex } from "../format";
import { DEMO_WORKSPACE_ID } from "../mock/demo";
import { SEED_CHATS, SEED_TICKETS, SEED_WEEK } from "../mock/seed";
import type { ChatId, Message, PersonId, Ticket, WeekDay } from "../types";
import type { Store } from "./types";

/**
 * Postgres via supabase-js, using the service-role key. Server-only: the tables have
 * RLS on with no policies, so nothing else can read them.
 */
let client: SupabaseClient | null = null;
export function sb() {
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

interface TicketRow {
  id: string; team: Ticket["team"]; title: string; description: string; status: Ticket["status"];
  priority: Ticket["priority"]; assignee: PersonId; reporter: PersonId; links: Ticket["links"];
  images: Ticket["images"]; watch: Ticket["watch"]; activity: Ticket["activity"]; updated: string;
  blocked_by: string[];
}
const toRow = (t: Ticket): TicketRow => ({
  id: t.id, team: t.team, title: t.title, description: t.description, status: t.status, priority: t.priority,
  assignee: t.assignee, reporter: t.reporter, links: t.links, images: t.images, watch: t.watch,
  activity: t.activity, updated: t.updated, blocked_by: t.blockedBy ?? [],
});
const fromRow = ({ blocked_by, ...r }: TicketRow): Ticket => ({ ...r, blockedBy: blocked_by ?? [] });

interface MessageRow {
  workspace_id?: string;
  id: string; chat_id: ChatId; thread_id: string | null; parent_id: string | null;
  who: PersonId; text: string; ticket_id: string | null; time_label: string; action_id?: string | null;
}

interface ActionRow {
  id: string; chat_id: ChatId; message_id: string | null; status: ActionRecord["status"]; ops: ActionRecord["ops"];
  summary: string[]; destructive: boolean; undo_until: string | null; created_at: string;
}
const actionFromRow = (r: ActionRow): ActionRecord => ({
  id: r.id, chatId: r.chat_id, messageId: r.message_id, status: r.status, ops: r.ops, summary: r.summary,
  destructive: r.destructive, undoUntil: r.undo_until, createdAt: r.created_at,
});

/** Rows (ordered by seq) back into the nested Message / ReplyNode tree the UI uses. */
interface RunRow {
  id: string; trigger_message_id: string; chat_id: ChatId; thread_id: string | null; requester: string; role: AgentRun["role"];
  text: string; status: AgentRun["status"]; attempts: number; error: string | null; result: AgentRun["result"]; trace: unknown;
  created_at: string; started_at: string | null; finished_at: string | null;
}
const runFromRow = (r: RunRow): AgentRun => ({
  id: r.id, triggerMessageId: r.trigger_message_id, chatId: r.chat_id, threadId: r.thread_id, requester: r.requester, role: r.role,
  text: r.text, status: r.status, attempts: r.attempts, error: r.error, result: r.result, trace: r.trace,
  createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
});

function toTree(rows: MessageRow[], actions: Map<string, ActionRecord> = new Map()): Message[] {
  const roots: Message[] = [];
  const byId = new Map<string, Message>();
  for (const r of rows) {
    const a = r.action_id ? actions.get(r.action_id) : undefined;
    const base = { id: r.id, who: r.who, time: r.time_label, text: r.text, ticket: r.ticket_id, action: a ? toView(a) : null };
    if (!r.thread_id) {
      const m: Message = { ...base, replies: [] };
      roots.push(m);
      byId.set(r.id, m);
      continue;
    }
    // Threads are flat: older rows with a parent_id (nested replies) list in the thread
    // in conversation order like every other reply.
    byId.get(r.thread_id)?.replies.push(base);
  }
  return roots;
}

interface HitRow { id: string; chat_id: ChatId; thread_id: string | null; who: PersonId; text: string; time_label: string }
const toHit = (r: HitRow) => ({ chatId: r.chat_id, id: r.id, threadId: r.thread_id, who: r.who, time: r.time_label, text: r.text });

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A store over one workspace's rows. Every query filters by workspace_id. */
export function supabaseStore(ws: string): Store {
  const isDemo = ws === DEMO_WORKSPACE_ID;
  return {
  kind: "supabase",
  async listTickets() {
    const rows = check(await sb().from("tickets").select("*").eq("workspace_id", ws).order("created_at").order("id"), "list tickets") as TicketRow[];
    return rows.map(fromRow);
  },
  async getTicket(id) {
    const row = check(await sb().from("tickets").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle(), "get ticket") as TicketRow | null;
    return row ? fromRow(row) : null;
  },
  async nextTicketId() {
    return check(await sb().rpc("next_ticket_id", { p_ws: ws }), "next ticket id") as string;
  },
  async insertTicket(t) {
    check(await sb().from("tickets").insert({ ...toRow(t), workspace_id: ws }), "insert ticket");
  },
  async saveTicket(t) {
    check(await sb().from("tickets").update({ ...toRow(t), updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", t.id), "save ticket");
  },
  async deleteTicket(id) {
    check(await sb().from("tickets").delete().eq("workspace_id", ws).eq("id", id), "delete ticket");
  },
  async listMessages(chatId) {
    const [msgRes, actRes] = await Promise.all([
      sb().from("messages").select("id,chat_id,thread_id,parent_id,who,text,ticket_id,time_label,action_id").eq("workspace_id", ws).eq("chat_id", chatId).order("seq"),
      sb().from("agent_actions").select("*").eq("workspace_id", ws).eq("chat_id", chatId),
    ]);
    const rows = check(msgRes, "list messages") as MessageRow[];
    const acts = (check(actRes, "list actions") as ActionRow[]).map(actionFromRow);
    return toTree(rows, new Map(acts.map((a) => [a.id, a])));
  },
  async appendMessage(chatId, msg, threadId) {
    const row = {
      workspace_id: ws, id: msg.id, chat_id: chatId, thread_id: threadId ?? null, parent_id: null,
      who: msg.who, text: msg.text, ticket_id: msg.ticket ?? null, time_label: msg.time, action_id: msg.actionId ?? null,
    };
    // One round trip: the foreign key rejects a reply to a thread that no longer
    // exists, and only then do we fall back (same behaviour as the memory store).
    let res = await sb().from("messages").insert(row);
    if (res.error?.code === "23503" && row.thread_id) res = await sb().from("messages").insert({ ...row, thread_id: null });
    check(res, "append message");
    return row.thread_id ? { ...msg } : { ...msg, replies: [] };
  },
  async searchMessages(terms, limit) {
    const q = terms.map((t) => t.replace(/[^\p{L}\p{N}-]/gu, "")).filter(Boolean).join(" or ");
    if (!q) return [];
    const rows = check(
      await sb()
        .from("messages")
        .select("id,chat_id,thread_id,who,text,time_label")
        .eq("workspace_id", ws)
        .textSearch("text", q, { type: "websearch", config: "english" })
        .order("seq", { ascending: false })
        .limit(limit * 3),
      "search messages",
    ) as HitRow[];
    return rows.map(toHit);
  },
  async messagesMentioning(ticketId, limit) {
    const key = ticketId.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!key) return [];
    const rows = check(
      await sb().from("messages").select("id,chat_id,thread_id,who,text,time_label").eq("workspace_id", ws).ilike("text", `%${key}%`).order("seq", { ascending: false }).limit(limit),
      "messages mentioning",
    ) as HitRow[];
    return rows.map(toHit);
  },
  async getMessageRefs(ids) {
    if (!ids.length) return {};
    const rows = check(await sb().from("messages").select("id,chat_id,thread_id").eq("workspace_id", ws).in("id", ids), "message refs") as {
      id: string; chat_id: ChatId; thread_id: string | null;
    }[];
    return Object.fromEntries(rows.map((r) => [r.id, { chatId: r.chat_id, threadId: r.thread_id }]));
  },
  async deleteChatMessages(chatId) {
    // Replies first: they reference their thread roots.
    check(await sb().from("messages").delete().eq("workspace_id", ws).eq("chat_id", chatId).not("thread_id", "is", null), "delete replies");
    check(await sb().from("messages").delete().eq("workspace_id", ws).eq("chat_id", chatId), "delete messages");
  },
  async week() {
    const rows = check(await sb().from("week_activity").select("day,people,atlas").eq("workspace_id", ws).order("day"), "week") as { day: number; people: number; atlas: number }[];
    return DAY.map((d, i) => {
      const r = rows.find((x) => x.day === i);
      return { d, p: r?.people ?? 0, a: r?.atlas ?? 0 } satisfies WeekDay;
    });
  },
  async bumpWeek(kind) {
    check(await sb().rpc("bump_week", { p_ws: ws, p_day: todayIndex(), p_atlas: kind === "a" }), "bump week");
  },
  async logEvent(e) {
    check(
      await sb().from("events").insert({ workspace_id: ws, kind: e.kind, actor: e.actor, chat_id: e.chatId ?? null, ticket_id: e.ticketId ?? null, payload: e.payload ?? {} }),
      "log event",
    );
  },
  async insertAction(a) {
    check(
      await sb().from("agent_actions").insert({
        workspace_id: ws,
        id: a.id, chat_id: a.chatId, message_id: a.messageId, status: a.status, ops: a.ops, summary: a.summary,
        destructive: a.destructive, undo_until: a.undoUntil,
      }),
      "insert action",
    );
  },
  async getAction(id) {
    const row = check(await sb().from("agent_actions").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle(), "get action") as ActionRow | null;
    return row ? actionFromRow(row) : null;
  },
  async transitionAction(id, from, to, patch) {
    const update: Record<string, unknown> = { status: to, decided_at: new Date().toISOString() };
    if (patch && "undoUntil" in patch) update.undo_until = patch.undoUntil ?? null;
    // Conditional update: only one caller can move it out of `from`.
    const rows = check(await sb().from("agent_actions").update(update).eq("workspace_id", ws).eq("id", id).in("status", from).select("id"), "transition action") as { id: string }[];
    return rows.length > 0;
  },
  async enqueueRun(run) {
    const res = await sb().from("agent_runs").insert({
      workspace_id: ws, requester: run.requester,
      id: run.id, trigger_message_id: run.triggerMessageId, chat_id: run.chatId, thread_id: run.threadId,
      role: run.role, text: run.text, status: run.status, attempts: run.attempts, created_at: run.createdAt,
    });
    if (res.error?.code === "23505") {
      // Already enqueued for this message (a retried request): return that run.
      const row = check(await sb().from("agent_runs").select("*").eq("workspace_id", ws).eq("trigger_message_id", run.triggerMessageId).single(), "get run") as RunRow;
      return runFromRow(row);
    }
    check(res, "enqueue run");
    return run;
  },
  async claimRun(id) {
    // One conditional UPDATE in Postgres, so two workers can't both claim it.
    const rows = check(
      await sb().rpc("claim_agent_run", { p_ws: ws, p_id: id, p_stale_seconds: RUN_STALE_MS / 1000, p_max_attempts: RUN_MAX_ATTEMPTS }),
      "claim run",
    ) as RunRow[];
    return rows.length ? runFromRow(rows[0]) : null;
  },
  async finishRun(id, patch) {
    const update: Record<string, unknown> = { status: patch.status, finished_at: new Date().toISOString() };
    if ("error" in patch) update.error = patch.error;
    if ("result" in patch) update.result = patch.result;
    if ("trace" in patch) update.trace = patch.trace;
    check(await sb().from("agent_runs").update(update).eq("workspace_id", ws).eq("id", id), "finish run");
  },
  async listRecentRuns() {
    const since = new Date(Date.now() - RUN_RECENT_MS).toISOString();
    const cols = "id,trigger_message_id,chat_id,thread_id,requester,role,text,status,attempts,error,result,created_at,started_at,finished_at";
    const rows = check(
      await sb().from("agent_runs").select(cols).eq("workspace_id", ws).or(`status.in.(queued,running),finished_at.gt.${since}`).order("created_at").limit(50),
      "list runs",
    ) as unknown as RunRow[];
    return rows.map((r) => runFromRow({ ...r, trace: null }));
  },
  async reset() {
    // Only the sample workspace can be put back to its seed data.
    if (!isDemo) throw new Error("Only the demo workspace can be reset");
    const db = sb();
    check(await db.from("agent_runs").delete().eq("workspace_id", ws).neq("id", ""), "clear runs");
    check(await db.from("agent_actions").delete().eq("workspace_id", ws).neq("id", ""), "clear actions");
    // Order matters: replies reference their thread roots.
    check(await db.from("events").delete().eq("workspace_id", ws).gte("id", 0), "clear events");
    check(await db.from("messages").delete().eq("workspace_id", ws).not("thread_id", "is", null), "clear replies");
    check(await db.from("messages").delete().eq("workspace_id", ws).neq("id", ""), "clear messages");
    check(await db.from("tickets").delete().eq("workspace_id", ws).neq("id", ""), "clear tickets");
    check(await db.from("week_activity").delete().eq("workspace_id", ws).gte("day", 0), "clear week");
    check(await db.rpc("reset_ticket_number", { p_ws: ws }), "reset numbering");

    check(await db.from("tickets").insert(SEED_TICKETS.map((t) => ({ ...toRow(t), workspace_id: ws }))), "seed tickets");
    const rows: MessageRow[] = [];
    for (const [chatId, msgs] of Object.entries(SEED_CHATS) as [ChatId, Message[]][]) {
      for (const m of msgs) {
        rows.push({ workspace_id: ws, id: m.id, chat_id: chatId, thread_id: null, parent_id: null, who: m.who, text: m.text, ticket_id: m.ticket ?? null, time_label: m.time });
        for (const n of m.replies)
          rows.push({ workspace_id: ws, id: n.id, chat_id: chatId, thread_id: m.id, parent_id: null, who: n.who, text: n.text, ticket_id: n.ticket ?? null, time_label: n.time });
      }
    }
    // Insert in order so seq preserves conversation order.
    for (let i = 0; i < rows.length; i += 200) check(await db.from("messages").insert(rows.slice(i, i + 200)), "seed messages");
    check(await db.from("week_activity").insert(SEED_WEEK.map((w, day) => ({ workspace_id: ws, day, people: w.p, atlas: w.a }))), "seed week");
  },
};
}
