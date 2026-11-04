"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateTicket } from "@/hooks/use-tickets";
import { checklistProgress, MAX_CHECKLIST_ITEMS } from "@/lib/ticket-fields";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

const sectionLabel = "text-xs font-medium text-muted-foreground";

/** Subtasks lite: add, tick and remove small steps. Progress shows on cards and in the table. */
export function Checklist({ ticket: t }: { ticket: Ticket }) {
  const update = useUpdateTicket();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const items = t.checklist ?? [];
  const p = checklistProgress(t);
  const full = items.length >= MAX_CHECKLIST_ITEMS;

  const add = () => {
    const text = draft.trim();
    if (!text || full) return;
    setError(null);
    setDraft("");
    update.mutate({ id: t.id, addChecklistItem: text }, { onError: (e) => setError(e.message) });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={sectionLabel}>Checklist{p ? ` · ${p.done}/${p.total}` : ""}</span>
        {p && (
          <span
            role="progressbar"
            aria-label="Checklist progress"
            aria-valuemin={0}
            aria-valuemax={p.total}
            aria-valuenow={p.done}
            className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span className="block h-full rounded-full bg-success transition-[width]" style={{ width: `${(p.done / p.total) * 100}%` }} />
          </span>
        )}
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((i) => (
            <li key={i.id} className="group flex min-h-10 items-center gap-2.5 rounded-md px-1 hover:bg-muted md:min-h-8">
              <input
                id={`ck-${i.id}`}
                type="checkbox"
                checked={i.done}
                onChange={() => update.mutate({ id: t.id, toggleChecklistId: i.id })}
                className="size-4 shrink-0 cursor-pointer accent-[var(--brand)]"
              />
              <label htmlFor={`ck-${i.id}`} className={cn("min-w-0 flex-1 cursor-pointer text-sm break-words", i.done ? "text-muted-foreground line-through" : "text-foreground")}>
                {i.text}
              </label>
              <button
                type="button"
                aria-label={`Remove “${i.text}”`}
                onClick={() => update.mutate({ id: t.id, removeChecklistId: i.id })}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:size-6 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        <Input
          aria-label="New checklist item"
          value={draft}
          maxLength={200}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={full ? `Checklists hold up to ${MAX_CHECKLIST_ITEMS} items` : "Add an item"}
          autoComplete="off"
          className="min-w-0 flex-1"
        />
        <Button variant="outline" className="h-10 md:h-[38px]" onClick={add} disabled={!draft.trim() || full} aria-label="Add checklist item">
          <PlusIcon className="size-4" />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>
      {error && (
        <span role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
