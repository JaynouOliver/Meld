/**
 * Message edit, delete, pin and reaction rules, shared by the server (permission checks
 * in src/lib/api/service.ts) and the browser (which buttons to show, optimistic cache
 * updates in src/hooks/use-messages.ts). Pure: no store, no React.
 */
import type { ChatId, Message, PersonId, ReplyNode, Role } from "./types";

/** Who is acting: their id, effective role, and whether the message's author is an agent. */
export interface MessageActor {
  me: PersonId;
  role: Role;
}

/** What the rules need to know about a message. */
export interface MessageFacts {
  who: PersonId;
  /** Written by an agent (Atlas or a custom agent). */
  byAgent: boolean;
  deletedAt?: string | null;
}

/** People edit only their own messages; nobody edits an agent's words or a deleted message. */
export function canEditMessage(a: MessageActor, m: MessageFacts): boolean {
  return !m.deletedAt && !m.byAgent && m.who === a.me;
}

/** Your own messages, or anyone's if you're an org owner (the only role that can remove agent messages). */
export function canDeleteMessage(a: MessageActor, m: MessageFacts): boolean {
  if (m.deletedAt) return false;
  if (a.role === "owner") return true;
  return !m.byAgent && m.who === a.me;
}

/** Any member can pin; guests only read along. */
export function canPinMessage(role: Role): boolean {
  return role !== "guest";
}

/** A deleted thread root with replies stays as a placeholder so the thread survives. */
export function deleteKeepsPlaceholder(isRoot: boolean, replyCount: number): boolean {
  return isRoot && replyCount > 0;
}

/** Reactions offered by the picker, with names for screen readers. */
export const PICKER_EMOJI: [emoji: string, name: string][] = [
  ["👍", "thumbs up"], ["❤️", "heart"], ["😂", "laughing"], ["🎉", "party"], ["🙏", "thank you"], ["👀", "looking"],
  ["✅", "done"], ["🔥", "fire"], ["😮", "surprised"], ["😢", "sad"], ["🚀", "rocket"], ["💯", "100"],
  ["👏", "clapping"], ["🤔", "thinking"], ["✍️", "writing"], ["➕", "plus one"], ["🙌", "raised hands"], ["⏰", "alarm clock"],
];

/** A reaction is one short emoji-ish token (no spaces), so nothing else can ride in it. */
export function validReaction(emoji: unknown): emoji is string {
  return typeof emoji === "string" && emoji.length > 0 && emoji.length <= 16 && !/[\s<>]/.test(emoji);
}

// ---------------------------------------------------------------- cache updates

type Node = Message | ReplyNode;

/** Apply `fn` to the message or reply with this id, leaving everything else as is. */
export function patchNode(list: Message[], id: string, fn: <T extends Node>(n: T) => T): Message[] {
  return list.map((m) => {
    if (m.id === id) return fn(m);
    if (!m.replies.some((r) => r.id === id)) return m;
    return { ...m, replies: m.replies.map((r) => (r.id === id ? fn(r) : r)) };
  });
}

export function editInList(list: Message[], id: string, text: string, editedAt: string): Message[] {
  return patchNode(list, id, (n) => ({ ...n, text, editedAt }));
}

/**
 * Remove a message from a chat's list. A root with replies becomes a placeholder; a
 * placeholder whose last reply is deleted goes away too.
 */
export function deleteInList(list: Message[], id: string, deletedAt: string): Message[] {
  const out: Message[] = [];
  for (const m of list) {
    if (m.id === id) {
      if (deleteKeepsPlaceholder(true, m.replies.length)) out.push(tombstone(m, deletedAt));
      continue;
    }
    if (m.replies.some((r) => r.id === id)) {
      const replies = m.replies.filter((r) => r.id !== id);
      if (m.deletedAt && !replies.length) continue;
      out.push({ ...m, replies });
      continue;
    }
    out.push(m);
  }
  return out;
}

/** What a deleted root keeps: its place, author and replies; never its words, pin or reactions. */
export function tombstone<T extends Node>(m: T, deletedAt: string): T {
  return { ...m, text: "", ticket: null, action: null, reactions: {}, pinnedAt: null, pinnedBy: null, deletedAt };
}

export function reactInList(list: Message[], id: string, emoji: string, who: PersonId, on: boolean): Message[] {
  return patchNode(list, id, (n) => ({ ...n, reactions: toggled(n.reactions, emoji, who, on) }));
}

/** Same rule as store.react: add or remove `who` under `emoji`, dropping empty emoji. */
export function toggled(reactions: Record<string, PersonId[]> | undefined, emoji: string, who: PersonId, on: boolean) {
  const r = { ...(reactions ?? {}) };
  const people = (r[emoji] ?? []).filter((x) => x !== who);
  if (on) people.push(who);
  if (people.length) r[emoji] = people;
  else delete r[emoji];
  return r;
}

export function pinInList(list: Message[], id: string, pinnedAt: string | null, pinnedBy: PersonId | null): Message[] {
  return patchNode(list, id, (n) => ({ ...n, pinnedAt, pinnedBy }));
}

/** Find a message or reply in a chat's list, with its thread root id (null for roots). */
export function findInList(list: Message[] | undefined, id: string): { node: Node; threadId: string | null } | null {
  for (const m of list ?? []) {
    if (m.id === id) return { node: m, threadId: null };
    const r = m.replies.find((x) => x.id === id);
    if (r) return { node: r, threadId: m.id };
  }
  return null;
}

// ---------------------------------------------------------------- search

/** Words worth searching for: lowercased, 2+ characters, at most six. */
export function searchTerms(query: string): string[] {
  return [...new Set(String(query ?? "").toLowerCase().split(/\s+/).filter((t) => t.length >= 2))].slice(0, 6);
}

/**
 * Search hits this person may see: only chats in their directory (their workspace's
 * channels and their own DMs), never deleted placeholders. Hits matching more of the
 * words come first; otherwise the store's order is kept.
 */
export function visibleHits<T extends { chatId: ChatId; text: string }>(hits: T[], chats: Record<ChatId, unknown>, terms: string[]): T[] {
  const score = (h: T) => terms.filter((t) => h.text.toLowerCase().includes(t)).length;
  return hits
    .filter((h) => Object.prototype.hasOwnProperty.call(chats, h.chatId) && h.text.trim())
    .map((h, i) => ({ h, i, s: score(h) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.h);
}
