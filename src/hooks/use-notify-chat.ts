"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { ChatId } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { useActiveChat } from "./use-active-chat";
import { queryKeys } from "./query-keys";

/** A chat got a new message on the server: refetch it and badge it if the user isn't looking. */
export function useNotifyChat() {
  const qc = useQueryClient();
  const active = useActiveChat();
  const bumpUnread = useUiStore((s) => s.bumpUnread);
  return useCallback(
    (chat: ChatId) => {
      qc.invalidateQueries({ queryKey: queryKeys.messages(chat) });
      if (chat !== active) bumpUnread(chat);
    },
    [qc, active, bumpUnread],
  );
}
