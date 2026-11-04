"use client";

import { BotIcon, ChartColumnIcon, KanbanIcon, TableIcon } from "lucide-react";

import { useDirectory } from "@/hooks/use-directory";
import { useTicketLayout, type TicketLayout } from "@/hooks/use-ticket-layout";
import { matchQuery, DEFAULT_TICKET_QUERY } from "@/lib/query-language";
import type { Ticket, TicketScope } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

interface View {
  id: string;
  label: string;
  query: string;
  atlas?: boolean;
}

const OPEN = DEFAULT_TICKET_QUERY;

/**
 * Saved views with live counts. They replace the old stat cards: one row that
 * answers "how much is there?" and is also the fastest way to filter (Hick's Law,
 * recognition over recall: nobody has to remember the query language).
 */
const VIEWS: View[] = [
  { id: "open", label: "Open", query: OPEN },
  { id: "mine", label: "My open", query: `assignee:me ${OPEN}` },
  { id: "review", label: "Needs review", query: "status:review" },
  { id: "high", label: "High priority", query: `priority:high ${OPEN}` },
  { id: "atlas", label: "Filed by Atlas", query: "is:agent", atlas: true },
  { id: "done", label: "Done", query: "status:Done" },
];

const norm = (q: string) => q.trim().toLowerCase().split(/\s+/).sort().join(" ");

export function TicketViews({ tickets, scope }: { tickets: Ticket[]; scope: TicketScope }) {
  const dir = useDirectory();
  const query = useUiStore((s) => s.ticketQuery);
  const setQuery = useUiStore((s) => s.setTicketQuery);
  const showInsights = useUiStore((s) => s.showInsights);
  const setShowInsights = useUiStore((s) => s.setShowInsights);
  const current = norm(query);
  // "My open" is redundant on the Assigned-to-me page.
  const views = VIEWS.filter((v) => !(scope === "mine" && v.id === "mine"));

  return (
    <div className="flex items-center gap-2">
      <div
        role="toolbar"
        aria-label="Saved views"
        className="-mx-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        {views.map((v) => {
          const active = current === norm(v.query);
          const count = tickets.filter((t) => matchQuery(t, v.query, dir)).length;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={active}
              onClick={() => setQuery(v.query)}
              className={cn(
                "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[13px]/5 font-medium transition-colors",
                active
                  ? "border-input bg-card text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {v.atlas && <BotIcon aria-hidden className="size-3.5 text-muted-foreground" />}
              {v.label}
              <span className={cn("tabular text-xs", active ? "text-muted-foreground" : "text-subtle")}>{count}</span>
            </button>
          );
        })}
      </div>
      <LayoutToggle />
      <button
        type="button"
        aria-pressed={showInsights}
        aria-label="Insights"
        onClick={() => setShowInsights(!showInsights)}
        className={cn(
          "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border text-[13px]/5 font-medium transition-colors sm:w-auto sm:px-2.5",
          showInsights ? "border-input bg-accent text-foreground" : "border-input bg-card text-ink-2 hover:bg-muted hover:text-foreground",
        )}
      >
        <ChartColumnIcon aria-hidden className="size-4" />
        <span className="hidden sm:inline">Insights</span>
      </button>
    </div>
  );
}

const LAYOUTS: { value: TicketLayout; label: string; Icon: typeof TableIcon }[] = [
  { value: "table", label: "Table", Icon: TableIcon },
  { value: "board", label: "Board", Icon: KanbanIcon },
];

/** Table | Board, remembered per person (see useTicketLayout). */
function LayoutToggle() {
  const [layout, setLayout] = useTicketLayout();
  return (
    <div role="group" aria-label="Layout" className="flex h-8 shrink-0 rounded-md border border-input bg-muted p-0.5">
      {LAYOUTS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={layout === value}
          aria-label={label}
          onClick={() => setLayout(value)}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] px-2 text-[13px] font-medium transition-colors",
            layout === value ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon aria-hidden className="size-4" />
          <span className="hidden lg:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
