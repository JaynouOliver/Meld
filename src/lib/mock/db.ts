import type { ChatId, Message, ReplyNode, Ticket, WeekDay } from "../types";
import { todayIndex } from "../format";
import { SEED_CHATS, SEED_NEXT_NUM, SEED_TICKETS, SEED_WEEK } from "./seed";

/**
 * In-memory database for the hackathon build. Runs in the Next.js server process
 * (or in the browser for the single-file preview). Restarting resets it.
 * Only src/lib/api and src/server talk to this module.
 */
export interface Db {
  tickets: Ticket[];
  chats: Record<ChatId, Message[]>;
  week: WeekDay[];
  nextNum: number;
}

function seed(): Db {
  return {
    tickets: structuredClone(SEED_TICKETS),
    chats: structuredClone(SEED_CHATS),
    week: structuredClone(SEED_WEEK),
    nextNum: SEED_NEXT_NUM,
  };
}

// One instance per process: Next may load this module in several route bundles.
const g = globalThis as typeof globalThis & { __meldDb?: Db };
export const db: Db = (g.__meldDb ??= seed());

/** Back to seed data (used by evals and the demo reset). */
export function resetDb() {
  Object.assign(db, seed());
}

export function bumpWeek(kind: "p" | "a") {
  db.week[todayIndex()][kind] += 1;
}

/** Append a message to a chat, or a reply to a thread (threads are flat). */
export function appendMessage(chatId: ChatId, msg: Omit<Message, "replies">, threadId?: string | null) {
  const chat = db.chats[chatId];
  if (threadId) {
    const root = chat.find((x) => x.id === threadId);
    if (root) {
      const node: ReplyNode = { ...msg };
      root.replies.push(node);
      return node;
    }
  }
  const m: Message = { ...msg, replies: [] };
  chat.push(m);
  return m;
}
