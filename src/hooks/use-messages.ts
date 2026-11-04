"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api";
import { ATLAS_ID, atlasDmOf, personOf } from "@/lib/directory";
import { clock, displayTime } from "@/lib/format";
import { deleteInList, editInList, pinInList, reactInList } from "@/lib/message-ops";
import { mentionsAgent } from "@/lib/text";
import type { PostMessageInput } from "@/lib/api";
import type { ChatId, Message, ReplyNode } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { trackRun, useAtlasAnswered } from "./use-agent-runs";
import { useDirectory, useRole } from "./use-directory";
import { useHydrated } from "./use-hydrated";
import { useNotifyChat } from "./use-notify-chat";
import { queryKeys } from "./query-keys";

export function useMessages(chatId: ChatId | null) {
  const hydrated = useHydrated();
  const q = useQuery({
    queryKey: chatId ? queryKeys.messages(chatId) : ["messages", "none"],
    queryFn: () => api.getMessages(chatId as ChatId),
    enabled: !!chatId,
  });
  // Until hydration finishes, match the server's HTML (no messages yet); see use-hydrated.ts.
  return hydrated ? q : { ...q, data: undefined, isPending: true as const };
}

/**
 * Send a message to a chat, thread, or nested reply. If it addresses Atlas
 * (or it's the Atlas DM), the agent runs and its reply streams in afterwards.
 */
export function useSendMessage() {
  const qc = useQueryClient();
  const notify = useNotifyChat();
  const dir = useDirectory();
  const role = useRole();

  const answered = useAtlasAnswered();

  // Rule-based Atlas (browser preview, or no model configured): answers in the same call.
  const agent = useMutation({
    mutationFn: api.askAtlas,
    onMutate: (input) => {
      useUiStore.getState().setTyping({ chat: input.chatId, thread: input.threadId ?? null, label: "Atlas is working…" });
    },
    onSuccess: (res, input) => answered(res, input),
    onSettled: () => useUiStore.getState().setTyping(null),
  });

  const teammate = useMutation({
    mutationFn: api.teammateReply,
    onMutate: (chatId) => {
      const meta = dir.chats[chatId];
      if (meta?.kind === "dm") {
        setTimeout(() => useUiStore.getState().setTyping({ chat: chatId, thread: null, label: `${personOf(dir, meta.who).first} is typing…` }), 500);
      }
    },
    onSuccess: (_d, chatId) => notify(chatId),
    onSettled: () => useUiStore.getState().setTyping(null),
  });

  // The sample workspace's teammates answer their DMs (see api.teammateReply).
  const isDemoTeammateDm = (chatId: ChatId) => {
    const meta = dir.chats[chatId];
    return dir.demo && meta?.kind === "dm" && meta.who !== ATLAS_ID;
  };

  return useMutation({
    mutationFn: (input: PostMessageInput) => api.postMessage({ ...input, role }),
    // Show the message instantly (top-level or in a thread); the server's copy replaces it.
    onMutate: async (input) => {
      const key = queryKeys.messages(input.chatId);
      await qc.cancelQueries({ queryKey: key });
      const pendingId = `pending-${Date.now()}`;
      const node = { id: pendingId, who: dir.me, time: clock(), text: input.text };
      qc.setQueryData<Message[]>(key, (old) => insertMessage(old ?? [], node, input.threadId));
      return { pendingId };
    },
    onSuccess: (saved, input, ctx) => {
      const real = { ...saved, time: displayTime(saved.time) };
      qc.setQueryData<Message[]>(queryKeys.messages(input.chatId), (old) => replaceMessage(old ?? [], ctx.pendingId, real));
      // The server queued agent runs (any agents tagged or listening): replies arrive when
      // they finish. `runs` is absent only without a model (preview): rule-based Atlas then.
      if (saved.runs) for (const r of saved.runs) trackRun(qc, r);
      else if (mentionsAgent(input.text, input.chatId, atlasDmOf(dir))) agent.mutate({ ...input, role });
      if (isDemoTeammateDm(input.chatId)) teammate.mutate(input.chatId);
    },
    // On failure, drop the optimistic copy by reloading the chat from the server.
    onError: (_e, input) => qc.invalidateQueries({ queryKey: queryKeys.messages(input.chatId) }),
  });
}

type Draft = { id: string; who: Message["who"]; time: string; text: string; ticket?: string | null };

/** Add a message to the cached list: top-level, or as a reply at the end of its thread. */
export function insertMessage(list: Message[], node: Draft, threadId?: string | null): Message[] {
  if (!threadId) return [...list, { ...node, replies: [] }];
  return list.map((m) => (m.id === threadId ? { ...m, replies: [...m.replies, node] } : m));
}

/** Swap the optimistic copy for the server's saved message, keeping its place. */
function replaceMessage(list: Message[], pendingId: string, saved: Message | ReplyNode): Message[] {
  const swap = <T extends { id: string; time: string }>(n: T): T => (n.id === pendingId ? { ...n, id: saved.id, time: saved.time } : n);
  return list.map((m) => ({ ...swap(m), replies: m.replies.map(swap) }));
}

// ---------------------------------------------------------------- edit, delete, pin, react

/**
 * Optimistic change to one chat's cached messages: apply `fn` now, roll back if the
 * server refuses, and refetch the chat's pins afterwards (they live under its key).
 */
function useMessageChange<I extends { chatId: ChatId }>(run: (input: I) => Promise<unknown>, fn: (list: Message[], input: I) => Message[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onMutate: async (input: I) => {
      const key = queryKeys.messages(input.chatId);
      await qc.cancelQueries({ queryKey: key, exact: true });
      const before = qc.getQueryData<Message[]>(key);
      if (before) qc.setQueryData<Message[]>(key, fn(before, input));
      return { before };
    },
    onError: (_e, input, ctx) => {
      if (ctx?.before) qc.setQueryData(queryKeys.messages(input.chatId), ctx.before);
      qc.invalidateQueries({ queryKey: queryKeys.messages(input.chatId) });
    },
    onSettled: (_d, _e, input) => qc.invalidateQueries({ queryKey: queryKeys.pins(input.chatId) }),
  });
}

export function useEditMessage() {
  const role = useRole();
  return useMessageChange(
    (i: { chatId: ChatId; id: string; text: string }) => api.editMessage({ id: i.id, text: i.text, role }),
    (list, i) => editInList(list, i.id, i.text.trim(), new Date().toISOString()),
  );
}

export function useDeleteMessage() {
  const role = useRole();
  return useMessageChange(
    (i: { chatId: ChatId; id: string }) => api.deleteMessage({ id: i.id, role }),
    (list, i) => deleteInList(list, i.id, new Date().toISOString()),
  );
}

export function usePinMessage() {
  const role = useRole();
  const me = useDirectory().me;
  return useMessageChange(
    (i: { chatId: ChatId; id: string; on: boolean }) => api.pinMessage({ id: i.id, on: i.on, role }),
    (list, i) => pinInList(list, i.id, i.on ? new Date().toISOString() : null, i.on ? me : null),
  );
}

export function useToggleReaction() {
  const me = useDirectory().me;
  return useMessageChange(
    (i: { chatId: ChatId; id: string; emoji: string; on: boolean }) => api.toggleReaction({ id: i.id, emoji: i.emoji, on: i.on }),
    (list, i) => reactInList(list, i.id, i.emoji, me, i.on),
  );
}

/** A chat's pinned messages (server list: pins can be older than the loaded window). */
export function usePinned(chatId: ChatId, enabled = true) {
  return useQuery({ queryKey: queryKeys.pins(chatId), queryFn: () => api.getPinned(chatId), enabled });
}
