"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
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
            <Button onClick={() => create.mutate({})} disabled={create.isPending} aria-label="New ticket" className="size-11 px-0 sm:h-10 sm:w-auto sm:px-3.5">
              <PlusIcon strokeWidth={2.2} className="size-5 sm:size-4" />
              <span className="hidden sm:inline">New ticket</span>
            </Button>
          )
        }
      >
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <h1 className="text-[22px] font-bold tracking-[-0.01em] md:text-[17px] md:tracking-normal">
            <span className="md:hidden">Tickets</span>
            <span className="hidden md:inline">{scope === "mine" ? "Assigned to me" : "All tickets"}</span>
          </h1>
          <span className="hidden truncate text-[13px] text-muted-foreground md:block">{ROLE_SCOPE[role]}</span>
        </div>
      </ScreenHeader>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-canvas *:shrink-0 px-4 pt-3 pb-6 sm:gap-4 sm:px-5 sm:pt-4 sm:pb-7">
        <ScopeTabs scope={scope} />
        <p className="-mt-1 text-[13px] text-muted-foreground md:hidden">{ROLE_SCOPE[role]}</p>
        <TicketStats tickets={scoped} />
        {/* Phones lead with the list; the charts move to the end. */}
        <div className="order-last sm:order-none">
          <TicketCharts tickets={scoped} />
        </div>
        <TicketFilterBar />
        <div className="@container">
          <TicketTable tickets={scoped} loading={isPending} />
        </div>
      </div>
    </main>
  );
}

/** Phone-only All / Mine switch (the sidebar does this on desktop). */
function ScopeTabs({ scope }: { scope: TicketScope }) {
  const tabs = [
    { href: "/tickets", label: "All tickets", value: "all" },
    { href: "/tickets/mine", label: "Assigned to me", value: "mine" },
  ] as const;
  return (
    <div role="tablist" className="grid grid-cols-2 rounded-lg bg-accent p-1 md:hidden">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          role="tab"
          aria-selected={scope === t.value}
          className={
            "flex h-10 items-center justify-center rounded-md text-sm font-semibold no-underline " +
            (scope === t.value ? "bg-white text-foreground shadow-sm hover:text-foreground" : "text-muted-foreground hover:text-muted-foreground")
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
