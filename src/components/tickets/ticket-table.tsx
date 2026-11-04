"use client";

import { RowSkeletons } from "@/components/common/skeleton";
import { ChevronDownIcon, CircleDashedIcon, CircleDotIcon, PlusIcon } from "lucide-react";

import { Avatar } from "@/components/common/avatar";
import { PriorityLabel } from "@/components/common/priority-label";
import { StatusPill } from "@/components/common/status-pill";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useCreateTicket, useVisibleTickets } from "@/hooks/use-tickets";
import { openBlockers } from "@/lib/agent/blockers";
import { STATUS_COLORS, STATUS_ORDER } from "@/lib/constants";
import { personOf, teamName } from "@/lib/directory";
import { matchQuery } from "@/lib/query-language";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { ChecklistCount, DueDate, LabelChips } from "./ticket-meta";

const COLS = "grid-cols-[44px_minmax(260px,1fr)_170px_130px_110px_90px]";

interface GroupDef {
  key: string;
  label: string;
  badge: string;
  color: string;
  round: boolean;
  test: (t: Ticket) => boolean;
  preset: Partial<Ticket>;
}

export function TicketTable({ tickets, loading }: { tickets: Ticket[]; loading: boolean }) {
  const query = useUiStore((s) => s.ticketQuery);
  const groupBy = useUiStore((s) => s.groupBy);
  const collapsed = useUiStore((s) => s.collapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleCollapsed);
  const dir = useDirectory();
  const role = useRole();
  const ticketId = useUiStore((s) => s.ticketId);
  const openTicket = useUiStore((s) => s.openTicket);
  const create = useCreateTicket();

  const filtered = tickets.filter((t) => matchQuery(t, query, dir));

  let defs: GroupDef[];
  if (groupBy === "status") {
    defs = STATUS_ORDER.map((k) => ({ key: k, label: k, badge: "", color: STATUS_COLORS[k][3], round: true, test: (t) => t.status === k, preset: { status: k } }));
  } else if (groupBy === "team") {
    defs = dir.teams.map(({ id: k, name }) => ({ key: k, label: name, badge: name.charAt(0), color: "var(--status-todo-dot)", round: false, test: (t) => t.team === k, preset: { team: k } }));
  } else {
    // Tickets assigned to someone who left still get a group.
    const ids = [...dir.personOrder, ...new Set(filtered.map((t) => t.assignee).filter((a) => !dir.personOrder.includes(a)))];
    defs = ids.map((k) => {
      const p = personOf(dir, k);
      return {
        key: k, label: k === dir.me ? `${p.name} (you)` : p.name, badge: p.initials, color: p.color, round: true,
        // useCreateTicket falls back to a team the viewer can file into.
        test: (t) => t.assignee === k, preset: { assignee: k, ...(p.team ? { team: p.team } : {}) },
      };
    });
  }

  const groups = defs
    .map((g) => ({ ...g, items: filtered.filter(g.test) }))
    .filter((g) => g.items.length > 0);
  // Row numbers run across groups, counting only expanded rows (like a spreadsheet).
  const rowNum = new Map<string, number>();
  groups.forEach((g) => {
    if (!collapsed[`${groupBy}:${g.key}`]) g.items.forEach((t) => rowNum.set(t.id, rowNum.size + 1));
  });

  return (
    <div className="-mx-4 border-y bg-card sm:mx-0 sm:rounded-md sm:border">
      <div role="region" aria-label="Tickets">
        <div aria-hidden className={cn("hidden rounded-t-md border-b bg-muted @min-[860px]:grid text-xs font-medium text-muted-foreground", COLS)}>
          <span className="px-3 py-2" />
          <span className="px-3 py-2">Title</span>
          <span className="border-l px-3 py-2">Assignee</span>
          <span className="border-l px-3 py-2">Status</span>
          <span className="border-l px-3 py-2">Team</span>
          <span className="border-l px-3 py-2">Priority</span>
        </div>

        {loading && <RowSkeletons count={8} />}

        {groups.map((g) => {
          const ck = `${groupBy}:${g.key}`;
          const open = !collapsed[ck];
          return (
            <div key={g.key} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => toggleCollapsed(ck)}
                aria-expanded={open}
                className="sticky -top-3 z-[1] flex min-h-11 w-full cursor-pointer items-center gap-2.5 bg-canvas px-3 py-1.5 text-left hover:bg-accent @min-[860px]:min-h-9 sm:-top-4 @min-[860px]:static"
              >
                <ChevronDownIcon className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} strokeWidth={2.4} />
                <span
                  aria-hidden
                  className={cn("flex size-5 shrink-0 items-center justify-center text-[10px] font-semibold text-white", g.round ? "rounded-full" : "rounded-[4px]")}
                  style={{ background: g.color }}
                >
                  {g.badge}
                </span>
                <span className="text-sm font-semibold text-foreground">{g.label}</span>
                <span className="tabular text-xs text-muted-foreground">{g.items.length}</span>
              </button>
              {open && (
                <>
                  <ul className="@min-[860px]:hidden">
                    {g.items.map((t) => (
                      <TicketCardRow key={t.id} t={t} selected={ticketId === t.id} onOpen={() => openTicket(t.id)} />
                    ))}
                  </ul>
                  <div className="hidden @min-[860px]:block">
                  {g.items.map((t) => {
                    const a = personOf(dir, t.assignee);
                    const linked = t.links.length > 0;
                    return (
                      <div
                        key={t.id}
                       
                        className={cn("grid min-h-9 items-center border-t border-line-soft text-sm", COLS, ticketId === t.id ? "bg-selected" : "hover:bg-muted")}
                      >
                        <span className="px-3 text-right text-xs text-muted-foreground">{rowNum.get(t.id)}</span>
                        <span className="flex min-w-0 items-center gap-2 px-3">
                          {linked ? (
                            <CircleDotIcon aria-label="Linked to GitHub" className="size-4 shrink-0 text-success" strokeWidth={2.2} />
                          ) : (
                            <CircleDashedIcon aria-label="Draft, no GitHub link" className="size-4 shrink-0 text-subtle" />
                          )}
                          <button
                            type="button"
                            onClick={() => openTicket(t.id)}
                            className={cn("min-w-0 cursor-pointer truncate py-1.5 text-left font-medium hover:underline", linked ? "text-foreground" : "text-ink-2")}
                          >
                            {t.title || "Untitled ticket"}
                          </button>
                          <span className="shrink-0 text-meta text-muted-foreground">
                            {t.id}
                            {linked && ` · ${t.links[0].kind === "PR" ? "PR " : ""}#${t.links[0].num}`}
                          </span>
                          <BlockedBadge t={t} />
                          <span className="ml-auto flex shrink-0 items-center gap-2 pl-1">
                            <LabelChips labels={t.labels} max={2} className="flex-nowrap" />
                            <ChecklistCount t={t} />
                            <DueDate t={t} />
                          </span>
                        </span>
                        <span className="flex h-full min-w-0 items-center gap-2 border-l border-line-soft px-3">
                          <Avatar person={a} size="xs" />
                          <span className="truncate text-meta">{a.name}</span>
                        </span>
                        <span className="flex h-full items-center border-l border-line-soft px-3">
                          <StatusPill status={t.status} bordered className="py-px" />
                        </span>
                        <span className="flex h-full items-center border-l border-line-soft px-3 text-meta text-ink-2">{teamName(dir, t.team)}</span>
                        <span className="flex h-full items-center border-l border-line-soft px-3 text-meta">
                          <PriorityLabel priority={t.priority} />
                        </span>
                      </div>
                    );
                  })}
                  </div>
                  {role !== "guest" && (
                    <button
                      type="button"
                      onClick={() => create.mutate(g.preset)}
                      className="flex min-h-12 w-full cursor-pointer items-center gap-2 border-t border-line-soft bg-card pr-3 pl-4 text-left @min-[860px]:min-h-9 @min-[860px]:pl-5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <PlusIcon className="size-3.5" strokeWidth={2.2} />
                      Add item
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}

        {!loading && groups.length === 0 && (
          <div className="px-4 py-7 text-center text-sm text-muted-foreground">No tickets match this filter for your role.</div>
        )}
      </div>
    </div>
  );
}

/** Phone layout for one ticket: a tappable card instead of a six-column row. */
function TicketCardRow({ t, selected, onOpen }: { t: Ticket; selected: boolean; onOpen: () => void }) {
  const dir = useDirectory();
  const a = personOf(dir, t.assignee);
  const link = t.links[0];
  return (
    <li className="border-t border-line-soft">
      <button
        type="button"
        onClick={onOpen}
        className={cn("flex w-full cursor-pointer flex-col gap-1.5 px-4 py-3 text-left active:bg-muted", selected && "bg-selected")}
      >
        <span className="flex items-start gap-2">
          {link ? (
            <CircleDotIcon aria-label="Linked to GitHub" className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2.2} />
          ) : (
            <CircleDashedIcon aria-label="Draft, no GitHub link" className="mt-0.5 size-4 shrink-0 text-subtle" />
          )}
          <span className="line-clamp-2 text-body leading-snug font-semibold text-foreground">{t.title || "Untitled ticket"}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-meta text-muted-foreground">
          <StatusPill status={t.status} bordered className="py-px" />
          <PriorityLabel priority={t.priority} />
          <BlockedBadge t={t} />
          <span aria-hidden>·</span>
          <span>{t.id}</span>
          {link && <span>· {link.kind === "PR" ? "PR " : ""}#{link.num}</span>}
          <DueDate t={t} />
          <ChecklistCount t={t} />
          <LabelChips labels={t.labels} max={2} />
          <span className="ml-auto flex items-center gap-1.5">
            <Avatar person={a} size="xs" />
            <span className="max-w-[110px] truncate">{t.assignee === dir.me ? "You" : a.first}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** "Blocked" when an open ticket is still waiting on another one. */
function BlockedBadge({ t }: { t: Ticket }) {
  const { all } = useVisibleTickets();
  if (t.status === "Done") return null;
  const open = openBlockers(t, all);
  if (!open.length) return null;
  return (
    <span
      title={`Blocked by ${open.map((b) => b.id).join(", ")}`}
      className="shrink-0 rounded-sm bg-danger-soft px-1.5 py-px text-2xs font-medium text-destructive"
    >
      Blocked
    </span>
  );
}
