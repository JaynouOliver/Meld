import type { PersonId, Ticket } from "./types";

/**
 * Missions: a goal with a deadline that agents plan into tickets (with owners, due dates
 * and dependencies), then drive with check-ins, escalating decisions to people.
 * Tasks become real tickets on launch; dependencies are ticket blockers.
 */
export type MissionStatus = "planning" | "draft" | "active" | "at_risk" | "done" | "canceled";

export interface PlanTask {
  key: string;
  title: string;
  description: string;
  /** A person id or an agent id. */
  owner: PersonId;
  team: string;
  priority: "Low" | "Medium" | "High";
  /** YYYY-MM-DD */
  due: string | null;
  dependsOn: string[];
  /** Reuses an existing ticket instead of filing a new one. */
  existing?: string | null;
  /** Ticket id once launched. */
  ticketId?: string | null;
}

export interface Plan {
  tasks: PlanTask[];
  risks: string[];
}

export interface Mission {
  id: string;
  title: string;
  goal: string;
  chatId: string;
  threadId: string | null;
  status: MissionStatus;
  deadline: string | null;
  plan: Plan;
  summary: string;
  health: string;
  createdBy: PersonId | null;
  createdAt: string;
  launchedAt: string | null;
  lastCheckinAt: string | null;
}

export interface Decision {
  id: string;
  missionId: string;
  question: string;
  options: string[];
  context: string;
  status: "open" | "answered";
  answer: string | null;
  answeredBy: PersonId | null;
  answeredAt: string | null;
  createdAt: string;
  /** What applying an option does, for decisions Atlas raised itself (a slip). Others are applied by Atlas reading the answer. */
  actions?: Record<string, DecisionAction>;
}

export type DecisionAction = { kind: "move_deadline"; date: string } | { kind: "cut"; ticketId: string } | { kind: "keep" };

export interface MissionEvent {
  missionId: string;
  kind: "planned" | "launched" | "checkin" | "nudge" | "decision" | "replanned" | "done" | "canceled";
  actor: PersonId | null;
  text: string;
  at: string;
}

/** A mission with its live tickets, decisions and timeline, as the board shows it. */
export interface MissionView {
  mission: Mission;
  tickets: Ticket[];
  decisions: Decision[];
  events: MissionEvent[];
}

/** Dependency depth per task key (0 = can start now): the board's columns. */
export function levels(tasks: Pick<PlanTask, "key" | "dependsOn">[]): Record<string, number> {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const memo: Record<string, number> = {};
  const depth = (k: string, seen = new Set<string>()): number => {
    if (memo[k] !== undefined) return memo[k];
    if (seen.has(k)) return 0;
    seen.add(k);
    const t = byKey.get(k);
    const d = t && t.dependsOn.length ? 1 + Math.max(...t.dependsOn.filter((x) => byKey.has(x)).map((x) => depth(x, seen)), -1) : 0;
    return (memo[k] = Math.max(d, 0));
  };
  for (const t of tasks) depth(t.key);
  return memo;
}

/** The longest chain of dependent tasks (by due date, then by count): what sets the finish date. */
export function criticalPath(tasks: Pick<PlanTask, "key" | "dependsOn" | "due">[]): string[] {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const memo = new Map<string, string[]>();
  const chain = (k: string, seen = new Set<string>()): string[] => {
    if (memo.has(k)) return memo.get(k)!;
    if (seen.has(k)) return [k];
    seen.add(k);
    const t = byKey.get(k);
    let best: string[] = [];
    for (const d of t?.dependsOn ?? []) {
      if (!byKey.has(d)) continue;
      const c = chain(d, seen);
      if (c.length > best.length) best = c;
    }
    const out = [...best, k];
    memo.set(k, out);
    return out;
  };
  let longest: string[] = [];
  for (const t of tasks) {
    const c = chain(t.key);
    if (c.length > longest.length || (c.length === longest.length && (byKey.get(c[c.length - 1])?.due ?? "") > (byKey.get(longest[longest.length - 1])?.due ?? ""))) longest = c;
  }
  return longest;
}

/** Share of mission tickets that are done (tasks cut from the mission don't count). */
export function progress(tickets: Pick<Ticket, "status">[]) {
  const live = tickets.filter((t) => t.status !== "Backburner");
  if (!live.length) return 0;
  return Math.round((live.filter((t) => t.status === "Done").length / live.length) * 100);
}
