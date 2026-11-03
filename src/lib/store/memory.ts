import { appendMessage, bumpWeek, db, resetDb } from "../mock/db";
import type { ChatId, Message, ReplyNode } from "../types";
import type { MessageHit, Store } from "./types";

const clone = <T,>(x: T): T => structuredClone(x);

/** Every message in conversation order, flattened, with its thread root. */
function allMessages(): MessageHit[] {
  const out: MessageHit[] = [];
  for (const [chatId, msgs] of Object.entries(db.chats) as [ChatId, Message[]][]) {
    for (const m of msgs) {
      out.push({ chatId, id: m.id, threadId: null, who: m.who, time: m.time, text: m.text });
      const walk = (nodes: ReplyNode[]) =>
        nodes.forEach((n) => {
          out.push({ chatId, id: n.id, threadId: m.id, who: n.who, time: n.time, text: n.text });
          walk(n.kids);
        });
      walk(m.replies);
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
    return clone(db.chats[chatId] ?? []);
  },
  async appendMessage(chatId, msg, threadId, parentId) {
    return clone(appendMessage(chatId, msg, threadId, parentId));
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
  async reset() {
    resetDb();
  },
};
