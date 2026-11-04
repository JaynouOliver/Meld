"use client";

import { ChevronsLeftIcon, ChevronsRightIcon, EllipsisIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { PriorityLabel } from "@/components/common/priority-label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useCreateTicket, useUpdateTicket, useVisibleTickets } from "@/hooks/use-tickets";
import { openBlockers } from "@/lib/agent/blockers";
import { STATUS_COLORS, STATUSES } from "@/lib/constants";
import { personOf } from "@/lib/directory";
import { matchQuery } from "@/lib/query-language";
import type { Priority, Ticket, TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { ChecklistCount, DueDate, LabelChips } from "./ticket-meta";

const COLUMNS: TicketStatus[] = ["To do", "In progress", "In review", "Done"];
const PARKED: TicketStatus = "Backburner";
const DRAG_TYPE = "application/x-meld-ticket";
const RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
const byPriority = (a: Ticket, b: Ticket) => RANK[a.priority] - RANK[b.priority] || a.id.localeCompare(b.id, undefined, { numeric: true });

/**
 * Kanban board: one column per status. Drag a card to move it (optimistic, through the
 * same update as the panel), or use the card's status menu, which also works by keyboard
 * and on touch screens. Backburner stays folded to the side until opened.
 */
export function TicketBoard({ tickets, loading }: { tickets: Ticket[]; loading: boolean }) {
  const query = useUiStore((s) => s.ticketQuery);
  const parkedOpen = useUiStore((s) => !!s.collapsed["board:backburner-open"]);
  const toggleCollapsed = useUiStore((s) => s.toggleCollapsed);
  const dir = useDirectory();
  const update = useUpdateTicket();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TicketStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = tickets.filter((t) => matchQuery(t, query, dir));
  const move = (id: string, status: TicketStatus) => {
    const t = tickets.find((x) => x.id === id);
    if (!t || t.status === status) return;
    setError(null);
    update.mutate({ id, patch: { status } }, { onError: (e) => setError(`${id} couldn't move: ${e.message}`) });
  };

  const dropProps = (status: TicketStatus) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== status) setOver(status);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === status ? null : o));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DRAG_TYPE);
      setOver(null);
      setDragId(null);
      if (id) move(id, status);
    },
  });

  const column = (status: TicketStatus) => {
    const items = filtered.filter((t) => t.status === status).sort(byPriority);
    // Say why a column is empty when the filter, not the work, emptied it.
    const hidden = !items.length && tickets.some((t) => t.status === status);
    return { status, items, hidden };
  };
  const parked = column(PARKED);

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-danger-soft px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
      <div
        role="region"
        aria-label="Ticket board"
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:snap-none sm:px-0"
      >
        {COLUMNS.map((s) => {
          const c = column(s);
          return (
            <BoardColumn key={s} {...c} loading={loading} over={over === s} dragId={dragId} drop={dropProps(s)}>
              {c.items.map((t) => (
                <BoardCard key={t.id} t={t} dragging={dragId === t.id} onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null); }} onMove={move} />
              ))}
            </BoardColumn>
          );
        })}
        {parkedOpen ? (
          <BoardColumn {...parked} loading={loading} over={over === PARKED} dragId={dragId} drop={dropProps(PARKED)} onFold={() => toggleCollapsed("board:backburner-open")}>
            {parked.items.map((t) => (
              <BoardCard key={t.id} t={t} dragging={dragId === t.id} onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null); }} onMove={move} />
            ))}
          </BoardColumn>
        ) : (
          <button
            type="button"
            {...dropProps(PARKED)}
            onClick={() => toggleCollapsed("board:backburner-open")}
            aria-label={`Show Backburner column, ${parked.items.length} tickets`}
            className={cn(
              "flex w-11 shrink-0 cursor-pointer snap-start flex-col items-center gap-2 rounded-md border border-dashed bg-card py-3 text-muted-foreground hover:bg-muted hover:text-foreground",
              over === PARKED && "border-brand bg-selected",
            )}
          >
            <ChevronsRightIcon aria-hidden className="size-4" />
            <span className="tabular text-xs font-medium">{parked.items.length}</span>
            <span className="text-[13px] font-medium [writing-mode:vertical-rl]">Backburner</span>
          </button>
        )}
      </div>
    </div>
  );
}

