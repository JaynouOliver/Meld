"use client";

import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  ClockIcon,
  GitPullRequestIcon,
  BotIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { Avatar } from "@/components/common/avatar";
import { PriorityLabel } from "@/components/common/priority-label";
import { StatusPill } from "@/components/common/status-pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDirectory } from "@/hooks/use-directory";
import { useWeekActivity } from "@/hooks/use-tickets";
import { OPEN_STATUSES, STATUSES } from "@/lib/constants";
import { ATLAS_ID, personOf, teamName } from "@/lib/directory";
import { todayIndex } from "@/lib/format";
import type { Priority, Ticket, TicketScope } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const noopSubscribe = () => () => {};

export function TicketCharts({ tickets, scope = "all" }: { tickets: Ticket[]; scope?: TicketScope }) {
  const [timeframe, setTimeframe] = useState<"7D" | "30D" | "QTD">("7D");
  const openTicket = useUiStore((s) => s.openTicket);
  const setTicketQuery = useUiStore((s) => s.setTicketQuery);
  const dir = useDirectory();

  // Reference list: either scoped or passed allTickets
  const activeTickets = tickets;
  const total = activeTickets.length;
  const doneCount = activeTickets.filter((t) => t.status === "Done").length;
  const inReviewCount = activeTickets.filter((t) => t.status === "In review").length;
  const inProgressCount = activeTickets.filter((t) => t.status === "In progress").length;
  const todoCount = activeTickets.filter((t) => t.status === "To do").length;
  const linkedCount = activeTickets.filter((t) => t.links.length > 0).length;
  const atlasFiledCount = activeTickets.filter((t) => t.reporter === ATLAS_ID).length;
  const prPercent = total > 0 ? Math.round((linkedCount / total) * 100) : 0;

  // Stalled or attention items: In review tickets or high-priority unstarted
  const attentionTickets = activeTickets.filter(
    (t) => t.status === "In review" || (t.priority === "High" && t.status === "To do") || t.reporter === ATLAS_ID,
  );

  return (
    <section aria-label="Insights & Analytics" className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 sm:p-4">
      {/* Header bar with controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <TrendingUpIcon className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Insights</h2>
            <p className="text-2xs text-muted-foreground">Throughput, agent activity and review health</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {scope === "mine" && (
            <span className="rounded-sm bg-accent px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
              Your tickets ({total})
            </span>
          )}
          <div role="group" aria-label="Timeframe" className="inline-flex rounded-md border border-border bg-muted p-0.5 text-2xs font-medium">
            {(["7D", "30D", "QTD"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimeframe(t)}
                className={cn(
                  "rounded-[4px] px-2 py-1 transition-colors cursor-pointer",
                  timeframe === t ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 1: Executive KPI Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {/* KPI 1: Delivery Velocity */}
        <div className="flex flex-col gap-1 rounded-md border border-line-soft bg-canvas p-2.5 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold text-muted-foreground">Completed</span>
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-success-soft px-1.5 py-0.5 text-2xs font-medium text-success">
              +14% vs 7d
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-semibold text-foreground tabular">{doneCount}</span>
            <span className="text-xs text-muted-foreground">/ {total} closed</span>
          </div>
          <p className="text-2xs text-ink-2 truncate">Avg 1.8d turnaround · 0 blocked</p>
        </div>

        {/* KPI 2: Atlas AI Automation Impact */}
        <div className="flex flex-col gap-1 rounded-md border border-line-soft bg-canvas p-2.5 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold text-muted-foreground flex items-center gap-1">
              <BotIcon className="size-3" />
              Agent activity
            </span>
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-agent px-1.5 py-0.5 text-2xs font-medium text-agent-foreground border border-agent-border">
              44% auto
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-semibold text-foreground tabular">32</span>
            <span className="text-xs text-muted-foreground">agent actions</span>
          </div>
          <p className="text-2xs text-ink-2 truncate">~6.5h manual ticket work saved</p>
        </div>

        {/* KPI 3: Review Dwell Time & SLA */}
        <div className="flex flex-col gap-1 rounded-md border border-line-soft bg-canvas p-2.5 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold text-muted-foreground flex items-center gap-1">
              <ClockIcon className="size-3" />
              Time in review
            </span>
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-success-soft px-1.5 py-0.5 text-2xs font-medium text-success">
              Healthy
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-semibold text-foreground tabular">14h</span>
            <span className="text-xs text-muted-foreground">avg in review</span>
          </div>
          <p className="text-2xs text-ink-2 truncate">{inReviewCount} pending review · 0 breached (&gt;48h)</p>
        </div>

        {/* KPI 4: Engineering Linkage */}
        <div className="flex flex-col gap-1 rounded-md border border-line-soft bg-canvas p-2.5 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold text-muted-foreground flex items-center gap-1">
              <GitPullRequestIcon className="size-3" />
              Linked to GitHub
            </span>
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-selected px-1.5 py-0.5 text-2xs font-medium text-link">
              {linkedCount}/{total} PRs
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-semibold text-foreground tabular">{prPercent}%</span>
            <span className="text-xs text-muted-foreground">traceable</span>
          </div>
          <p className="text-2xs text-ink-2 truncate">Direct GitHub PR & issue branches</p>
        </div>
      </div>

      {/* Row 2: Deep Analytics Visualizations */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Chart 1: People vs Atlas Activity */}
        <div className="rounded-md border border-line-soft bg-canvas p-3 sm:p-3.5">
          <WeekActivityChart />
        </div>

        {/* Chart 2: Workflow Stage Funnel with direct click-to-filter */}
        <div className="rounded-md border border-line-soft bg-canvas p-3 sm:p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-line-soft">
              <h3 className="text-xs font-semibold text-foreground">By status</h3>
              <span className="text-2xs text-muted-foreground">Select to filter</span>
            </div>
            <div className="mt-2.5 flex flex-col gap-2">
              {STATUSES.map((st) => {
                const count = activeTickets.filter((t) => t.status === st).length;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTicketQuery(`status:${st.replace(/\s+/g, "")}`)}
                    className="group flex flex-col gap-1 text-left rounded p-1 hover:bg-card transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <StatusPill status={st} />
                      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                        <span className="font-semibold text-foreground tabular">{count}</span>
                        <span>({pct}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-accent">
                      <div
                        className="h-full rounded-[2px] transition-all group-hover:opacity-85"
                        style={{
                          width: `${pct}%`,
                          background: st === "Done" ? "var(--success)" : st === "In review" ? "var(--warning)" : st === "In progress" ? "var(--brand)" : "var(--subtle)",
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-line-soft text-2xs text-muted-foreground flex items-center justify-between">
            <span>Active work: {inProgressCount + inReviewCount + todoCount} tickets</span>
            <span className="text-success font-semibold">{doneCount} done</span>
          </div>
        </div>

        {/* Chart 3: Scope-Aware Workload Capacity */}
        <div className="rounded-md border border-line-soft bg-canvas p-3 sm:p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-line-soft">
              <h3 className="text-xs font-semibold text-foreground">
                {scope === "mine" ? "Your focus" : "Work in progress by person"}
              </h3>
              <span className="text-2xs text-muted-foreground">
                {scope === "mine" ? "By priority and team" : "Target: 1–3 open"}
              </span>
            </div>

            {scope === "all" ? (
              <div className="mt-2.5 flex flex-col gap-2">
                {dir.personOrder.filter((k) => k !== ATLAS_ID).map((k) => {
                  const p = personOf(dir, k);
                  const openCount = activeTickets.filter((t) => t.assignee === k && OPEN_STATUSES.includes(t.status)).length;
                  const capacityBadge =
                    openCount > 3 ? (
                      <span className="rounded bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold text-warning">Heavy</span>
                    ) : openCount === 0 ? (
                      <span className="rounded bg-accent px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground">Available</span>
                    ) : (
                      <span className="rounded bg-success-soft px-1.5 py-0.5 text-2xs font-semibold text-success">Optimal</span>
                    );

                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTicketQuery(`assignee:${p.first.toLowerCase()}`)}
                      className="flex items-center justify-between rounded p-1 hover:bg-card transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar person={p} size="xs" />
                        <span className="truncate text-xs font-medium text-foreground">{p.name}</span>
                        {p.team && <span className="text-2xs text-muted-foreground hidden sm:inline">{teamName(dir, p.team)}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-foreground tabular">{openCount} active</span>
                        {capacityBadge}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-2.5 flex flex-col gap-2.5">
                <div className="rounded border border-line-soft bg-card p-2">
                  <div className="text-2xs font-semibold text-muted-foreground pb-1.5">By priority</div>
                  <div className="flex items-center gap-3">
                    {(["High", "Medium", "Low"] as Priority[]).map((pr) => {
                      const count = activeTickets.filter((t) => t.priority === pr).length;
                      return (
                        <div key={pr} className="flex items-center gap-1.5 text-xs">
                          <PriorityLabel priority={pr} />
                          <span className="font-bold tabular text-foreground">({count})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded border border-line-soft bg-card p-2">
                  <div className="text-2xs font-semibold text-muted-foreground pb-1.5">By team</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {dir.teams.map(({ id: tm, name }) => {
                      const count = activeTickets.filter((t) => t.team === tm).length;
                      if (count === 0) return null;
                      return (
                        <span key={tm} className="rounded bg-accent px-2 py-0.5 text-2xs font-semibold text-ink-2">
                          {name}: {count}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-line-soft text-2xs text-muted-foreground flex items-center justify-between">
            <span>{atlasFiledCount} tickets filed via Atlas chat</span>
            <span className="font-medium text-ink-2">100% within review target</span>
          </div>
        </div>
      </div>

      {/* Row 3: Actionable Attention Queue ("Needs Attention") */}
      {attentionTickets.length > 0 && (
        <div className="rounded-md border border-line-soft bg-canvas p-3 sm:p-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-line-soft">
            <div className="flex items-center gap-1.5">
              <AlertTriangleIcon className="size-3.5 text-warning" />
              <h3 className="text-xs font-semibold text-foreground">Needs attention</h3>
            </div>
            <span className="text-2xs text-muted-foreground">{attentionTickets.length} items flagged</span>
          </div>

          <div className="mt-2 grid grid-cols-1 divide-y divide-line-soft">
            {attentionTickets.slice(0, 3).map((t) => {
              const a = personOf(dir, t.assignee);
              const isReview = t.status === "In review";
              return (
                <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xs font-medium text-muted-foreground shrink-0">{t.id}</span>
                    <button
                      type="button"
                      onClick={() => openTicket(t.id)}
                      className="truncate font-semibold text-foreground hover:underline text-left"
                    >
                      {t.title}
                    </button>
                    <StatusPill status={t.status} className="py-px text-2xs shrink-0" />
                    {t.reporter === ATLAS_ID && (
                      <span className="hidden sm:inline-flex items-center gap-0.5 rounded bg-agent px-1 text-2xs font-semibold text-agent-foreground">
                        <BotIcon className="size-2.5" />
                        Agent filed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-2xs text-muted-foreground hidden sm:inline">
                      {isReview ? "Waiting on review" : `Assigned to ${t.assignee === dir.me ? "you" : a.first}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => openTicket(t.id)}
                      className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-2xs font-semibold text-primary hover:bg-muted cursor-pointer transition-colors"
                    >
                      Open
                      <ArrowUpRightIcon className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Day-by-day activity chart comparing People vs Atlas */
function WeekActivityChart() {
  const { data: week } = useWeekActivity();
  const today = useSyncExternalStore(noopSubscribe, todayIndex, () => -1);
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked ?? (today >= 0 ? today : null);
  const days = week ?? [];
  const selDay = sel !== null ? days[sel] : undefined;
  const max = Math.max(1, ...days.map((d) => Math.max(d.p, d.a)));
  const h = (v: number) => `${Math.max(4, Math.round((v / max) * 88))}px`;

  const totalPeople = days.reduce((sum, d) => sum + d.p, 0);
  const totalAtlas = days.reduce((sum, d) => sum + d.a, 0);

  return (
    <div className="flex flex-col justify-between h-full">
      <div className="flex flex-wrap items-baseline justify-between gap-1 pb-2 border-b border-line-soft">
        <h3 className="text-xs font-semibold text-foreground">Activity this week</h3>
        <div className="flex items-center gap-2.5 text-2xs">
          <span className="inline-flex items-center gap-1 text-ink-2">
            <span className="size-2 rounded-xs bg-brand" />
            People ({totalPeople})
          </span>
          <span className="inline-flex items-center gap-1 text-ink-2">
            <span className="size-2 rounded-xs bg-atlas-series" />
            Atlas ({totalAtlas})
          </span>
        </div>
      </div>

      <div className="grid h-[100px] grid-cols-7 items-end gap-1.5 border-b border-input px-0.5 pt-3" aria-hidden>
        {days.map((d, i) => (
          <div
            key={d.d}
            onClick={() => setPicked(i)}
            className={cn("flex h-full cursor-pointer items-end justify-center gap-0.5 rounded-t-sm transition-colors", i === sel && "bg-selected")}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-[42%] max-w-3 rounded-t-[2px] bg-brand hover:opacity-85" style={{ height: h(d.p) }} />
              </TooltipTrigger>
              <TooltipContent side="top">{`${d.d} · People: ${d.p} actions`}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-[42%] max-w-3 rounded-t-[2px] bg-atlas-series hover:opacity-85" style={{ height: h(d.a) }} />
              </TooltipTrigger>
              <TooltipContent side="top">{`${d.d} · Atlas: ${d.a} agent actions`}</TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 px-0.5 pt-1" aria-hidden>
        {days.map((d, i) => (
          <span key={d.d} className={cn("text-center text-[11px]/4", i === today ? "font-semibold text-primary" : "text-muted-foreground")}>
            {d.d}
          </span>
        ))}
      </div>

      <p aria-live="polite" className="mt-2 text-2xs text-ink-2 pt-1">
        {selDay ? (
          <>
            <span className="font-semibold text-foreground">{selDay.d}</span>: People {selDay.p} ops · Atlas {selDay.a} ops
          </>
        ) : (
          "Select a day for details"
        )}
      </p>
    </div>
  );
}
