"use client";

import { SearchIcon, XIcon } from "lucide-react";

import { useDirectory } from "@/hooks/use-directory";
import { useMediaQuery } from "@/hooks/use-media-query";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ATLAS_ID, personOf } from "@/lib/directory";
import type { GroupBy } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";

export function TicketFilterBar() {
  const query = useUiStore((s) => s.ticketQuery);
  const setQuery = useUiStore((s) => s.setTicketQuery);
  const groupBy = useUiStore((s) => s.groupBy);
  const setGroupBy = useUiStore((s) => s.setGroupBy);
  const wide = useMediaQuery("(min-width: 768px)", true);
  const dir = useDirectory();
  // Example filter built from this workspace's people and teams.
  const teammate = dir.personOrder.find((k) => k !== dir.me && k !== ATLAS_ID);
  const example = [
    "status:review",
    teammate && `assignee:${personOf(dir, teammate).first.toLowerCase()}`,
    dir.teams[0] && `team:${dir.teams[0].name.toLowerCase().replace(/\s+/g, "-")}`,
    "-status:done",
  ].filter(Boolean).join(" ");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex flex-[1_1_100%] items-center sm:flex-[1_1_320px] gap-2 rounded-md border border-input bg-card px-2.5 text-muted-foreground focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
        <SearchIcon aria-hidden className="size-[15px]" />
        <label htmlFor="tq" className="sr-only">
          Filter tickets
        </label>
        <input
          id="tq"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={wide ? `Filter: ${example}` : "e.g. status:review"}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 border-none bg-transparent py-[7px] font-mono text-base text-foreground md:text-sm outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear filter"
            className="flex size-10 cursor-pointer md:size-6 items-center justify-center rounded-md hover:bg-accent"
          >
            <XIcon className="size-3.5" strokeWidth={2.2} />
          </button>
        )}
      </div>
      <label htmlFor="groupby" className="ml-auto text-meta font-medium text-muted-foreground sm:ml-0">
        Group by
      </label>
      <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
        <SelectTrigger id="groupby" className="w-[130px] bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="assignee">Assignee</SelectItem>
          <SelectItem value="status">Status</SelectItem>
          <SelectItem value="team">Team</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