function BoardColumn({
  status,
  items,
  hidden,
  loading,
  over,
  dragId,
  drop,
  onFold,
  children,
}: {
  status: TicketStatus;
  items: Ticket[];
  hidden: boolean;
  loading: boolean;
  over: boolean;
  dragId: string | null;
  drop: React.HTMLAttributes<HTMLElement>;
  onFold?: () => void;
  children: React.ReactNode;
}) {
  const role = useRole();
  const create = useCreateTicket();
  return (
    <section
      aria-label={`${status}, ${items.length} tickets`}
      {...drop}
      className={cn(
        "flex w-[min(300px,82vw)] shrink-0 snap-start flex-col rounded-md border bg-muted/60 sm:w-auto sm:min-w-[240px] sm:flex-1 sm:basis-0",
        over && "border-brand bg-selected",
      )}
    >
      <header className="flex h-10 items-center gap-2 px-3">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLORS[status][3] }} />
        <h2 className="text-[13px] font-semibold text-foreground">{status}</h2>
        <span className="tabular text-xs text-muted-foreground">{items.length}</span>
        {onFold && (
          <button
            type="button"
            onClick={onFold}
            aria-label={`Fold ${status} column`}
            className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronsLeftIcon className="size-4" />
          </button>
        )}
      </header>
      <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
        {children}
        {!items.length && !loading && (
          <li
            className={cn(
              "flex items-center justify-center rounded-md border border-dashed px-3 py-6 text-center text-[12px] text-muted-foreground",
              dragId ? "flex-1 border-input" : "border-transparent",
            )}
          >
            {dragId ? `Drop here to move to ${status}` : hidden ? "Hidden by the current filter" : "No tickets"}
          </li>
        )}
      </ul>
      {role !== "guest" && status !== "Done" && (
        <button
          type="button"
          onClick={() => create.mutate({ status })}
          className="flex h-9 cursor-pointer items-center gap-2 rounded-b-md border-t px-3 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PlusIcon aria-hidden className="size-3.5" strokeWidth={2.2} />
          Add item
        </button>
      )}
    </section>
  );
}

function BoardCard({
  t,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  t: Ticket;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (id: string, s: TicketStatus) => void;
}) {
  const dir = useDirectory();
  const { all } = useVisibleTickets();
  const selected = useUiStore((s) => s.ticketId === t.id);
  const openTicket = useUiStore((s) => s.openTicket);
  const a = personOf(dir, t.assignee);
  const blocked = t.status !== "Done" && openBlockers(t, all).length > 0;

  return (
    <li
      draggable
      data-ticket={t.id}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, t.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => openTicket(t.id)}
      className={cn(
        "group cursor-grab rounded-md border bg-card p-2.5 transition-colors hover:border-input active:cursor-grabbing",
        selected && "border-brand",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">{t.id}</span>
        {blocked && <span className="rounded-sm bg-danger-soft px-1.5 text-[11px] leading-[18px] font-medium text-destructive">Blocked</span>}
        <StatusMenu t={t} onMove={onMove} />
      </div>
      {/* The title is the keyboard way in; the whole card is clickable for pointers. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openTicket(t.id);
        }}
        className="mt-1 line-clamp-3 w-full cursor-pointer text-left text-[13px] leading-snug font-medium text-foreground hover:underline"
      >
        {t.title || "Untitled ticket"}
      </button>
      <LabelChips labels={t.labels} className="mt-2" />
      <div className="mt-2.5 flex items-center gap-2.5">
        <PriorityLabel priority={t.priority} iconOnly />
        <DueDate t={t} />
        <ChecklistCount t={t} />
        {t.estimate != null && (
          <span title={`${t.estimate} story points`} className="tabular rounded-sm bg-muted px-1 text-[11px] leading-[18px] font-medium text-muted-foreground">
            {t.estimate}
            <span className="sr-only"> points</span>
          </span>
        )}
        <span className="ml-auto" title={`Assigned to ${a.name}`}>
          <Avatar person={a} size="xs" />
          <span className="sr-only">Assigned to {a.name}</span>
        </span>
      </div>
    </li>
  );
}

/** Keyboard- and touch-friendly status change; the drag alternative. */
function StatusMenu({ t, onMove }: { t: Ticket; onMove: (id: string, s: TicketStatus) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Change status of ${t.id}`}
          onClick={(e) => e.stopPropagation()}
          className="ml-auto flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 md:size-6 md:opacity-0 md:group-hover:opacity-100"
        >
          <EllipsisIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={t.status} onValueChange={(v) => onMove(t.id, v as TicketStatus)}>
          {STATUSES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {s}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
