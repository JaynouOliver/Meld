"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import * as remote from "@/lib/api/remote";
import type { PlaybookInput } from "@/lib/automation";
import { queryKeys } from "./query-keys";
import { useRole } from "./use-directory";

const REMOTE = process.env.NEXT_PUBLIC_DATA_MODE !== "local";
const keys = {
  playbooks: ["playbooks"] as const,
  ticket: (id: string) => ["ticket-automation", id] as const,
};

/** Workspace playbooks with their latest runs. Polls while a run is in flight. */
export function usePlaybooks() {
  return useQuery({
    queryKey: keys.playbooks,
    queryFn: remote.listPlaybooks,
    enabled: REMOTE,
    staleTime: 5_000,
    refetchInterval: (q) => (q.state.data?.some((p) => p.runs.some((r) => r.status === "running")) ? 4_000 : false),
  });
}

function usePlaybookMutation<A>(fn: (a: A, role: string) => Promise<unknown>) {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: (a: A) => fn(a, role),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.playbooks }),
  });
}

export const useSavePlaybook = () => usePlaybookMutation((input: PlaybookInput, role) => remote.savePlaybook(input, role));
export const useSetPlaybookEnabled = () => usePlaybookMutation((v: { id: string; enabled: boolean }, role) => remote.setPlaybookEnabled(v.id, v.enabled, role));
export const useDeletePlaybook = () => usePlaybookMutation((id: string, role) => remote.deletePlaybook(id, role));

/** How long a just-titled ticket waits for its triage to show up. */
const FRESH_MS = 45_000;

/**
 * The ticket panel's automation note: triage and playbook runs. A new ticket polls until
 * its triage lands (it runs right after the title is saved), then refreshes the ticket so
 * the filled-in fields show without waiting for realtime.
 */
export function useTicketAutomation(ticketId: string, title: string, version: number) {
  const qc = useQueryClient();
  const role = useRole();
  const since = useRef(0);
  useEffect(() => {
    since.current = Date.now();
  }, [ticketId, title]);
  const q = useQuery({
    queryKey: keys.ticket(ticketId),
    queryFn: () => remote.ticketAutomation(ticketId, role),
    enabled: REMOTE && !!title.trim(),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d?.triage?.status === "running" || d?.runs.some((r) => r.status === "running")) return 2_000;
      return !d?.triage && Date.now() - since.current < FRESH_MS ? 1_500 : false;
    },
  });
  // Triage finished, or a playbook moved on: the ticket itself changed.
  const status = `${q.data?.triage?.status ?? ""}|${q.data?.runs.map((r) => `${r.status}${r.step}`).join(",") ?? ""}`;
  const prev = useRef(status);
  useEffect(() => {
    if (prev.current !== status) qc.invalidateQueries({ queryKey: queryKeys.tickets });
    prev.current = status;
  }, [status, qc]);
  // Ticket edits (an Undo from the chat card, say) may change what the note says.
  const { refetch } = q;
  useEffect(() => {
    if (title.trim()) void refetch();
  }, [version, title, refetch]);
  return q;
}

export function useUndoTriage() {
  const qc = useQueryClient();
  const role = useRole();
  return useMutation({
    mutationFn: (ticketId: string) => remote.undoTriage(ticketId, role),
    onSettled: (_r, _e, ticketId) => {
      qc.invalidateQueries({ queryKey: keys.ticket(ticketId) });
      qc.invalidateQueries({ queryKey: queryKeys.tickets });
    },
  });
}
