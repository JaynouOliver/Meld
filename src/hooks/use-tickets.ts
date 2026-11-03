"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import * as api from "@/lib/api";
import { canSee } from "@/lib/rbac";
import type { Ticket } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { useHydrated } from "./use-hydrated";
import { useNotifyChat } from "./use-notify-chat";
import { queryKeys } from "./query-keys";

export function useTickets() {
  return hydrationSafe(useQuery({ queryKey: queryKeys.tickets, queryFn: api.getTickets }), useHydrated());
}

/** Until hydration finishes, report "loading" so the HTML matches the server's. */
function hydrationSafe<T extends { data: unknown; isPending: boolean }>(q: T, hydrated: boolean): T {
  return hydrated ? q : { ...q, data: undefined, isPending: true };
}

/** Tickets the current role can see, plus a lookup that knows about restricted ones. */
export function useVisibleTickets() {
  const role = useUiStore((s) => s.role);
  const q = useTickets();
  return useMemo(() => {
    const all = q.data ?? [];
    const visible = all.filter((t) => canSee(role, t));
    const byId = new Map(all.map((t) => [t.id, t]));
    const lookup = (id: string): { ticket: Ticket | null; locked: boolean } => {
      const t = byId.get(id);
      if (!t) return { ticket: null, locked: false };
      return canSee(role, t) ? { ticket: t, locked: false } : { ticket: null, locked: true };
    };
    return { ...q, all, visible, lookup };
  }, [q, role]);
}

export function useWeekActivity() {
  return hydrationSafe(useQuery({ queryKey: queryKeys.week, queryFn: api.getWeekActivity }), useHydrated());
}

export function useCreateTicket() {
  const qc = useQueryClient();
  const role = useUiStore((s) => s.role);
  const openTicket = useUiStore((s) => s.openTicket);
  return useMutation({
    mutationFn: (preset: Partial<Ticket> = {}) => api.createTicket(preset, role),
    onSuccess: (t) => {
      qc.setQueryData<Ticket[]>(queryKeys.tickets, (old) => (old ? [...old, t] : [t]));
      qc.invalidateQueries({ queryKey: queryKeys.week });
      useUiStore.setState({ threadId: null });
      openTicket(t.id);
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  const role = useUiStore((s) => s.role);
  const notify = useNotifyChat();
  return useMutation({
    mutationFn: (input: Omit<api.UpdateTicketInput, "role">) => api.updateTicket({ ...input, role }),
    // Optimistic for simple field edits so selects and inputs feel instant.
    onMutate: async (input) => {
      if (!input.patch) return;
      await qc.cancelQueries({ queryKey: queryKeys.tickets });
      const prev = qc.getQueryData<Ticket[]>(queryKeys.tickets);
      qc.setQueryData<Ticket[]>(queryKeys.tickets, (old) =>
        old?.map((t) => (t.id === input.id ? { ...t, ...input.patch } : t)),
      );
      return { prev };
    },
    onError: (_e, _i, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.tickets, ctx.prev);
    },
    onSuccess: ({ ticket, broadcastChat }) => {
      qc.setQueryData<Ticket[]>(queryKeys.tickets, (old) => old?.map((t) => (t.id === ticket.id ? ticket : t)));
      qc.invalidateQueries({ queryKey: queryKeys.week });
      if (broadcastChat) notify(broadcastChat);
    },
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  const role = useUiStore((s) => s.role);
  return useMutation({
    mutationFn: (id: string) => api.deleteTicket(id, role),
    onSuccess: (_d, id) => {
      qc.setQueryData<Ticket[]>(queryKeys.tickets, (old) => old?.filter((t) => t.id !== id));
      qc.invalidateQueries({ queryKey: queryKeys.week });
      useUiStore.getState().closeTicket();
    },
  });
}
