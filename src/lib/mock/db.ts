import type { ChatId, Message, ReplyNode, Ticket, WeekDay } from "../types";
import { todayIndex } from "../format";
import { SEED_CHATS, SEED_NEXT_NUM, SEED_TICKETS, SEED_WEEK } from "./seed";

/**
 * In-memory database for the hackathon build. Lives in the browser for the
 * session; reload resets it. Only src/lib/api talks to this module.
 */
export interface Db {
  tickets: Ticket[];
  chats: Record<ChatId, Message[]>;
  week: WeekDay[];
  nextNum: number;
}

export const db: Db = {
  tickets: structuredClone(SEED_TICKETS),
  chats: structuredClone(SEED_CHATS),
  week: structuredClone(SEED_WEEK),
  nextNum: SEED_NEXT_NUM,
};

export function bumpWeek(kind: "p" | "a") {
  db.week[todayIndex()][kind] += 1;
}

export function findNode(list: ReplyNode[] | undefined, id: string): ReplyNode | null {
  for (const n of list || []) {
    if (n.id === id) return n;
    const f = findNode(n.kids, id);
    if (f) return f;
  }
  return null;
}

/** Append a message to a chat, a thread, or a nested reply. */
export function appendMessage(
  chatId: ChatId,
  msg: Omit<Message, "replies">,
  threadId?: string | null,
  parentId?: string | null,
) {
  const chat = db.chats[chatId];
  if (threadId) {
    const root = chat.find((x) => x.id === threadId);
    if (root) {
      const node: ReplyNode = { ...msg, kids: [] };
      const parent = parentId ? findNode(root.replies, parentId) : null;
      if (parent) parent.kids.push(node);
      else root.replies.push(node);
      return node;
    }
  }
  const m: Message = { ...msg, replies: [] };
  chat.push(m);
  return m;
}
