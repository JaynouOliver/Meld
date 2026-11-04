"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import * as remote from "@/lib/api/remote";
import { queryKeys } from "./query-keys";
import { useRole } from "./use-directory";

const REMOTE = process.env.NEXT_PUBLIC_DATA_MODE !== "local";
const REMINDERS = ["reminders"] as const;
/** How often an open tab asks the server to deliver due reminders and digests. */
const POLL_MS = 60_000;

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/**
 * While a tab is open: once a minute (and on load), report this browser's time zone and
 * deliver anything due (src/server/scheduled). Chats that got a post refetch right away,
 * so a reminder shows up even where realtime isn't connected.
 */
export function useDeliverDue() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!REMOTE) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const { chats } = await remote.deliverDue(browserZone());
        if (stopped || !chats.length) return;
        for (const chat of chats) {
          // Already showing it (realtime got there first)? A refetch is harmless.
          qc.invalidateQueries({ queryKey: queryKeys.messages(chat) });
        }
        qc.invalidateQueries({ queryKey: REMINDERS });
      } catch {
        // Best-effort: the next tick, a request's sweep or the daily cron delivers it.
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [qc]);
}

/** Upcoming reminders I set or that are for me, soonest first. */
export function useReminders() {
  return useQuery({ queryKey: REMINDERS, queryFn: remote.listReminders, enabled: REMOTE, staleTime: 5_000, refetchInterval: POLL_MS });
}

export function useCancelReminder() {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: (id: string) => remote.cancelReminder(id, role),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: REMINDERS });
      const prev = qc.getQueryData<remote.ReminderView[]>(REMINDERS);
      qc.setQueryData<remote.ReminderView[]>(REMINDERS, (old) => old?.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _id, c) => qc.setQueryData(REMINDERS, c?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: REMINDERS }),
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: (input: remote.NewReminder) => remote.createReminder({ ...input, role, timeZone: input.timeZone ?? browserZone() }),
    onSettled: () => qc.invalidateQueries({ queryKey: REMINDERS }),
  });
}

/** "Post digest now" (Sunny's profile): posts in the channel and opens it. */
export function usePostDigest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) => remote.postDigestNow(chatId),
    onSuccess: (_r, chatId) => {
      qc.invalidateQueries({ queryKey: queryKeys.messages(chatId) });
    },
  });
}
