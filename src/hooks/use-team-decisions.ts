"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as remote from "@/lib/api/remote";
import { queryKeys } from "./query-keys";
import { useRole } from "./use-directory";

const REMOTE = process.env.NEXT_PUBLIC_DATA_MODE !== "local";

/** The team's decision memory (newest first). */
export function useTeamDecisions() {
  return useQuery({ queryKey: queryKeys.teamDecisions, queryFn: remote.listTeamDecisions, enabled: REMOTE, staleTime: 10_000 });
}

export function useSetDecisionStatus() {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: (v: { id: string; status: "active" | "reopened" }) => remote.setTeamDecisionStatus(v.id, v.status, role),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.teamDecisions }),
  });
}
