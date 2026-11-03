"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api";
import { useUiStore } from "@/stores/ui-store";
import { useNotifyChat } from "./use-notify-chat";
import { queryKeys } from "./query-keys";

/** Confirm, cancel or undo an Atlas action card. */
export function useDecideAction() {
  const qc = useQueryClient();
  const notify = useNotifyChat();
  return useMutation({
    mutationFn: (input: Omit<api.DecideActionInput, "role">) => api.decideAction({ ...input, role: useUiStore.getState().role }),
    onSuccess: (res) => {
      res.chats.forEach((c) => notify(c));
      qc.invalidateQueries({ queryKey: queryKeys.tickets });
      qc.invalidateQueries({ queryKey: queryKeys.week });
    },
    // A stale card (decided elsewhere) refreshes to its real state.
    onError: () => qc.invalidateQueries({ queryKey: queryKeys.allMessages }),
  });
}
