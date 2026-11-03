import { toView, type ActionRecord } from "../agent/actions";
import { RUN_MAX_ATTEMPTS, RUN_RECENT_MS, RUN_STALE_MS, type AgentRun } from "../agent/runs";
import { appendMessage, bumpWeek, db, resetDb } from "../mock/db";
import type { ChatId, Message, ReplyNode } from "../types";
import type { MessageHit, Store } from "./types";

const clone = <T,>(x: T): T => structuredClone(x);

// Actions live beside the in-memory db (reset with it).
const g = globalThis as typeof globalThis & { __meldActions?: Map<string, ActionRecord> };
const actions = (g.__meldActions ??= new Map());
const g2 = globalThis as typeof globalThis & { __meldRuns?: Map<string, AgentRun> };
const runs = (g2.__meldRuns ??= new Map());

/** Attach each message's action view (and drop the internal id) for the client. */
function withActions(list: Message[]): Message[] {
  const fix = <T extends { actionId?: string | null; action?: unknown }>(m: T) => {
    const a = m.actionId ? actions.get(m.actionId) : null;
    const { actionId: _drop, ...rest } = m;
    void _drop;
    return { ...rest, action: a ? toView(a) : null } as T;
  };
  return list.map((m) => ({ ...fix(m), replies: m.replies.map((r: ReplyNode) => fix(r)) }));
}

/** Every message in conversation order, flattened, with its thread root. */
function allMessages(): MessageHit[] {
  const out: MessageHit[] = [];
  for (const [chatId, msgs] of Object.entries(db.chats) as [ChatId, Message[]][]) {
    for (const m of msgs) {
      out.push({ chatId, id: m.id, threadId: null, who: m.who, time: m.time, text: m.text });
      for (const n of m.replies) out.push({ chatId, id: n.id, threadId: m.id, who: n.who, time: n.time, text: n.text });
    }
  }
  return out;
}

export const memoryStore: Store = {
  kind: "memory",
  async listTickets() {
    return clone(db.tickets);
  },
  async getTicket(id) {
    const t = db.tickets.find((x) => x.id === id);
    return t ? clone(t) : null;
  },
  async nextTicketId() {
    return `NW-${db.nextNum++}`;
  },
  async insertTicket(t) {
    db.tickets.push(clone(t));
  },
  async saveTicket(t) {
    const i = db.tickets.findIndex((x) => x.id === t.id);
    if (i >= 0) db.tickets[i] = clone(t);
  },
  async deleteTicket(id) {
    db.tickets = db.tickets.filter((x) => x.id !== id);
  },
  async listMessages(chatId) {
    return withActions(clone(db.chats[chatId] ?? []));
  },
  async appendMessage(chatId, msg, threadId) {
    return clone(appendMessage(chatId, msg, threadId));
  },
  async searchMessages(terms, limit) {
    return allMessages()
      .filter((m) => terms.some((w) => m.text.toLowerCase().includes(w)))
      .slice(-limit * 3);
  },
  async messagesMentioning(ticketId, limit) {
    const key = ticketId.toUpperCase();
    return allMessages()
      .filter((m) => m.text.toUpperCase().includes(key))
      .slice(-limit)
      .reverse();
  },
  async getMessageRefs(ids) {
    const want = new Set(ids);
    const out: Record<string, { chatId: ChatId; threadId: string | null }> = {};
    for (const m of allMessages()) if (want.has(m.id)) out[m.id] = { chatId: m.chatId, threadId: m.threadId };
    return out;
  },
  async week() {
    return clone(db.week);
  },
  async bumpWeek(kind) {
    bumpWeek(kind);
  },
  async logEvent() {
    // The in-memory store keeps no event log.
  },
  async insertAction(a) {
    actions.set(a.id, clone(a));
  },
  async getAction(id) {
    const a = actions.get(id);
    return a ? clone(a) : null;
  },
  async transitionAction(id, from, to, patch) {
    const a = actions.get(id);
    if (!a || !from.includes(a.status)) return false;
    a.status = to;
    if (patch && "undoUntil" in patch) a.undoUntil = patch.undoUntil ?? null;
    return true;
  },
  async enqueueRun(run) {
    const existing = [...runs.values()].find((r) => r.triggerMessageId === run.triggerMessageId);
    if (existing) return clone(existing);
    runs.set(run.id, clone(run));
    return clone(run);
  },
  async claimRun(id) {
    const r = runs.get(id);
    if (!r || r.attempts >= RUN_MAX_ATTEMPTS) return null;
    const stale = r.status === "running" && Date.now() - Date.parse(r.startedAt ?? "") > RUN_STALE_MS;
    if (r.status !== "queued" && !stale) return null;
    Object.assign(r, { status: "running", startedAt: new Date().toISOString(), attempts: r.attempts + 1 });
    return clone(r);
  },
  async finishRun(id, patch) {
    const r = runs.get(id);
    if (r) Object.assign(r, { ...patch, finishedAt: new Date().toISOString() });
  },
  async listRecentRuns() {
    const since = Date.now() - RUN_RECENT_MS;
    return [...runs.values()].filter((r) => r.status === "queued" || r.status === "running" || Date.parse(r.finishedAt ?? "") > since).map(clone);
  },
  async reset() {
    resetDb();
    actions.clear();
    runs.clear();
  },
};
