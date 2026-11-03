"use client";

import { TicketIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { STATUS_COLORS } from "@/lib/constants";
import { personOf, teamName } from "@/lib/directory";
import { roleLabel } from "@/lib/rbac";
import { useUiStore } from "@/stores/ui-store";

/** Ticket card under Atlas confirmations. Handles deleted and restricted tickets. */
export function TicketCard({ id }: { id: string }) {
  const { lookup } = useVisibleTickets();
  const dir = useDirectory();
  const role = useRole();
  const openTicket = useUiStore((s) => s.openTicket);
  const { ticket: t, locked } = lookup(id);

  let status = "Deleted";
  let statusColors: [string, string] = [STATUS_COLORS.Backburner[0], STATUS_COLORS.Backburner[1]];
  let title = "This ticket was deleted";
  let team = "";
  let meta = "";
  if (locked) {
    status = "No access";
    title = "Restricted ticket";
    meta = `Your role (${roleLabel(dir, role)}) can’t see this ticket.`;
  } else if (t) {
    status = t.status;
    statusColors = [STATUS_COLORS[t.status][0], STATUS_COLORS[t.status][1]];
    title = t.title || "Untitled ticket";
    team = teamName(dir, t.team);
    meta =
      `Assigned to ${t.assignee === dir.me ? "you" : personOf(dir, t.assignee).name} · ` +
      (t.links.length ? t.links.map((l) => `${l.kind} #${l.num}`).join(", ") : "No GitHub links");
  }

  return (
    <div className="mt-2 flex max-w-[460px] flex-col gap-1.5 rounded-lg border bg-card px-3.5 py-3 shadow-xs">
      <div className="flex items-center gap-2">
        <TicketIcon aria-hidden className="size-4 text-agent-foreground" />
        <span className="text-xs font-bold tracking-[0.02em] text-muted-foreground">{id}</span>
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: statusColors[0], color: statusColors[1] }}>
          {status}
        </span>
        {team && <span className="text-xs text-muted-foreground">{team}</span>}
      </div>
      <div className="text-body leading-[1.4] font-semibold">{title}</div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-meta text-muted-foreground">{meta}</span>
        {t && (
          <Button variant="outline" size="sm" className="h-10 sm:h-9" onClick={() => openTicket(t.id)}>
            Open ticket
          </Button>
        )}
      </div>
    </div>
  );
}
