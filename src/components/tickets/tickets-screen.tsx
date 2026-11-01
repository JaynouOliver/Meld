"use client";

import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { useCreateTicket, useVisibleTickets } from "@/hooks/use-tickets";
import { ROLE_SCOPE } from "@/lib/rbac";
import type { TicketScope } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { TicketCharts } from "./ticket-charts";
import { TicketFilterBar } from "./ticket-filter-bar";
import { TicketStats } from "./ticket-stats";
import { TicketTable } from "./ticket-table";

export function TicketsScreen({ scope }: { scope: TicketScope }) {
  const role = useUiStore((s) => s.role);
  const { visible, isPending } = useVisibleTickets();
  const create = useCreateTicket();
  const scoped = useMemo(() => visible.filter((t) => scope === "all" || t.assignee === "me"), [visible, scope]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ScreenHeader
        actions={
          role !== "guest" && (
            <Button onClick={() => create.mutate({})} disabled={create.isPending}>
              <PlusIcon strokeWidth={2.2} />
              <span className="hidden sm:inline">New ticket</span>
            </Button>
          )
        }
      >
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <h1 className="text-[17px] font-bold">{scope === "mine" ? "Assigned to me" : "All tickets"}</h1>
          <span className="truncate text-[13px] text-muted-foreground">{ROLE_SCOPE[role]}</span>
        </div>
      </ScreenHeader>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-canvas px-3 pt-4 pb-7 sm:px-5">
        <TicketStats tickets={scoped} />
        <TicketCharts tickets={scoped} />
        <TicketFilterBar />
        <TicketTable tickets={scoped} loading={isPending} />
      </div>
    </main>
  );
}
