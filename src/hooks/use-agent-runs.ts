"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import * as api from "@/lib/api";
import { replyIdFor, type RunResult, type RunStatus, type RunView } from "@/lib/agent/runs";
import type { ChatId, Message, Ticket } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { useNotifyChat } from "./use-notify-chat";
import { setRunProgress } from "./use-run-progress";
import { queryKeys } from "./query-keys";

const REMOTE = process.env.NEXT_PUBLIC_DATA_MODE !== "local";
const active = (r: RunView) => r.status === "queued" || r.status === "running";

/** Runs this tab started: when they finish, it also opens what Atlas made. */
const mine = new Set<string>();

/** Start watching a run this tab just enqueued (shows "Atlas is working…" at once). */
export function trackRun(qc: QueryClient, run: RunView) {
  mine.add(run.id);
  qc.setQueryData<RunView[]>(queryKeys.agentRuns, (old) => [...(old ?? []).filter((r) => r.id !== run.id), run]);
}

const runsQuery = {
  queryKey: queryKeys.agentRuns,
  queryFn: () => api.getAgentRuns(),
  enabled: REMOTE,
};

/** "Atlas is working…" for a chat (threadId null) or a thread, from anyone's run. */
export function useAtlasWorking(chatId: ChatId, threadId: string | null) {
  return !!useAtlasRun(chatId, threadId);
}

/**
 * Agent runs to show live in a chat or thread: in flight, or just finished with a reply
 * that hasn't reached this chat's messages yet (so the live bubble hands over to the real
 * message without a gap). Proactive checks that decided to stay quiet are left out.
 */
export function useLiveRuns(chatId: ChatId, threadId: string | null): RunView[] {
  const { data } = useQuery({
    ...runsQuery,
    select: (runs: RunView[]) => runs.filter((r) => r.chatId === chatId && (r.threadId ?? null) === threadId),
  });
  const { data: messages } = useQuery<Message[]>({ queryKey: queryKeys.messages(chatId), queryFn: () => api.getMessages(chatId), enabled: false });
  const delivered = (r: RunView) => {
    const id = replyIdFor(r.id);
    return !!messages?.some((m) => m.id === id || m.replies.some((x) => x.id === id));
  };
  const replied = (r: RunView) => (r.result?.touchedChats.length ?? 1) > 0;
  return (data ?? []).filter((r) => active(r) || (r.status === "done" && replied(r) && !delivered(r) && !gaveUp.has(r.id)));
}

/** The first live run in a chat or thread (Atlas's "working" state). */
export function useAtlasRun(chatId: ChatId, threadId: string | null): RunView | null {
  return useLiveRuns(chatId, threadId)[0] ?? null;
}

/** Agents with a run in flight right now (presence: working). */
export function useWorkingAgents(): Set<string> {
  const { data } = useQuery({ ...runsQuery, select: (runs: RunView[]) => runs.filter(active).map((r) => r.agentId ?? "atlas").join(",") });
  return new Set((data ?? "").split(",").filter(Boolean));
}

/** Runs whose reply we stopped waiting for (older finished runs, or the reply is elsewhere). */
const gaveUp = new Set<string>();

/** What to do in this tab once Atlas has answered (sync or queued). */
export function useAtlasAnswered() {
  const qc = useQueryClient();
  const notify = useNotifyChat();
  return useCallback(
    (res: RunResult, where: { threadId?: string | null }) => {
      const ui = useUiStore.getState();
      res.touchedChats.forEach((c) => notify(c));
      qc.invalidateQueries({ queryKey: queryKeys.tickets });
      qc.invalidateQueries({ queryKey: queryKeys.week });
      if (ui.ticketId && res.deleted.includes(ui.ticketId)) ui.closeTicket();
      if (res.openTicket && !where.threadId) {
        // Wait for the new ticket to be in cache before opening its panel.
        qc.refetchQueries({ queryKey: queryKeys.tickets }).then(() => {
          const t = qc.getQueryData<Ticket[]>(queryKeys.tickets)?.find((x) => x.id === res.openTicket);
          if (t) useUiStore.setState({ ticketId: t.id, threadId: null });
        });
      }
    },
    [qc, notify],
  );
}

/**
 * Follow Atlas runs (mounted once, in the app shell). Polls while any run is in flight;
 * realtime pings refresh it otherwise. When a run finishes, refetch what it changed.
 */
export function useAgentRunsSync() {
  const answered = useAtlasAnswered();
  const { data } = useQuery({
    ...runsQuery,
    // Polls while a run is in flight (realtime usually gets there first).
    refetchInterval: (q) => ((q.state.data ?? []).some(active) ? 1000 : false),
  });
  const seen = useRef(new Map<string, RunStatus>());

  useEffect(() => {
    for (const r of data ?? []) {
      if (active(r) && (r.step || r.draft || r.note)) setRunProgress(r.id, { step: r.step ?? null, draft: r.draft ?? null, note: r.note ?? null });
      const prev = seen.current.get(r.id);
      seen.current.set(r.id, r.status);
      if (active(r) || prev === r.status) continue;
      // Finished before this tab started watching: nothing to catch up on.
      if (prev === undefined && !mine.has(r.id)) {
        // Finished before this tab started watching: never show it as live.
        if (!active(r)) gaveUp.add(r.id);
        continue;
      }
      const res = r.result ?? { touchedChats: [r.chatId], openTicket: null, deleted: [] };
      if (mine.delete(r.id)) answered(res, r);
      else answered({ ...res, openTicket: null }, { threadId: r.threadId });
    }
  }, [data, answered]);
}
