import type { AgentInfo } from "./directory";
import type { ChatId, PersonId } from "./types";

/**
 * Time-based agent work: reminders (Atlas posts them when due) and Sunny's daily digest.
 * There's no always-on worker: due work is delivered lazily by whichever request comes
 * first after it's due (src/server/scheduled), with an atomic claim so it posts once.
 * Pure helpers here (time zones, parsing) are shared by the server, the UI and the tests.
 */
export type ReminderStatus = "pending" | "sent" | "canceled" | "failed";

export interface Reminder {
  id: string;
  createdBy: PersonId;
  /** A person (their Atlas DM) or a channel. */
  target: { kind: "person" | "channel"; id: PersonId | ChatId };
  text: string;
  /** When it's due (ISO, UTC). */
  dueAt: string;
  /** The time zone it was set in, for showing "9:00 AM" the way it was asked. */
  timeZone: string;
  status: ReminderStatus;
  attempts: number;
  /** "Remind me about this": the message it points back to. */
  source?: { chatId: ChatId; threadId: string | null; messageId: string } | null;
  createdAt: string;
  sentAt: string | null;
}

/** Reminders delivered per sweep, and delivery attempts before giving up. */
export const REMINDER_BATCH = 25;
export const REMINDER_MAX_ATTEMPTS = 3;
export const REMINDER_MAX_TEXT = 500;
/** How far ahead a reminder can be set. */
export const REMINDER_MAX_DAYS = 366;
/** The digest posts on the first activity after this hour (workspace time) on workdays. */
export const DIGEST_HOUR = 9;

/** Workspace default when nobody has told us theirs. */
export const DEFAULT_TIME_ZONE = "UTC";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour: Number(get("hour")) % 24, minute: Number(get("minute")), second: Number(get("second")),
    /** 0 = Sunday. */
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

/** Minutes the zone is ahead of UTC at that instant (New York in winter: -300). */
function offsetMinutes(at: Date, tz: string) {
  const p = zonedParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant a wall-clock time in a zone happens (DST-safe: re-checks the offset). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - offsetMinutes(new Date(guess), tz) * 60_000;
  t = guess - offsetMinutes(new Date(t), tz) * 60_000;
  return new Date(t);
}

/** The calendar day (YYYY-MM-DD) of an instant in a zone. */
export function localDay(at: Date, tz: string) {
  const p = zonedParts(at, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * When a reminder is due, from what the model (or the time picker) gave:
 * - an ISO time with an offset or Z: taken as is;
 * - a local wall-clock time ("2026-11-05T09:00", or a date alone = 9:00) in `tz`;
 * - or minutes from now.
 * Returns null when it can't be read.
 */
export function parseWhen(input: { when?: unknown; inMinutes?: unknown }, tz: string, now = new Date()): Date | null {
  if (typeof input.inMinutes === "number" && Number.isFinite(input.inMinutes) && input.inMinutes > 0) {
    return new Date(now.getTime() + Math.round(input.inMinutes * 60) * 1000);
  }
  if (typeof input.when !== "string") return null;
  const s = input.when.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : new Date(t);
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/);
  if (!m) return null;
  const [y, mo, d, h = 9, mi = 0] = [m[1], m[2], m[3], m[4] ?? "9", m[5] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const out = zonedToUtc(y, mo, d, h, mi, tz);
  // 2026-02-31 rolls over: reject dates that don't exist.
  return localDay(out, tz) === `${m[1]}-${m[2]}-${m[3]}` ? out : null;
}

/** "Thu, Nov 5, 9:00 AM EST": exact, in the zone it was set in. */
export function formatWhen(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

/** "Now" line for an agent's context: local time, weekday and zone. */
export function nowLine(tz: string, now = new Date()) {
  const when = now.toLocaleString("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${when} (${localDay(now, tz)}), time zone ${tz}`;
}

/** Due: at or after DIGEST_HOUR on a workday (Mon-Fri) in the zone, and not posted today. */
export function digestDue(now: Date, tz: string, lastDay: string | null) {
  const p = zonedParts(now, tz);
  if (p.weekday === 0 || p.weekday === 6 || p.hour < DIGEST_HOUR) return false;
  return !lastDay || lastDay < localDay(now, tz);
}

/** The standup agent (Sunny in the demo): runs the daily digest in channels it's in. */
export function isStandupAgent(a: Pick<AgentInfo, "handle" | "name" | "description">) {
  return /stand-?up/i.test(`${a.handle} ${a.name} ${a.description}`);
}

/** Quick picks for "Remind me about this". */
export const REMIND_PRESETS = [
  { key: "20m", label: "In 20 minutes" },
  { key: "1h", label: "In 1 hour" },
  { key: "tomorrow", label: "Tomorrow at 9:00" },
] as const;

/** The due time for a preset, in the viewer's zone. */
export function presetTime(key: (typeof REMIND_PRESETS)[number]["key"], tz: string, now = new Date()): Date {
  if (key === "20m") return new Date(now.getTime() + 20 * 60_000);
  if (key === "1h") return new Date(now.getTime() + 60 * 60_000);
  const p = zonedParts(new Date(now.getTime() + 86400_000), tz);
  return zonedToUtc(p.year, p.month, p.day, 9, 0, tz);
}
