"use client";

import { ChevronDownIcon, CircleDashedIcon, CircleDotIcon, PlusIcon } from "lucide-react";

import { Avatar } from "@/components/common/avatar";
import { StatusPill } from "@/components/common/status-pill";
import { useCreateTicket } from "@/hooks/use-tickets";
import { PEOPLE, PERSON_ORDER, PRIORITY_COLOR, STATUS_COLORS, STATUS_ORDER, TEAMS, teamName } from "@/lib/constants";
import { matchQuery } from "@/lib/query-language";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

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
  const role = useUiStore((s) => s.role);
  const ticketId = useUiStore((s) => s.ticketId);
  const openTicket = useUiStore((s) => s.openTicket);
  const create = useCreateTicket();

  const filtered = tickets.filter((t) => matchQuery(t, query));

  let defs: GroupDef[];
  if (groupBy === "status") {
    defs = STATUS_ORDER.map((k) => ({ key: k, label: k, badge: "", color: STATUS_COLORS[k][3], round: true, test: (t) => t.status === k, preset: { status: k } }));
  } else if (groupBy === "team") {
    defs = TEAMS.map((k) => ({ key: k, label: teamName(k), badge: teamName(k).charAt(0), color: "#3D4451", round: false, test: (t) => t.team === k, preset: { team: k } }));
  } else {
    defs = PERSON_ORDER.map((k) => ({
      key: k, label: k === "me" ? "Suvra Das (you)" : PEOPLE[k].name, badge: PEOPLE[k].initials, color: PEOPLE[k].color, round: true,
      test: (t) => t.assignee === k, preset: { assignee: k, team: PEOPLE[k].team ?? "design" },
    }));
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
    <div className="-mx-4 border-y bg-white sm:mx-0 sm:rounded-[10px] sm:border md:overflow-x-auto">
      <div className="md:min-w-[860px]" role="table" aria-label="Tickets">
        <div role="row" className={cn("hidden border-b md:grid text-xs font-semibold text-muted-foreground", COLS)}>
          <span role="columnheader" className="px-3 py-2.5">
            <span className="sr-only">Row</span>
          </span>
          <span role="columnheader" className="px-3 py-2.5">Title</span>
          <span role="columnheader" className="border-l px-3 py-2.5">Assignee</span>
          <span role="columnheader" className="border-l px-3 py-2.5">Status</span>
          <span role="columnheader" className="border-l px-3 py-2.5">Team</span>
          <span role="columnheader" className="border-l px-3 py-2.5">Priority</span>
        </div>

        {loading && <div className="px-4 py-7 text-center text-sm text-muted-foreground">Loading tickets…</div>}

        {groups.map((g) => {
          const ck = `${groupBy}:${g.key}`;
          const open = !collapsed[ck];
          const preset = { ...g.preset, ...(role === "member" ? { team: "design" as const } : {}) };
          return (
            <div key={g.key} className="border-b last:border-b-0" role="rowgroup">
              <button
                type="button"
                onClick={() => toggleCollapsed(ck)}
                aria-expanded={open}
                className="sticky top-0 z-[1] flex min-h-12 w-full cursor-pointer items-center gap-2.5 bg-muted px-3 py-2 text-left hover:bg-[#F1F3F6] md:static"
              >
                <ChevronDownIcon className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} strokeWidth={2.4} />
                <span
                  aria-hidden
                  className={cn("flex size-6 shrink-0 items-center justify-center text-[10px] font-bold text-white", g.round ? "rounded-full" : "rounded-md")}
                  style={{ background: g.color }}
                >
                  {g.badge}
                </span>
                <span className="text-[15px] font-bold text-foreground">{g.label}</span>
                <span className="rounded-full bg-border px-2 py-px text-xs font-semibold text-ink-2">{g.items.length}</span>
              </button>
              {open && (
                <>
                  <ul className="md:hidden">
                    {g.items.map((t) => (
                      <TicketCardRow key={t.id} t={t} selected={ticketId === t.id} onOpen={() => openTicket(t.id)} />
                    ))}
                  </ul>
                  <div className="hidden md:block">
                  {g.items.map((t) => {
                    const a = PEOPLE[t.assignee];
                    const linked = t.links.length > 0;
                    return (
                      <div
                        key={t.id}
                        role="row"
                        className={cn("grid min-h-10 items-center border-t border-line-soft text-sm", COLS, ticketId === t.id ? "bg-selected" : "hover:bg-[#F8F9FB]")}
                      >
                        <span role="cell" className="px-3 text-right text-xs text-muted-foreground">{rowNum.get(t.id)}</span>
                        <span role="cell" className="flex min-w-0 items-center gap-2 px-3">
                          {linked ? (
                            <CircleDotIcon aria-label="Linked to GitHub" className="size-4 shrink-0 text-[#1A7F37]" strokeWidth={2.2} />
                          ) : (
                            <CircleDashedIcon aria-label="Draft, no GitHub link" className="size-4 shrink-0 text-subtle" />
                          )}
                          <button
                            type="button"
                            onClick={() => openTicket(t.id)}
                            className={cn("min-w-0 cursor-pointer truncate py-2 text-left font-medium hover:underline", linked ? "text-foreground" : "text-ink-2")}
                          >
                            {t.title || "Untitled ticket"}
                          </button>
                          <span className="shrink-0 text-[13px] text-muted-foreground">
                            {t.id}
                            {linked && ` · ${t.links[0].kind === "PR" ? "PR " : ""}#${t.links[0].num}`}
                          </span>
                        </span>
                        <span role="cell" className="flex h-full min-w-0 items-center gap-2 border-l border-line-soft px-3">
                          <Avatar person={a} size="xs" />
                          <span className="truncate text-[13px]">{a.name}</span>
                        </span>
                        <span role="cell" className="flex h-full items-center border-l border-line-soft px-3">
                          <StatusPill status={t.status} bordered className="py-px" />
                        </span>
                        <span role="cell" className="flex h-full items-center border-l border-line-soft px-3 text-[13px] text-ink-2">{teamName(t.team)}</span>
                        <span role="cell" className="flex h-full items-center border-l border-line-soft px-3 text-[13px] font-semibold" style={{ color: PRIORITY_COLOR[t.priority] }}>
                          {t.priority}
                        </span>
                      </div>
                    );
                  })}
                  </div>
                  {role !== "guest" && (
                    <button
                      type="button"
                      onClick={() => create.mutate(preset)}
                      className="flex min-h-12 w-full cursor-pointer items-center gap-2 border-t border-line-soft bg-white pr-3 pl-4 text-left md:min-h-10 md:pl-5 text-sm text-muted-foreground hover:bg-[#F8F9FB] hover:text-foreground"
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
  const a = PEOPLE[t.assignee];
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
            <CircleDotIcon aria-label="Linked to GitHub" className="mt-0.5 size-4 shrink-0 text-[#1A7F37]" strokeWidth={2.2} />
          ) : (
            <CircleDashedIcon aria-label="Draft, no GitHub link" className="mt-0.5 size-4 shrink-0 text-subtle" />
          )}
          <span className="line-clamp-2 text-[15px] leading-snug font-semibold text-foreground">{t.title || "Untitled ticket"}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[13px] text-muted-foreground">
          <StatusPill status={t.status} bordered className="py-px" />
          <span className="font-semibold" style={{ color: PRIORITY_COLOR[t.priority] }}>
            {t.priority}
          </span>
          <span aria-hidden>·</span>
          <span>{t.id}</span>
          {link && <span>· {link.kind === "PR" ? "PR " : ""}#{link.num}</span>}
          <span className="ml-auto flex items-center gap-1.5">
            <Avatar person={a} size="xs" />
            <span className="max-w-[110px] truncate">{t.assignee === "me" ? "You" : a.first}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
