"use client";

import { ArrowLeftIcon, LoaderCircleIcon, MessageSquareIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { StatusPill } from "@/components/common/status-pill";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useMission, useMissionActions } from "@/hooks/use-missions";
import { openBlockers } from "@/lib/agent/blockers";
import { personOf } from "@/lib/directory";
import { criticalPath, levels, progress, type Decision, type MissionView, type PlanTask } from "@/lib/missions";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { MissionStatusTag, ProgressBar, fmtDay } from "./mission-bits";

/** One mission: its plan as a dependency graph, live progress, decisions and timeline. */
export function MissionBoard({ id }: { id: string }) {
  const { data, isPending, error } = useMission(id);
  if (isPending) return <Shell title="Mission">Loading…</Shell>;
  if (error || !data) return <Shell title="Mission">This mission doesn&apos;t exist or was removed.</Shell>;
  return <Board view={data} />;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ScreenHeader back="/missions">
        <h1 className="text-base font-semibold">{title}</h1>
      </ScreenHeader>
      <div className="p-6 text-meta text-muted-foreground">{children}</div>
    </main>
  );
}

function Board({ view }: { view: MissionView }) {
  const { mission: m, tickets, decisions, events } = view;
  const dir = useDirectory();
  const role = useRole();
  const router = useRouter();
  const act = useMissionActions(m.id);
  const byTicket = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const launched = m.status !== "draft" && m.status !== "planning";
  const pct = launched ? progress(tickets) : 0;
  const open = decisions.filter((d) => d.status === "open");
  const busy = act.launch.isPending || act.checkIn.isPending;
  const err = (act.launch.error ?? act.checkIn.error ?? act.answer.error) as Error | null;

  const openThread = () => {
    // The chat opens the thread once its messages load (same path as a cited message).
    if (m.threadId) useUiStore.setState({ focus: { chatId: m.chatId, threadId: m.threadId, id: m.threadId } });
    router.push(`/chat/${m.chatId}`);
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ScreenHeader
        back="/missions"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openThread} className="h-9 px-3">
              <MessageSquareIcon className="size-4" /> <span className="hidden sm:inline">Thread</span>
            </Button>
            {role !== "guest" && m.status === "draft" && (
              <Button onClick={() => act.launch.mutate()} disabled={busy} className="h-9 px-3">
                {act.launch.isPending ? <LoaderCircleIcon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />} Launch mission
              </Button>
            )}
            {role !== "guest" && (m.status === "active" || m.status === "at_risk") && (
              <Button onClick={() => act.checkIn.mutate()} disabled={busy} className="h-9 px-3">
                {act.checkIn.isPending ? <LoaderCircleIcon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
                {act.checkIn.isPending ? "Checking in…" : "Run check-in"}
              </Button>
            )}
          </div>
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/missions" aria-label="All missions" className="hidden text-muted-foreground hover:text-foreground md:inline-flex">
            <ArrowLeftIcon className="size-4" />
          </Link>
          <h1 className="truncate text-base font-semibold">{m.title}</h1>
          <MissionStatusTag status={m.status} />
        </div>
      </ScreenHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas lg:flex-row lg:overflow-hidden">
        <section className="min-w-0 flex-1 lg:overflow-auto">
          <div className="border-b bg-card px-4 py-4 sm:px-6">
            <p className="text-sm text-ink-2">{m.goal}</p>
            {m.summary && <p className="mt-1 text-meta text-muted-foreground">Done means: {m.summary}</p>}
            <div className="mt-3 grid max-w-3xl grid-cols-2 gap-4 text-meta sm:grid-cols-4">
              <Stat label="Due" value={fmtDay(m.deadline)} />
              <Stat label="Tasks" value={launched ? `${tickets.filter((t) => t.status === "Done").length} of ${tickets.length} done` : `${m.plan.tasks.length} planned`} />
              <Stat label="Owners" value={String(new Set(m.plan.tasks.map((t) => t.owner)).size)} />
              <Stat label="Lead" value="Atlas" />
            </div>
            {launched && <ProgressBar value={pct} className="mt-3 max-w-3xl" />}
            {m.health && <p className="mt-2 text-meta font-medium text-ink-2">{m.health}</p>}
            {err && <p role="alert" className="mt-2 text-meta text-destructive">{err.message}</p>}
          </div>

          {m.status === "planning" && (
            <div className="flex items-center gap-2 border-b bg-card px-4 py-2.5 text-meta text-ink-2 sm:px-6" role="status">
              <LoaderCircleIcon className="size-3.5 animate-spin text-brand" />
              {m.plan.tasks.length
                ? `Atlas is drafting the plan: ${m.plan.tasks.length} task${m.plan.tasks.length === 1 ? "" : "s"} so far…`
                : "Atlas is reading the channel and open tickets to draft a plan…"}
            </div>
          )}
          {m.plan.tasks.length > 0 && <Graph tasks={m.plan.tasks} byTicket={byTicket} launched={launched} />}
        </section>

        <aside className="w-full shrink-0 border-t bg-card lg:w-[340px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <Panel title={open.length ? `Needs you · ${open.length}` : "Decisions"}>
            {!decisions.length && <p className="text-meta text-muted-foreground">Nothing waiting on a person.</p>}
            {decisions.map((d) => (
              <DecisionCard key={d.id} d={d} disabled={role === "guest" || act.answer.isPending} onAnswer={(a) => act.answer.mutate({ decisionId: d.id, answer: a })} />
            ))}
          </Panel>
          {m.plan.risks.length > 0 && (
            <Panel title="Risks">
              <ul className="space-y-1.5 text-meta text-ink-2">
                {m.plan.risks.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--status-review-dot)]" />
                    {r}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Timeline">
            <ol className="space-y-2.5">
              {[...events].reverse().map((e, i) => (
                <li key={i} className="text-meta">
                  <div className="text-ink-2">{e.text}</div>
                  <div className="text-2xs text-muted-foreground">
                    {personOf(dir, e.actor ?? "atlas").name} · {new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                </li>
              ))}
              {!events.length && <li className="text-meta text-muted-foreground">No activity yet.</li>}
            </ol>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b px-4 py-4 last:border-b-0">
      <h2 className="mb-2.5 text-[12px] font-medium text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

function DecisionCard({ d, onAnswer, disabled }: { d: Decision; onAnswer: (a: string) => void; disabled: boolean }) {
  const dir = useDirectory();
  return (
    <div className="mb-3 rounded-md border p-3 last:mb-0">
      <p className="text-sm font-medium">{d.question}</p>
      {d.context && <p className="mt-1 text-meta text-muted-foreground">{d.context}</p>}
      {d.status === "open" ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {d.options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onAnswer(o)}
              className="h-8 cursor-pointer rounded border px-2.5 text-meta font-medium hover:border-brand hover:text-brand disabled:cursor-default disabled:opacity-60"
            >
              {o}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-meta text-ink-2">
          <span className="font-semibold">Decided:</span> {d.answer} <span className="text-muted-foreground">· {personOf(dir, d.answeredBy ?? "").name}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The plan as a left-to-right dependency graph: a column per dependency level, cards for
 * tasks (live ticket state once launched), lines for "waits on", the critical path in
 * the brand color.
 */
function Graph({ tasks, byTicket, launched }: { tasks: PlanTask[]; byTicket: Map<string, Ticket>; launched: boolean }) {
  const lv = useMemo(() => levels(tasks), [tasks]);
  const path = useMemo(() => new Set(criticalPath(tasks)), [tasks]);
  const cols = useMemo(() => {
    const n = Math.max(0, ...Object.values(lv)) + 1;
    return Array.from({ length: n }, (_, i) => tasks.filter((t) => (lv[t.key] ?? 0) === i));
  }, [tasks, lv]);
  const wrap = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ d: string; hot: boolean }[]>([]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const draw = () => {
      const box = el.getBoundingClientRect();
      const pos = (k: string) => el.querySelector<HTMLElement>(`[data-task="${k}"]`)?.getBoundingClientRect();
      const out: { d: string; hot: boolean }[] = [];
      for (const t of tasks) {
        const to = pos(t.key);
        for (const dep of t.dependsOn) {
          const from = pos(dep);
          if (!from || !to) continue;
          const x1 = from.right - box.left + el.scrollLeft, y1 = from.top + from.height / 2 - box.top + el.scrollTop;
          const x2 = to.left - box.left + el.scrollLeft, y2 = to.top + to.height / 2 - box.top + el.scrollTop;
          const mx = (x1 + x2) / 2;
          out.push({ d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, hot: path.has(t.key) && path.has(dep) });
        }
      }
      setLines(out);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tasks, path, byTicket]);

  return (
    <div ref={wrap} className="relative overflow-x-auto px-4 py-5 sm:px-6">
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {lines.map((l, i) => (
          <path key={i} d={l.d} fill="none" strokeWidth={l.hot ? 1.75 : 1.25} className={l.hot ? "stroke-brand" : "stroke-[var(--input)]"} />
        ))}
      </svg>
      <div className="relative flex gap-10">
        {cols.map((col, i) => (
          <div key={i} className="flex w-[248px] shrink-0 flex-col gap-3">
            <div className="text-[12px] font-medium text-muted-foreground">{i === 0 ? "Start now" : `Then (step ${i + 1})`}</div>
            {col.map((t) => (
              <TaskCard key={t.key} t={t} ticket={t.ticketId ? byTicket.get(t.ticketId) : undefined} hot={path.has(t.key)} launched={launched} all={[...byTicket.values()]} />
            ))}
          </div>
        ))}
      </div>
      <p className="relative mt-5 text-2xs text-muted-foreground">
        <span className="mr-1.5 inline-block h-0.5 w-5 translate-y-[-2px] bg-brand align-middle" /> Critical path: the chain that sets the finish date.
      </p>
    </div>
  );
}

function TaskCard({ t, ticket, hot, launched, all }: { t: PlanTask; ticket?: Ticket; hot: boolean; launched: boolean; all: Ticket[] }) {
  const dir = useDirectory();
  const owner = personOf(dir, ticket?.assignee ?? t.owner);
  const live = !!ticket && ticket.status !== "Done" && ticket.status !== "Backburner";
  const blocked = live ? openBlockers(ticket, all).length > 0 : false;
  const late = live && (ticket.due ?? t.due ?? "9999") < new Date().toISOString().slice(0, 10);
  const open = () => ticket && useUiStore.setState({ ticketId: ticket.id, threadId: null });
  return (
    <button
      type="button"
      data-task={t.key}
      onClick={open}
      disabled={!ticket}
      className={cn(
        "rounded-md border bg-card p-3 text-left transition-colors",
        ticket ? "cursor-pointer hover:border-subtle" : "cursor-default",
        hot && "border-l-[3px] border-l-brand",
        (ticket?.status === "Done" || ticket?.status === "Backburner") && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-2xs text-muted-foreground">{ticket?.id ?? (t.existing ? t.existing : launched ? "" : "Draft")}</span>
        {ticket ? <StatusPill status={ticket.status} /> : t.existing ? <span className="text-2xs text-muted-foreground">existing ticket</span> : null}
      </div>
      <div className="mt-1 text-sm leading-snug font-medium">{ticket?.title ?? t.title}</div>
      <div className="mt-2 flex items-center gap-2 text-meta text-muted-foreground">
        <Avatar person={owner} size="xs" className="size-5 text-2xs" />
        <span className="truncate">{owner.name}</span>
        {owner.isAgent && <span className="rounded border px-1 text-2xs">agent</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-2xs">
        <span className={late ? "font-semibold text-destructive" : "text-muted-foreground"}>Due {fmtDay(ticket?.due ?? t.due)}</span>
        {blocked && <span className="font-semibold text-[var(--status-review-fg)]">Waiting on {openBlockers(ticket!, all).map((b) => b.id).join(", ")}</span>}
      </div>
    </button>
  );
}
