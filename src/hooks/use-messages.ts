"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api";
import { PEOPLE, CHAT_META } from "@/lib/constants";
import { mentionsAgent } from "@/lib/text";
import type { ChatId, Message, Ticket } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { useNotifyChat } from "./use-notify-chat";
import { queryKeys } from "./query-keys";

export function useMessages(chatId: ChatId | null) {
  return useQuery({
    queryKey: chatId ? queryKeys.messages(chatId) : ["messages", "none"],
    queryFn: () => api.getMessages(chatId as ChatId),
    enabled: !!chatId,
  });
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
    onMutate: async (input) => {
      // Optimistically show top-level messages immediately.
      if (input.threadId) return;
      const key = queryKeys.messages(input.chatId);
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<Message[]>(key, (old) => [
        ...(old ?? []),
        { id: `pending-${Date.now()}`, who: "me", time: "Sending…", text: input.text, replies: [] },
      ]);
    },
    onSettled: (_d, _e, input) => qc.invalidateQueries({ queryKey: queryKeys.messages(input.chatId) }),
    onSuccess: (_d, input) => {
      const role = useUiStore.getState().role;
      if (mentionsAgent(input.text, input.chatId)) agent.mutate({ ...input, role });
      else if (input.chatId === "aiko" || input.chatId === "ravi") teammate.mutate(input.chatId);
    },
  });
}
