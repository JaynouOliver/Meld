"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api";
import { PEOPLE, CHAT_META } from "@/lib/constants";
import { clock, displayTime } from "@/lib/format";
import { mentionsAgent } from "@/lib/text";
import type { PostMessageInput } from "@/lib/api";
import type { ChatId, Message, ReplyNode } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { trackRun, useAtlasAnswered } from "./use-agent-runs";
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
      const meta = CHAT_META[chatId];
      if (meta.kind === "dm") {
        setTimeout(() => useUiStore.getState().setTyping({ chat: chatId, thread: null, label: `${PEOPLE[meta.who].first} is typing…` }), 500);
      }
    },
    onSuccess: (_d, chatId) => notify(chatId),
    onSettled: () => useUiStore.getState().setTyping(null),
  });

  return useMutation({
    mutationFn: (input: PostMessageInput) => api.postMessage({ ...input, role: useUiStore.getState().role }),
    // Show the message instantly (top-level or in a thread); the server's copy replaces it.
    onMutate: async (input) => {
      const key = queryKeys.messages(input.chatId);
      await qc.cancelQueries({ queryKey: key });
      const pendingId = `pending-${Date.now()}`;
      const node = { id: pendingId, who: "me" as const, time: clock(), text: input.text };
      qc.setQueryData<Message[]>(key, (old) => insertMessage(old ?? [], node, input.threadId));
      return { pendingId };
    },
    onSuccess: (saved, input, ctx) => {
      const real = { ...saved, time: displayTime(saved.time) };
      qc.setQueryData<Message[]>(queryKeys.messages(input.chatId), (old) => replaceMessage(old ?? [], ctx.pendingId, real));
      const role = useUiStore.getState().role;
      // The server queued an Atlas run: its reply arrives when the run finishes.
      if (saved.runId) trackRun(qc, { id: saved.runId, chatId: input.chatId, threadId: input.threadId ?? null, status: "queued", result: null });
      else if (mentionsAgent(input.text, input.chatId)) agent.mutate({ ...input, role });
      else if (input.chatId === "aiko" || input.chatId === "ravi") teammate.mutate(input.chatId);
    },
    // On failure, drop the optimistic copy by reloading the chat from the server.
    onError: (_e, input) => qc.invalidateQueries({ queryKey: queryKeys.messages(input.chatId) }),
  });
}

type Draft = { id: string; who: Message["who"]; time: string; text: string; ticket?: string | null };

/** Add a message to the cached list: top-level, or as a reply at the end of its thread. */
function insertMessage(list: Message[], node: Draft, threadId?: string | null): Message[] {
  if (!threadId) return [...list, { ...node, replies: [] }];
  return list.map((m) => (m.id === threadId ? { ...m, replies: [...m.replies, node] } : m));
}

/** Swap the optimistic copy for the server's saved message, keeping its place. */
function replaceMessage(list: Message[], pendingId: string, saved: Message | ReplyNode): Message[] {
  const swap = <T extends { id: string; time: string }>(n: T): T => (n.id === pendingId ? { ...n, id: saved.id, time: saved.time } : n);
  return list.map((m) => ({ ...swap(m), replies: m.replies.map(swap) }));
}
