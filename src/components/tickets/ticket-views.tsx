"use client";

import { ChartColumnIcon } from "lucide-react";

import { useDirectory } from "@/hooks/use-directory";
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
                "inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-meta font-semibold transition-colors",
                active
                  ? "border-primary/40 bg-selected text-link"
                  : "border-border bg-card text-ink-2 hover:border-input hover:text-foreground",
              )}
            >
              {v.atlas && <span aria-hidden className="size-2 rounded-full bg-atlas" />}
              {v.label}
              <span className={cn("tabular rounded-full px-1.5 text-xs", active ? "bg-primary/10" : "bg-accent text-muted-foreground")}>{count}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={showInsights}
        aria-label="Insights"
        onClick={() => setShowInsights(!showInsights)}
        className={cn(
          "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-meta font-semibold transition-colors sm:w-auto sm:px-3",
          showInsights ? "border-primary/40 bg-selected text-link" : "bg-card text-ink-2 hover:border-input hover:text-foreground",
        )}
      >
        <ChartColumnIcon aria-hidden className="size-4" />
        <span className="hidden sm:inline">Insights</span>
      </button>
    </div>
  );
}
