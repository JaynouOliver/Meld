import { toView } from "../agent/actions";
import { RUN_MAX_ATTEMPTS, RUN_RECENT_MS, RUN_STALE_MS } from "../agent/runs";
import { setDemoStoreFactory } from "../context";
import { appendMessage, bumpWeek, dbFor, resetDb, type Db } from "../mock/db";
import { DEMO_WORKSPACE_ID } from "../mock/demo";
import type { ChatId, Message, ReplyNode } from "../types";
import type { MessageHit, Store } from "./types";

const clone = <T,>(x: T): T => structuredClone(x);

/** Attach each message's action view (and drop the internal id) for the client. */
function withActions(db: Db, list: Message[]): Message[] {
  const fix = <T extends { actionId?: string | null; action?: unknown }>(m: T) => {
    const a = m.actionId ? db.actions.get(m.actionId) : null;
    const { actionId: _drop, ...rest } = m;
    void _drop;
    return { ...rest, action: a ? toView(a) : null } as T;
  };
  return list.map((m) => ({ ...fix(m), replies: m.replies.map((r: ReplyNode) => fix(r)) }));
}

/** Every message in conversation order, flattened, with its thread root. */
function allMessages(db: Db): MessageHit[] {
  const out: MessageHit[] = [];
  for (const [chatId, msgs] of Object.entries(db.chats) as [ChatId, Message[]][]) {
    for (const m of msgs) {
      out.push({ chatId, id: m.id, threadId: null, who: m.who, time: m.time, text: m.text });
      for (const n of m.replies) out.push({ chatId, id: n.id, threadId: m.id, who: n.who, time: n.time, text: n.text });
    }
  }
  return out;
}

/**
 * A store over one workspace's in-memory database. `db` is looked up on every call, so
 * reset() (which swaps the database) takes effect for existing store objects too.
 */
