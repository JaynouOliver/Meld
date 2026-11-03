import { CHAT_META, PEOPLE, teamName } from "../constants";
import { stamp } from "../format";
import { canDelete, canSee } from "../rbac";
import type { Store } from "../store/types";
import type { ActionView, ChatId, Role, Ticket } from "../types";

/**
 * Atlas's ticket changes as data, so they can be held for confirmation, applied
 * later, and undone exactly. One op per ticket (the net change of a run).
 */
export type TicketOp =
  | { type: "create"; after: Ticket }
  | { type: "update"; before: Ticket; after: Ticket; changes: string[] }
  | { type: "delete"; before: Ticket };

export interface ActionRecord {
  id: string;
  chatId: ChatId;
  messageId: string | null;
  status: ActionView["status"];
  ops: TicketOp[];
  summary: string[];
  destructive: boolean;
  undoUntil: string | null;
  createdAt: string;
}

export const UNDO_WINDOW_MS = 10 * 60 * 1000;
/** Changing this many tickets at once needs a confirmation, as does any delete. */
export const BULK_THRESHOLD = 3;

export function needsConfirmation(ops: TicketOp[]) {
  return ops.some((o) => o.type === "delete") || ops.length >= BULK_THRESHOLD;
}

const title = (t: Ticket) => `“${t.title || "Untitled"}”`;

export function summarize(ops: TicketOp[]): string[] {
  return ops.map((o) => {
    if (o.type === "create") return `Create ${o.after.id} ${title(o.after)} in ${teamName(o.after.team)}, assigned to ${PEOPLE[o.after.assignee].name}`;
    if (o.type === "delete") return `Delete ${o.before.id} ${title(o.before)}`;
    return `${o.after.id} ${title(o.after)}: ${o.changes.join(", ")}`;
  });
}

export function toView(a: ActionRecord): ActionView {
  return { id: a.id, status: a.status, summary: a.summary, destructive: a.destructive, undoUntil: a.undoUntil };
}

/** Can this role carry out (or undo) these changes? Re-checked at decision time. */
export function permissionProblem(ops: TicketOp[], role: Role): string | null {
  for (const o of ops) {
    if (role === "guest" && o.type !== "update") return "Guests can't create or delete tickets.";
    if (o.type === "delete" && !canDelete(role)) return "Only org owners can delete tickets.";
    const t = o.type === "create" ? o.after : o.before;
    if (o.type === "create" ? role === "member" && t.team !== "design" : !canSee(role, t)) return `Your role can't change ${t.id}.`;
  }
  return null;
}

const FIELDS = ["title", "description", "status", "priority", "assignee", "links"] as const;

/**
 * Apply ops. Updates are applied field by field on top of the ticket's current
 * state, so edits made since the plan was made aren't lost. Returns the chats that
 * got an "Update on NW-…" post.
 */
export async function applyOps(store: Store, ops: TicketOp[], where: ChatId): Promise<ChatId[]> {
  const posted = new Set<ChatId>();
  for (const o of ops) {
    if (o.type === "create") {
      if (!(await store.getTicket(o.after.id))) await store.insertTicket(o.after);
      await Promise.all([store.bumpWeek("a"), store.logEvent({ kind: "ticket.created", actor: "atlas", chatId: where, ticketId: o.after.id })]);
    } else if (o.type === "delete") {
      await store.deleteTicket(o.before.id);
      await Promise.all([store.bumpWeek("a"), store.logEvent({ kind: "ticket.deleted", actor: "atlas", chatId: where, ticketId: o.before.id })]);
    } else {
      const cur = await store.getTicket(o.after.id);
      if (!cur) continue;
      for (const f of FIELDS) {
        if (JSON.stringify(o.before[f]) !== JSON.stringify(o.after[f])) (cur as unknown as Record<string, unknown>)[f] = o.after[f];
      }
      cur.updated = "Just now";
      cur.activity.push({ who: "Atlas", text: `${o.changes.join(", ")} (asked by ${PEOPLE.me.name})`, time: stamp() });
      await Promise.all([
        store.saveTicket(cur),
        store.bumpWeek("a"),
        store.logEvent({ kind: "ticket.updated", actor: "atlas", chatId: where, ticketId: cur.id, payload: { changes: o.changes } }),
      ]);
      // Tell the channel that follows this ticket, when that's not where we are.
      if (cur.watch && cur.watch.chat !== where) {
        await store.appendMessage(
          cur.watch.chat,
          { id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, who: "atlas", time: stamp(), text: `Update on ${cur.id}: ${o.changes.join(", ")} (via Atlas, asked by ${PEOPLE.me.name}).` },
          cur.watch.thread,
        );
        posted.add(cur.watch.chat);
      }
    }
  }
  return [...posted];
}

/** Undo applied ops, newest first: remove created tickets, restore deleted ones, revert changed fields. */
export async function revertOps(store: Store, ops: TicketOp[], where: ChatId) {
  for (const o of [...ops].reverse()) {
    if (o.type === "create") await store.deleteTicket(o.after.id);
    else if (o.type === "delete") {
      if (!(await store.getTicket(o.before.id))) await store.insertTicket(o.before);
    } else {
      const cur = await store.getTicket(o.after.id);
      if (!cur) continue;
      for (const f of FIELDS) {
        if (JSON.stringify(o.before[f]) !== JSON.stringify(o.after[f])) (cur as unknown as Record<string, unknown>)[f] = o.before[f];
      }
      cur.updated = "Just now";
      cur.activity.push({ who: "Atlas", text: `undid: ${o.changes.join(", ")} (asked by ${PEOPLE.me.name})`, time: stamp() });
      await store.saveTicket(cur);
    }
    await store.logEvent({ kind: "ticket.undone", actor: "me", chatId: where, ticketId: o.type === "create" ? o.after.id : o.before.id });
  }
}

export function chatLabel(chatId: ChatId) {
  const m = CHAT_META[chatId];
  return m.kind === "channel" ? `#${m.label}` : "a DM with Atlas";
}
