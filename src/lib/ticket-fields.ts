import type { Ticket } from "./types";

/**
 * Rules for the Jira-style ticket fields (labels, estimate, due date, checklist,
 * comments), shared by the API, Atlas's tools and the UI so they agree on what's valid.
 */

export const MAX_LABELS = 8;
export const MAX_LABEL_LENGTH = 24;
export const MAX_CHECKLIST_ITEMS = 30;
export const MAX_COMMENT_LENGTH = 4000;
/** Story points: Fibonacci-ish in practice, but any value up to 100 (halves allowed). */
export const MAX_ESTIMATE = 100;

/** "Launch Prep " → "launch-prep". Empty when nothing usable is left. */
export function normLabel(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LABEL_LENGTH);
}

/** Normalized, de-duplicated labels, or an error the caller can show as is. */
export function cleanLabels(input: unknown): { labels: string[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "Labels must be a list" };
  const out: string[] = [];
  for (const x of input) {
    if (typeof x !== "string") return { error: "Labels must be text" };
    const l = normLabel(x);
    if (!l) return { error: `"${x}" isn't a usable label` };
    if (!out.includes(l)) out.push(l);
  }
  if (out.length > MAX_LABELS) return { error: `A ticket can have at most ${MAX_LABELS} labels` };
  return { labels: out };
}

/** A valid story-point value, or an error. null clears the estimate. */
export function cleanEstimate(input: unknown): { estimate: number | null } | { error: string } {
  if (input === null) return { estimate: null };
  const n = typeof input === "string" && input.trim() ? Number(input) : input;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_ESTIMATE) return { error: `Estimate must be a number from 0 to ${MAX_ESTIMATE}` };
  if (Math.round(n * 2) !== n * 2) return { error: "Estimate can only use whole or half points" };
  return { estimate: n };
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
export function isValidDue(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today in the viewer's local calendar, YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Past its due date and not finished. Backburner tickets aren't "late". */
export function isOverdue(t: Pick<Ticket, "due" | "status">, today = todayISO()) {
  return !!t.due && t.due < today && t.status !== "Done" && t.status !== "Backburner";
}

/** "Nov 7" (adds the year when it isn't this year). */
export function formatDue(due: string, now = new Date()) {
  const d = new Date(`${due}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getUTCFullYear() !== now.getFullYear() ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/** Checklist progress, or null when the ticket has no checklist. */
export function checklistProgress(t: Pick<Ticket, "checklist">) {
  const items = t.checklist ?? [];
  if (!items.length) return null;
  return { done: items.filter((i) => i.done).length, total: items.length };
}
