"use client";

import { CalendarIcon, ListChecksIcon } from "lucide-react";

import { checklistProgress, formatDue, isOverdue } from "@/lib/ticket-fields";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Compact label chips; shows the first `max` and a "+n" for the rest. */
export function LabelChips({ labels, max = 3, className }: { labels?: string[]; max?: number; className?: string }) {
  if (!labels?.length) return null;
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.map((l) => (
        <span key={l} className="max-w-[120px] truncate rounded-sm border border-border bg-muted px-1.5 text-[11px] leading-[18px] font-medium text-ink-2">
          {l}
        </span>
      ))}
      {rest > 0 && (
        <span title={labels.slice(max).join(", ")} className="text-[11px] text-muted-foreground">
          +{rest}
        </span>
      )}
    </span>
  );
}

/** Due date; red with "Overdue" in its accessible name when late. */
export function DueDate({ t, className }: { t: Pick<Ticket, "due" | "status">; className?: string }) {
  if (!t.due) return null;
  const late = isOverdue(t);
  return (
    <span
      title={late ? `Overdue: was due ${t.due}` : `Due ${t.due}`}
      className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px]", late ? "font-medium text-destructive" : "text-muted-foreground", className)}
    >
      <CalendarIcon aria-hidden className="size-3.5" />
      <span className="sr-only">{late ? "Overdue, due" : "Due"}</span>
      {formatDue(t.due)}
    </span>
  );
}

/** "2/5" checklist progress, green when complete. */
export function ChecklistCount({ t, className }: { t: Pick<Ticket, "checklist">; className?: string }) {
  const p = checklistProgress(t);
  if (!p) return null;
  const complete = p.done === p.total;
  return (
    <span
      title={`Checklist: ${p.done} of ${p.total} done`}
      className={cn("inline-flex shrink-0 items-center gap-1 text-[12px] tabular-nums", complete ? "text-success" : "text-muted-foreground", className)}
    >
      <ListChecksIcon aria-hidden className="size-3.5" />
      <span className="sr-only">Checklist</span>
      {p.done}/{p.total}
    </span>
  );
}
