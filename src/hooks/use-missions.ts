"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as remote from "@/lib/api/remote";
import { queryKeys } from "./query-keys";
import { useRole } from "./use-directory";

const REMOTE = process.env.NEXT_PUBLIC_DATA_MODE !== "local";

/** Missions in this workspace (with progress and open decisions). */
export function useMissions() {
  return useQuery({ queryKey: queryKeys.missions, queryFn: remote.listMissions, enabled: REMOTE, staleTime: 10_000 });
}

/** One mission with its live tickets, decisions and timeline. Polls while it's being planned. */
export function useMission(id: string) {
  return useQuery({
    queryKey: queryKeys.mission(id),
    queryFn: () => remote.getMission(id),
    enabled: REMOTE,
    refetchInterval: (q) => (q.state.data?.mission.status === "planning" ? 1200 : false),
  });
}

/** Decisions agents are waiting on, across missions: the "Needs you" queue. */
export function useOpenDecisions() {
  return useQuery({ queryKey: queryKeys.decisions, queryFn: remote.openDecisions, enabled: REMOTE, staleTime: 10_000 });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.missions });
    qc.invalidateQueries({ queryKey: queryKeys.decisions });
    qc.invalidateQueries({ queryKey: queryKeys.tickets });
  };
}

export function useMissionActions(id: string) {
  const role = useRole();
  const refresh = useRefresh();
  return {
    launch: useMutation({ mutationFn: () => remote.launchMission(id, role), onSettled: refresh }),
    cancel: useMutation({ mutationFn: () => remote.cancelMission(id), onSettled: refresh }),
    checkIn: useMutation({ mutationFn: () => remote.checkInMission(id, role), onSettled: refresh }),
    answer: useMutation({
      mutationFn: (v: { decisionId: string; answer: string }) => remote.answerDecision(v.decisionId, v.answer, role),
      onSettled: refresh,
    }),
  };
}
