"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useCreateTicket, useVisibleTickets } from "@/hooks/use-tickets";
import { roleScope } from "@/lib/rbac";
import type { TicketScope } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { TicketCharts } from "./ticket-charts";
import { TicketFilterBar } from "./ticket-filter-bar";
import { TicketTable } from "./ticket-table";
import { TicketViews } from "./ticket-views";

export function TicketsScreen({ scope }: { scope: TicketScope }) {
  const dir = useDirectory();
  const role = useRole();
  const { visible, isPending } = useVisibleTickets();
  const create = useCreateTicket();
  const showInsights = useUiStore((s) => s.showInsights);
  const scoped = useMemo(() => visible.filter((t) => scope === "all" || t.assignee === dir.me), [visible, scope, dir.me]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ScreenHeader
        actions={
          role !== "guest" && (
            <Button onClick={() => create.mutate({})} disabled={create.isPending} aria-label="New ticket" className="size-10 px-0 sm:h-8 sm:w-auto sm:px-3">
              <PlusIcon strokeWidth={2.2} className="size-5 sm:size-4" />
              <span className="hidden sm:inline">New ticket</span>
            </Button>
          )
        }
      >
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <h1 className="text-xl font-semibold md:text-[15px]">
            <span className="md:hidden">Tickets</span>
            <span className="hidden md:inline">{scope === "mine" ? "Assigned to me" : "All tickets"}</span>
          </h1>
          <span className="hidden truncate text-meta text-muted-foreground md:block">{roleScope(dir, role)}</span>
        </div>
      </ScreenHeader>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-canvas *:shrink-0 px-4 pt-3 pb-6 sm:px-5 sm:pt-4 sm:pb-7">
        <ScopeTabs scope={scope} />
        <p className="-mt-1 text-meta text-muted-foreground md:hidden">{roleScope(dir, role)}</p>
        {/* List first: views and filter sit directly above it, charts are opt-in. */}
        <TicketViews tickets={scoped} scope={scope} />
        {showInsights && <TicketCharts tickets={scoped} scope={scope} />}
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
    <div role="tablist" className="grid grid-cols-2 rounded-md border bg-muted p-0.5 md:hidden">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          role="tab"
          aria-selected={scope === t.value}
          className={
            "flex h-9 items-center justify-center rounded-[4px] text-sm font-medium no-underline " +
            (scope === t.value ? "bg-card text-foreground ring-1 ring-border hover:text-foreground" : "text-muted-foreground hover:text-muted-foreground")
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
