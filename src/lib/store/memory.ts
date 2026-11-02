import { appendMessage, bumpWeek, db, resetDb } from "../mock/db";
import type { ChatId, Message, ReplyNode } from "../types";
import type { Store } from "./types";

const clone = <T,>(x: T): T => structuredClone(x);

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
    const out: Awaited<ReturnType<Store["searchMessages"]>> = [];
    const visit = (chatId: ChatId, m: Message | ReplyNode) => {
      const lower = m.text.toLowerCase();
      if (terms.some((w) => lower.includes(w))) out.push({ chatId, id: m.id, who: m.who, time: m.time, text: m.text });
      ("replies" in m ? m.replies : m.kids).forEach((r) => visit(chatId, r));
    };
    for (const [chatId, msgs] of Object.entries(db.chats) as [ChatId, Message[]][]) msgs.forEach((m) => visit(chatId, m));
    return out.slice(-limit * 3);
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
