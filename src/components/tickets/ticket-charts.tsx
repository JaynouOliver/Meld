"use client";

import { useState, useSyncExternalStore } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWeekActivity } from "@/hooks/use-tickets";
import { OPEN_STATUSES, PEOPLE, PERSON_ORDER } from "@/lib/constants";
import { todayIndex } from "@/lib/format";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

/*
 * Chart conventions (from the dataviz method): one hue per series, data ends rounded
 * 4px and anchored to the baseline, 2px gap between adjacent bars, a legend only for
 * 2+ series, hover tooltip on every bar, and values in text ink rather than series color.
 * People (brand) vs Atlas (amber) passes the CVD/contrast validator.
 */

function Card({ title, children, legend }: { title: string; children: React.ReactNode; legend?: React.ReactNode }) {
  return (
    <section className="relative flex w-[85%] shrink-0 snap-start flex-col gap-2.5 rounded-lg border bg-card px-4 py-3.5 sm:w-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {legend}
      </div>
      {children}
    </section>
  );
}

function HBar({ label, value, max, tip }: { label: string; value: number; max: number; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} className="group grid grid-cols-[92px_minmax(0,1fr)_24px] items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="truncate text-meta text-ink-2">{label}</span>
          <span className="h-3.5 rounded-r bg-accent">
            <span
              className="block h-3.5 rounded-r bg-brand transition-opacity group-hover:opacity-80"
              style={{ width: `${Math.round((value / max) * 100)}%` }}
            />
          </span>
          <span className="text-right text-meta font-semibold">{value}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  );
}

export function TicketCharts({ tickets }: { tickets: Ticket[] }) {
  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
  const byStatus = OPEN_STATUSES.map((s) => ({ label: s, v: open.filter((t) => t.status === s).length }));
  const sMax = Math.max(1, ...byStatus.map((x) => x.v));
  const byAssignee = PERSON_ORDER.map((k) => ({ label: k === "me" ? "You" : PEOPLE[k].name, v: open.filter((t) => t.assignee === k).length }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  const aMax = Math.max(1, ...byAssignee.map((x) => x.v));

  return (
    // Phones: a swipeable row of cards. Larger screens: a wrapping grid.
    <div className="-mx-4 flex items-start snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] sm:overflow-visible sm:px-0 sm:pb-0">
      <Card title="Open tickets by status">
        {byStatus.map((b) => (
          <HBar key={b.label} label={b.label} value={b.v} max={sMax} tip={`${b.label}: ${b.v} ticket${b.v === 1 ? "" : "s"}`} />
        ))}
      </Card>
      <Card title="Open tickets by assignee">
        {byAssignee.map((b) => (
          <HBar key={b.label} label={b.label} value={b.v} max={aMax} tip={`${b.label}: ${b.v} open`} />
        ))}
        {byAssignee.length === 0 && <span className="text-meta text-muted-foreground">Nothing open in this view.</span>}
      </Card>
      <WeekChart />
    </div>
  );
}

const noopSubscribe = () => () => {};

function WeekChart() {
  const { data: week } = useWeekActivity();
  // Client-only: the server prerender has no "today" (-1 highlights nothing).
  const today = useSyncExternalStore(noopSubscribe, todayIndex, () => -1);
  // Tapping a day shows its numbers (hover tooltips don't exist on touch screens).
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked ?? (today >= 0 ? today : null);
  const days = week ?? [];
  const selDay = sel !== null ? days[sel] : undefined;
  const max = Math.max(1, ...days.map((d) => Math.max(d.p, d.a)));
  const h = (v: number) => `${Math.max(3, Math.round((v / max) * 112))}px`;

  return (
    <Card
      title="Ticket changes this week"
      legend={
        <span className="flex gap-3 text-xs text-ink-2">
          <span className="inline-flex items-center gap-[5px]">
            <span className="size-2.5 rounded-xs bg-brand" />
            People
          </span>
          <span className="inline-flex items-center gap-[5px]">
            <span className="size-2.5 rounded-xs bg-atlas-series" />
            Atlas
          </span>
        </span>
      }
    >
      <div className="grid h-[120px] grid-cols-7 items-end gap-1.5 border-b border-input px-0.5" aria-hidden>
        {days.map((d, i) => (
          <div
            key={d.d}
            onClick={() => setPicked(i)}
            className={cn("flex h-full cursor-pointer items-end justify-center gap-0.5 rounded-t-sm", i === sel && "bg-selected")}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-[40%] max-w-3.5 rounded-t bg-brand hover:opacity-80" style={{ height: h(d.p) }} />
              </TooltipTrigger>
              <TooltipContent side="top">{`${d.d} · People: ${d.p} changes`}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-[40%] max-w-3.5 rounded-t bg-atlas-series hover:opacity-80" style={{ height: h(d.a) }} />
              </TooltipTrigger>
              <TooltipContent side="top">{`${d.d} · Atlas: ${d.a} changes`}</TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 px-0.5" aria-hidden>
        {days.map((d, i) => (
          <span key={d.d} className={cn("text-center text-2xs", i === today ? "font-bold text-foreground" : "text-muted-foreground")}>
            {d.d}
          </span>
        ))}
      </div>
      <p aria-live="polite" className="min-h-5 text-xs text-ink-2">
        {selDay && (
          <>
            <span className="font-semibold">{selDay.d}</span> · People {selDay.p} · Atlas {selDay.a} changes
          </>
        )}
      </p>
      <table className="sr-only">
        <caption>Ticket changes this week</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>People</th>
            <th>Atlas</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.d}>
              <td>{d.d}</td>
              <td>{d.p}</td>
              <td>{d.a}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
