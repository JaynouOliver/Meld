import "server-only";

import { currentCtx } from "@/lib/context";
import { agentModeIn, ATLAS_ID, personOf } from "@/lib/directory";
import { conversationsOf, linkCandidate, linkKey, LINK_MIN_SHARED, LINK_WINDOW_MS, topicWords, type Conversation } from "@/lib/proactive";
import type { ChatId, PersonId } from "@/lib/types";

/**
 * Linked threads: a new top-level message on the same topic as a conversation active in
 * another channel this week gets one "Related:" reply pointing to it. Two steps, so it
 * stays cheap and precise: a free word-overlap filter picks at most one candidate (one
 * store read), then the listener's single model call confirms it's the same topic. Each
 * (channel, conversation) pair is linked at most once, enforced by a unique key.
 */

/** The one conversation worth asking the model about, or null (no model, one read). */
export async function relatedCandidate(m: { chatId: ChatId; threadId: string | null; messageId: string; text: string }): Promise<(Conversation & { shared: string[] }) | null> {
  const { dir, store } = currentCtx();
  if (m.threadId || dir.chats[m.chatId]?.kind !== "channel") return null;
  if (topicWords(m.text).size < LINK_MIN_SHARED) return null;
  const now = Date.now();
  const [hits, links] = await Promise.all([store.messagesSince(new Date(now - LINK_WINDOW_MS).toISOString(), 400), store.listThreadLinks()]);
  return linkCandidate({ chatId: m.chatId, messageId: m.messageId, text: m.text }, conversationsOf(hits), {
    now,
    // Channels the author can open, where Atlas reads along.
    visible: (id) => dir.chats[id]?.kind === "channel" && agentModeIn(dir, id, ATLAS_ID) !== null,
    isPerson: (id: PersonId) => !!dir.people[id] && !dir.people[id].isAgent,
    linked: new Set(links.map((l) => l.key)),
  });
}

/** Claim the link (false if this pair was linked before) and return the reply line. */
export async function claimLink(
  m: { chatId: ChatId; messageId: string },
  to: { chatId: ChatId; rootId: string; who?: PersonId; text?: string },
  replyId: string,
): Promise<string | null> {
  const { dir, store } = currentCtx();
  const meta = dir.chats[to.chatId];
  if (to.chatId === m.chatId || meta?.kind !== "channel") return null;
  const ok = await store.addThreadLink({
    key: linkKey(m.chatId, to.rootId), chatId: m.chatId, messageId: m.messageId, toChatId: to.chatId, toMessageId: to.rootId, replyId, createdAt: new Date().toISOString(),
  });
  if (!ok) return null;
  const said = (to.text ?? "").replace(/\s+/g, " ").replace(/\[\[cite:[^\]]*\]\]/g, "").trim();
  const quote = said ? ` ${personOf(dir, to.who ?? "").first}: "${said.length > 90 ? `${said.slice(0, 88).trimEnd()}…` : said}"` : "";
  return `Related: this is also being discussed in #${meta.label}.${quote} [[cite:${to.chatId}:-:${to.rootId}]]`;
}
