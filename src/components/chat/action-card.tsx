"use client";

import { CheckIcon, RotateCcwIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useDecideAction } from "@/hooks/use-actions";
import type { ActionView } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Under an Atlas reply that changed tickets: a confirm card for held changes
 * (deletes, bulk edits), or an Undo link for applied ones.
 */
export function ActionCard({ action }: { action: ActionView }) {
  const decide = useDecideAction();
  const error = decide.error instanceof Error ? decide.error.message : null;
  const busy = decide.isPending;

  if (action.status === "pending") {
    return (
      <div
        className={cn(
          "mt-2 flex max-w-[460px] flex-col gap-2 rounded-md border bg-card px-3 py-2.5",
          action.destructive ? "border-destructive/40" : "border-border",
        )}
      >
        <div className="flex items-center gap-2 text-meta font-semibold text-foreground">
          <ShieldAlertIcon aria-hidden className={cn("size-4", action.destructive ? "text-destructive" : "text-warning")} />
          Needs your OK before anything changes
        </div>
        <ul className="flex flex-col gap-1 pl-6 text-meta text-ink-2">
          {action.summary.map((line, i) => (
            <li key={i} className="list-disc">
              {line}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <Button
            size="sm"
            variant={action.destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={() => decide.mutate({ id: action.id, decision: "confirm" })}
            className="h-9 md:h-8"
          >
            <CheckIcon />
            {action.destructive ? (action.summary.length > 1 ? "Confirm" : "Delete") : "Confirm"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide.mutate({ id: action.id, decision: "cancel" })} className="h-9 md:h-8">
            <XIcon />
            Cancel
          </Button>
          {error && <span className="text-meta text-destructive">{error}</span>}
        </div>
      </div>
    );
  }

  const note = { applied: "Applied", canceled: "Canceled, nothing changed", undone: "Undone" }[action.status];
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        {action.status === "applied" && <CheckIcon aria-hidden className="size-3.5 text-success" />}
        {note}
      </span>
      {action.status === "applied" && action.undoUntil && (
        // Keyed by the deadline: a card confirmed after it first rendered gets a fresh timer.
        <UndoButton key={action.undoUntil} until={action.undoUntil} disabled={busy} onUndo={() => decide.mutate({ id: action.id, decision: "undo" })} />
      )}
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}

/** Undo, shown until the action's undo deadline passes. */
function UndoButton({ until, disabled, onUndo }: { until: string; disabled: boolean; onUndo: () => void }) {
  const deadline = Date.parse(until);
  const [open, setOpen] = useState(() => deadline > Date.now());
  useEffect(() => {
    const left = deadline - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => setOpen(false), left);
    return () => clearTimeout(t);
  }, [deadline]);
  if (!open) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onUndo}
      className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md px-1.5 font-semibold text-link hover:underline disabled:opacity-50 pointer-coarse:min-h-10"
    >
      <RotateCcwIcon aria-hidden className="size-3.5" />
      Undo
    </button>
  );
}
