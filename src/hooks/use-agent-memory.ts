"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as remote from "@/lib/api/remote";
import { useRole } from "./use-directory";

const REMOTE = process.env.NEXT_PUBLIC_DATA_MODE !== "local";
const key = (agentId: string) => ["agent-memories", agentId] as const;

/** What an agent remembers, plus the team's shared memory (newest first). */
export function useAgentMemories(agentId: string) {
  return useQuery({ queryKey: key(agentId), queryFn: () => remote.listAgentMemories(agentId), enabled: REMOTE, staleTime: 5_000 });
}

export function useForgetMemory() {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: (id: string) => remote.forgetAgentMemory(id, role),
    onSettled: () => qc.invalidateQueries({ queryKey: ["agent-memories"] }),
  });
}