export function memoryStore(workspaceId: string, ticketPrefix = "NW"): Store {
  const d = () => dbFor(workspaceId);
  return {
  kind: "memory",
  async listTickets() {
    return clone(d().tickets);
  },
  async getTicket(id) {
    const t = d().tickets.find((x) => x.id === id);
    return t ? clone(t) : null;
  },
  async nextTicketId() {
    return `${ticketPrefix}-${d().nextNum++}`;
  },
  async insertTicket(t) {
    d().tickets.push(clone(t));
  },
  async saveTicket(t) {
    const i = d().tickets.findIndex((x) => x.id === t.id);
    if (i >= 0) d().tickets[i] = clone(t);
  },
  async deleteTicket(id) {
    d().tickets = d().tickets.filter((x) => x.id !== id);
  },
  async listMessages(chatId, opts) {
    return withActions(d(), clone((d().chats[chatId] ?? []).slice(-(opts?.limit ?? 100))));
  },
  async appendMessage(chatId, msg, threadId) {
    return clone(appendMessage(d(), chatId, msg, threadId));
  },
  async searchMessages(terms, limit) {
    return allMessages(d())
      .filter((m) => terms.some((w) => m.text.toLowerCase().includes(w)))
      .slice(-limit * 3);
  },
  async messagesMentioning(ticketId, limit) {
    const key = ticketId.toUpperCase();
    return allMessages(d())
      .filter((m) => m.text.toUpperCase().includes(key))
      .slice(-limit)
      .reverse();
  },
  async getMessageRefs(ids) {
    const want = new Set(ids);
    const out: Record<string, { chatId: ChatId; threadId: string | null }> = {};
    for (const m of allMessages(d())) if (want.has(m.id)) out[m.id] = { chatId: m.chatId, threadId: m.threadId };
    return out;
  },
  async messagesSince(since, limit) {
    const t = Date.parse(since);
    // Seed messages carry display times ("10:02 AM"), not ISO: they count as old.
    return allMessages(d()).filter((m) => Date.parse(m.time) > t).slice(-limit);
  },
  async readMarkers(userId) {
    return { ...(d().reads.get(userId) ?? {}) };
  },
  async markRead(userId, chatId, at) {
    const r = d().reads.get(userId) ?? {};
    r[chatId] = at;
    d().reads.set(userId, r);
  },
  async getSummary(key) {
    return d().summaries.get(key) ?? null;
  },
  async putSummary(key, _chatId, text) {
    d().summaries.set(key, text);
  },
  async listMissions() {
    return clone([...d().missions.values()]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getMission(id) {
    const m = d().missions.get(id);
    return m ? clone(m) : null;
  },
  async saveMission(m) {
    d().missions.set(m.id, clone(m));
  },
  async listDecisions(filter = {}) {
    return clone([...d().decisions.values()])
      .filter((x) => (!filter.missionId || x.missionId === filter.missionId) && (!filter.status || x.status === filter.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async saveDecision(x) {
    d().decisions.set(x.id, clone(x));
  },
  async addMissionEvent(e) {
    d().missionEvents.push(clone(e));
  },
  async listMissionEvents(missionId) {
    return clone(d().missionEvents.filter((e) => e.missionId === missionId));
  },
  async listTeamDecisions() {
    return clone([...(d().teamDecisions ?? new Map()).values()]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async saveTeamDecision(x) {
    (d().teamDecisions ??= new Map()).set(x.id, clone(x));
  },
  async deleteChatMessages(chatId) {
    delete d().chats[chatId];
  },
  async week() {
    return clone(d().week);
  },
  async bumpWeek(kind) {
    bumpWeek(d(), kind);
  },
  async logEvent() {
    // The in-memory store keeps no event log.
  },
  async insertAction(a) {
    d().actions.set(a.id, clone(a));
  },
  async getAction(id) {
    const a = d().actions.get(id);
    return a ? clone(a) : null;
  },
  async transitionAction(id, from, to, patch) {
    const a = d().actions.get(id);
    if (!a || !from.includes(a.status)) return false;
    a.status = to;
    if (patch && "undoUntil" in patch) a.undoUntil = patch.undoUntil ?? null;
    return true;
  },
  async enqueueRun(run) {
    const existing = [...d().runs.values()].find((r) => r.triggerMessageId === run.triggerMessageId && r.agentId === run.agentId);
    if (existing) return clone(existing);
    d().runs.set(run.id, clone(run));
    return clone(run);
  },
  async claimRun(id) {
    const r = d().runs.get(id);
    if (!r || r.attempts >= RUN_MAX_ATTEMPTS) return null;
    const stale = r.status === "running" && Date.now() - Date.parse(r.startedAt ?? "") > RUN_STALE_MS;
    if (r.status !== "queued" && !stale) return null;
    Object.assign(r, { status: "running", startedAt: new Date().toISOString(), attempts: r.attempts + 1 });
    return clone(r);
  },
  async finishRun(id, patch) {
    const r = d().runs.get(id);
    if (r) Object.assign(r, { ...patch, finishedAt: new Date().toISOString() });
  },
  async countRunsSince(chatId, since) {
    const t = Date.parse(since);
    return [...d().runs.values()].filter((r) => r.chatId === chatId && Date.parse(r.createdAt) > t).length;
  },
  async react(messageId, emoji, who, on) {
    for (const list of Object.values(d().chats)) {
      for (const m of list) {
        for (const n of [m, ...m.replies]) {
          if (n.id !== messageId) continue;
          const r = { ...(n.reactions ?? {}) };
          const people = (r[emoji] ?? []).filter((x) => x !== who);
          if (on) people.push(who);
          if (people.length) r[emoji] = people;
          else delete r[emoji];
          n.reactions = r;
          return;
        }
      }
    }
  },
  async listRecentRuns() {
    const since = Date.now() - RUN_RECENT_MS;
    return [...d().runs.values()].filter((r) => r.status === "queued" || r.status === "running" || Date.parse(r.finishedAt ?? "") > since).map(clone);
  },
  async reset() {
    resetDb(workspaceId);
  },
};
}

setDemoStoreFactory((id) => memoryStore(id, id === DEMO_WORKSPACE_ID ? "NW" : "T"));
