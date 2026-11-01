"use client";

import { SearchIcon, XIcon } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GroupBy } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";

export function TicketFilterBar() {
  const query = useUiStore((s) => s.ticketQuery);
  const setQuery = useUiStore((s) => s.setTicketQuery);
  const groupBy = useUiStore((s) => s.groupBy);
  const setGroupBy = useUiStore((s) => s.setGroupBy);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-[1_1_320px] items-center gap-2 rounded-lg border border-input bg-white px-2.5 text-muted-foreground focus-within:border-[#8B95A5]">
        <SearchIcon aria-hidden className="size-[15px]" />
        <label htmlFor="tq" className="sr-only">
          Filter tickets
        </label>
        <input
          id="tq"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter: status:review assignee:ravi team:payments -status:done"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 border-none bg-transparent py-[9px] font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear filter"
            className="flex size-[30px] cursor-pointer items-center justify-center rounded-md hover:bg-accent"
          >
            <XIcon className="size-3.5" strokeWidth={2.2} />
          </button>
        )}
      </div>
      <label htmlFor="groupby" className="text-[13px] font-semibold text-ink-2">
        Group by
      </label>
      <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
        <SelectTrigger id="groupby" className="w-[130px] bg-white">
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
