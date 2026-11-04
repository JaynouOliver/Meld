"use client";

import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import * as api from "@/lib/api";
import { mergeLatest, mergeWindow, reachedStart } from "@/lib/chat-history";
import type { ChatId, Message } from "@/lib/types";
import { queryKeys } from "./query-keys";

/** How many conversations a jump loads on each side, and a "Load older/newer" page. */
export const AROUND = 30;
export const PAGE = 50;

interface Meta {
  /** Last loaded message before history that isn't loaded yet (see lib/chat-history.ts). */
  gapAfter: string | null;
  /** Older history was merged in, so a refetch of the latest window must keep it. */
  extended: boolean;
  /** The first conversation of the chat is loaded. */
  olderDone: boolean;
  /** Bumped when a jump target couldn't be found (deleted, or no longer visible). */
  missed: number;
}

const EMPTY: Meta = { gapAfter: null, extended: false, olderDone: false, missed: 0 };

/** Per-chat history state. Not persisted: after a reload a chat starts from its latest window. */
export const useHistoryStore = create<{ chats: Partial<Record<ChatId, Meta>> }>(() => ({ chats: {} }));

const meta = (chatId: ChatId): Meta => useHistoryStore.getState().chats[chatId] ?? EMPTY;
const patch = (chatId: ChatId, p: Partial<Meta>) =>
  useHistoryStore.setState((s) => ({ chats: { ...s.chats, [chatId]: { ...EMPTY, ...s.chats[chatId], ...p } } }));

export function useHistoryMeta(chatId: ChatId): Meta {
  return useHistoryStore((s) => s.chats[chatId]) ?? EMPTY;
}

/**
 * Whether there may be older conversations above the first loaded one. The boot payload
 * holds 30 per chat and a chat's window 100: a list of any other length is the whole chat.
 */
export function mayHaveOlder(list: Message[] | undefined, m: Meta): boolean {
  if (!list?.length || m.olderDone) return false;
  return m.extended || list.length === 30 || list.length >= 100;
}

/**
 * The query function for a chat's messages: its latest window, keeping any older history
 * the person loaded (a realtime refetch must not throw away the conversation they jumped to).
 */
export async function fetchLatest(qc: QueryClient, chatId: ChatId): Promise<Message[]> {
  const fresh = await api.getMessages(chatId);
  const m = meta(chatId);
  if (!m.extended) return fresh;
  // Read the cache after the fetch: a window merged meanwhile must survive.
  const cur = qc.getQueryData<Message[]>(queryKeys.messages(chatId)) ?? [];
  const h = mergeLatest({ messages: cur, gapAfter: m.gapAfter }, fresh, true);
  patch(chatId, { gapAfter: h.gapAfter, extended: h.messages.length > fresh.length });
  return h.messages;
}

/** Fetch the conversations around `anchorId` and merge them into the chat's cache. */
async function loadWindow(qc: QueryClient, chatId: ChatId, anchorId: string, before: number, after: number): Promise<Message[]> {
  const win = await api.getMessagesAround(chatId, anchorId, before, after);
  if (!win.length) return win;
  const key = queryKeys.messages(chatId);
  const cur = qc.getQueryData<Message[]>(key) ?? [];
  const m = meta(chatId);
  const h = mergeWindow({ messages: cur, gapAfter: m.gapAfter }, win);
  // Only a window that now starts the list says anything about older history.
  const first = h.messages[0]?.id === win[0].id;
  patch(chatId, { gapAfter: h.gapAfter, extended: true, olderDone: first ? before > 0 && reachedStart(win, anchorId, before) : m.olderDone });
  qc.setQueryData<Message[]>(key, h.messages);
  return win;
}

/** Load the conversation around a message that isn't loaded. False if it doesn't exist (any more). */
export async function loadAround(qc: QueryClient, chatId: ChatId, messageId: string): Promise<boolean> {
  const win = await loadWindow(qc, chatId, messageId, AROUND, AROUND);
  const found = win.some((m) => m.id === messageId || m.replies.some((r) => r.id === messageId));
  if (!found) patch(chatId, { missed: meta(chatId).missed + 1 });
  return found;
}

/** "Load older messages": the page before the first loaded conversation. */
export async function loadOlder(qc: QueryClient, chatId: ChatId, firstId: string): Promise<void> {
  const win = await loadWindow(qc, chatId, firstId, PAGE, 0);
  if (win.length <= 1) patch(chatId, { olderDone: true });
}

/** "Load newer messages" at the gap: the page after the last conversation before it. */
export async function loadNewer(qc: QueryClient, chatId: ChatId, lastId: string): Promise<void> {
  await loadWindow(qc, chatId, lastId, 0, PAGE);
}
