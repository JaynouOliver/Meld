"use client";

import { LockIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { useUpdateTicket, useVisibleTickets } from "@/hooks/use-tickets";
import { blockersOf } from "@/lib/agent/blockers";
import type { Ticket } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";

const sectionLabel = "text-xs font-medium text-muted-foreground";

/** What blocks this ticket (editable) and what it blocks. Owners hear about changes from Atlas. */
export function Dependencies({ ticket: t }: { ticket: Ticket }) {
  const { visible, all, lookup } = useVisibleTickets();
  const update = useUpdateTicket();
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const blockers = blockersOf(t);
  const blocks = visible.filter((d) => blockersOf(d).includes(t.id));
  const candidates = visible.filter((x) => x.id !== t.id && !blockers.includes(x.id)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const open = (id: string) => useUiStore.setState({ ticketId: id });

  const add = (id: string) => {
    setPick("");
    setError(null);
    if (id) update.mutate({ id: t.id, addBlocker: id }, { onError: (e) => setError(e.message) });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className={sectionLabel}>Blocked by</span>
      {blockers.map((id) => {
        const { ticket: b, locked } = lookup(id);
        return (
          <div key={id} className="flex items-center gap-2.5 rounded-md border py-1 pr-1 pl-2.5">
            {b ? (
              <button type="button" onClick={() => open(b.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                <span className="text-sm font-semibold">{b.id}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{b.title || "Untitled"}</span>
                <StatusPill status={b.status} />
              </button>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
                {locked && <LockIcon className="size-3.5" />}
                {id} {locked ? "(you can't see this ticket)" : all.length ? "(deleted)" : ""}
              </span>
            )}
            <Button variant="ghost" size="icon" aria-label={`Remove blocker ${id}`} onClick={() => update.mutate({ id: t.id, removeBlocker: id })}>
              <XIcon className="size-3.5" strokeWidth={2.2} />
            </Button>
          </div>
        );
      })}
      <select
        aria-label="Add a blocker"
        value={pick}
        onChange={(e) => add(e.target.value)}
        className="h-10 rounded-md border bg-background px-2 text-sm text-muted-foreground md:h-9"
      >
        <option value="">{blockers.length ? "Add another blocker…" : "Add a ticket this is waiting on…"}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id} · {c.title || "Untitled"}
          </option>
        ))}
      </select>
      {error && <span role="alert" className="text-meta text-destructive">{error}</span>}
      {blocks.length > 0 && (
        <span className="text-meta text-muted-foreground">
          Blocks{" "}
          {blocks.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <button type="button" onClick={() => open(d.id)} className="cursor-pointer font-semibold text-link hover:underline">
                {d.id}
              </button>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
