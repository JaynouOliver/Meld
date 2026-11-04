"use client";

import { XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateTicket, useVisibleTickets } from "@/hooks/use-tickets";
import { cleanEstimate, isOverdue, MAX_LABELS, normLabel } from "@/lib/ticket-fields";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Due date picker; the native date input gives every platform its own calendar. */
export function DueField({ ticket: t }: { ticket: Ticket }) {
  const update = useUpdateTicket();
  const late = isOverdue(t);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="tk-due">Due date</Label>
        {t.due && (
          // Beside the label, not inside the input, so it never covers the native calendar button.
          <button
            type="button"
            aria-label="Clear due date"
            onClick={() => update.mutate({ id: t.id, patch: { due: null } })}
            className="-my-1 flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <XIcon aria-hidden className="size-3" />
            Clear
          </button>
        )}
      </div>
      <Input
        id="tk-due"
        type="date"
        value={t.due ?? ""}
        onChange={(e) => update.mutate({ id: t.id, patch: { due: e.target.value || null } })}
        aria-describedby={late ? "tk-due-late" : undefined}
        className={cn(late && "border-destructive text-destructive")}
      />
      {late && (
        <span id="tk-due-late" className="text-[12px] font-medium text-destructive">
          Overdue
        </span>
      )}
    </div>
  );
}

/** Story points: typed, checked locally, saved on blur or Enter. */
export function EstimateField({ ticket: t }: { ticket: Ticket }) {
  const update = useUpdateTicket();
  const [draft, setDraft] = useState(t.estimate == null ? "" : String(t.estimate));
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    const r = cleanEstimate(draft.trim() === "" ? null : draft);
    if ("error" in r) return setError(r.error);
    setError(null);
    if (r.estimate !== (t.estimate ?? null)) update.mutate({ id: t.id, patch: { estimate: r.estimate } }, { onError: (e) => setError(e.message) });
  };
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="tk-estimate">Estimate</Label>
      <div className="relative">
        <Input
          id="tk-estimate"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.5}
          value={draft}
          placeholder="Not estimated"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-invalid={!!error}
          aria-describedby={error ? "tk-estimate-err" : undefined}
          className="pr-12"
        />
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted-foreground">
          pts
        </span>
      </div>
      {error && (
        <span id="tk-estimate-err" role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

/** Label chips: type and press Enter (or comma) to add, x to remove, pick from labels the team already uses. */
export function LabelsField({ ticket: t }: { ticket: Ticket }) {
  const update = useUpdateTicket();
  const { visible } = useVisibleTickets();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = t.labels ?? [];

  // Labels in use across the tickets this person can see, most used first.
  const known = useMemo(() => {
    const count = new Map<string, number>();
    for (const x of visible) for (const l of x.labels ?? []) count.set(l, (count.get(l) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
  }, [visible]);
  const q = normLabel(draft);
  const suggestions = known.filter((l) => !labels.includes(l) && (!q || l.includes(q))).slice(0, 6);

  const save = (next: string[]) => {
    setError(null);
    update.mutate({ id: t.id, patch: { labels: next } }, { onError: (e) => setError(e.message) });
  };
  const add = (raw: string) => {
    const l = normLabel(raw);
    setDraft("");
    if (!l || labels.includes(l)) return;
    if (labels.length >= MAX_LABELS) return setError(`A ticket can have at most ${MAX_LABELS} labels`);
    save([...labels, l]);
  };

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="tk-labels">Labels</Label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring md:min-h-[38px]">
        {labels.map((l) => (
          <span key={l} className="inline-flex items-center gap-0.5 rounded-sm border border-border bg-muted py-px pr-0.5 pl-1.5 text-[12px] font-medium text-ink-2">
            {l}
            <button
              type="button"
              aria-label={`Remove label ${l}`}
              onClick={() => save(labels.filter((x) => x !== l))}
              className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground md:size-4"
            >
              <XIcon className="size-3" strokeWidth={2.4} />
            </button>
          </span>
        ))}
        <input
          id="tk-labels"
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && labels.length) {
              save(labels.slice(0, -1));
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={labels.length ? "" : "Add a label"}
          autoComplete="off"
          spellCheck={false}
          className="min-w-[90px] flex-1 border-none bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      {(focused || q) && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Suggested labels">
          <span className="text-[12px] text-muted-foreground">Suggestions</span>
          {suggestions.map((l) => (
            <button
              key={l}
              type="button"
              // Keep focus in the input so several labels can be added in a row.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(l)}
              className="cursor-pointer rounded-sm border border-dashed border-input px-1.5 py-px text-[12px] text-ink-2 hover:border-solid hover:bg-muted"
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {error && (
        <span role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
