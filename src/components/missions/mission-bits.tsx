"use client";

import type { MissionStatus } from "@/lib/missions";
import { cn } from "@/lib/utils";

export const fmtDay = (d: string | null | undefined) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "No date";

const STATUS: Record<MissionStatus, { label: string; cls: string }> = {
  planning: { label: "Planning", cls: "border-input text-muted-foreground" },
  draft: { label: "Draft", cls: "border-input text-ink-2" },
  active: { label: "On track", cls: "border-[var(--status-done-line)] text-[var(--status-done-fg)]" },
  at_risk: { label: "At risk", cls: "border-[var(--status-review-line)] text-[var(--status-review-fg)]" },
  done: { label: "Done", cls: "border-[var(--status-done-line)] bg-[var(--status-done-bg)] text-[var(--status-done-fg)]" },
  canceled: { label: "Canceled", cls: "border-input text-muted-foreground line-through" },
};

export function MissionStatusTag({ status }: { status: MissionStatus }) {
  const s = STATUS[status];
  return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-[12px] font-medium", s.cls)}>{s.label}</span>;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-sm bg-accent", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${value}%` }} />
    </div>
  );
}
