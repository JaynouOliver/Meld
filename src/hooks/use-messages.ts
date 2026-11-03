"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api";
import { PEOPLE, CHAT_META } from "@/lib/constants";
import { clock, displayTime } from "@/lib/format";
import { mentionsAgent } from "@/lib/text";
import type { ChatId, Message, ReplyNode, Ticket } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
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

  const agent = useMutation({
    mutationFn: api.askAtlas,
    onMutate: (input) => {
      useUiStore.getState().setTyping({ chat: input.chatId, thread: input.threadId ?? null, label: "Atlas is working…" });
    },
    onSuccess: (res, input) => {
      const ui = useUiStore.getState();
      res.touchedChats.forEach((c) => notify(c));
      qc.invalidateQueries({ queryKey: queryKeys.tickets });
      qc.invalidateQueries({ queryKey: queryKeys.week });
      if (input.parentId) ui.setExpanded(input.parentId, true);
      if (ui.ticketId && res.deleted.includes(ui.ticketId)) ui.closeTicket();
      if (res.openTicket && !input.threadId) {
        // Wait for the new ticket to be in cache before opening its panel.
        qc.refetchQueries({ queryKey: queryKeys.tickets }).then(() => {
          const t = qc.getQueryData<Ticket[]>(queryKeys.tickets)?.find((x) => x.id === res.openTicket);
          if (t) useUiStore.setState({ ticketId: t.id, threadId: null, replyTo: null });
        });
      }
    },
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
    mutationFn: api.postMessage,
    // Show the message instantly (top-level or in a thread); the server's copy replaces it.
    onMutate: async (input) => {
      const key = queryKeys.messages(input.chatId);
      await qc.cancelQueries({ queryKey: key });
      const pendingId = `pending-${Date.now()}`;
      const node = { id: pendingId, who: "me" as const, time: clock(), text: input.text };
      qc.setQueryData<Message[]>(key, (old) => insertMessage(old ?? [], node, input.threadId, input.parentId));
      return { pendingId };
    },
    onSuccess: (saved, input, ctx) => {
      const real = { ...saved, time: displayTime(saved.time) };
      qc.setQueryData<Message[]>(queryKeys.messages(input.chatId), (old) => replaceMessage(old ?? [], ctx.pendingId, real));
      const role = useUiStore.getState().role;
      if (mentionsAgent(input.text, input.chatId)) agent.mutate({ ...input, role });
      else if (input.chatId === "aiko" || input.chatId === "ravi") teammate.mutate(input.chatId);
    },
    // On failure, drop the optimistic copy by reloading the chat from the server.
    onError: (_e, input) => qc.invalidateQueries({ queryKey: queryKeys.messages(input.chatId) }),
  });
}

type Draft = { id: string; who: Message["who"]; time: string; text: string; ticket?: string | null };

/** Add a message to the cached tree: top-level, or as a reply in a thread (under a parent reply). */
function insertMessage(list: Message[], node: Draft, threadId?: string | null, parentId?: string | null): Message[] {
  if (!threadId) return [...list, { ...node, replies: [] }];
  const reply: ReplyNode = { ...node, kids: [] };
  return list.map((m) => {
    if (m.id !== threadId) return m;
    if (!parentId) return { ...m, replies: [...m.replies, reply] };
    const add = (nodes: ReplyNode[]): ReplyNode[] =>
      nodes.map((n) => (n.id === parentId ? { ...n, kids: [...n.kids, reply] } : { ...n, kids: add(n.kids) }));
    return { ...m, replies: add(m.replies) };
  });
}

/** Swap the optimistic copy for the server's saved message, keeping its place. */
function replaceMessage(list: Message[], pendingId: string, saved: Message | ReplyNode): Message[] {
  const swapNodes = (nodes: ReplyNode[]): ReplyNode[] =>
    nodes.map((n) => (n.id === pendingId ? { ...n, id: saved.id, time: saved.time } : { ...n, kids: swapNodes(n.kids) }));
  return list.map((m) => (m.id === pendingId ? { ...m, id: saved.id, time: saved.time } : { ...m, replies: swapNodes(m.replies) }));
}
