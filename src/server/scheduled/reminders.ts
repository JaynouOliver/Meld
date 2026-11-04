import { ApiError } from "@/lib/api/service";
import { currentCtx, deliverNotices } from "@/lib/context";
import { agentById, agentModeIn, agentsOf, ATLAS_ID, personOf, type Directory } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import {
  DEFAULT_TIME_ZONE, formatWhen, isValidTimeZone, nowLine, parseWhen, REMINDER_BATCH, REMINDER_MAX_ATTEMPTS, REMINDER_MAX_DAYS, REMINDER_MAX_TEXT, type Reminder,
} from "@/lib/scheduled";
import type { ChatId, Role } from "@/lib/types";
import { pingChanges } from "../realtime";

/**
 * Reminders: "remind me tomorrow at 9 to send the deck", "remind #engineering Friday
 * 10am to demo the webhooks". Atlas (set_reminder) and the "Remind me about this" picker
 * both come through createReminder; the sweep posts them when due, exactly once.
 */
export class ReminderError extends ApiError {}

const MAX_PENDING_PER_PERSON = 50;

// ---------------------------------------------------------------- time zones

/** The requester's zone: theirs if their browser reported it, else the workspace's, else UTC. */
export async function timeZoneFor(userId: string): Promise<{ tz: string; source: "yours" | "workspace" | "default" }> {
  const zones = await currentCtx().store.timeZones();
  if (zones[userId]) return { tz: zones[userId], source: "yours" };
  if (zones["*"]) return { tz: zones["*"], source: "workspace" };
  return { tz: DEFAULT_TIME_ZONE, source: "default" };
}

/** "Now: Wednesday, Nov 4, 2026, 3:42 PM (2026-11-04), time zone America/New_York" for an agent's context. */
export async function clockBlock(now = new Date()): Promise<string> {
  const { tz, source } = await timeZoneFor(currentCtx().dir.me).catch(() => ({ tz: DEFAULT_TIME_ZONE, source: "default" as const }));
  const note = source === "yours" ? "the requester's" : source === "workspace" ? "the workspace default; the requester's own isn't known" : "no time zone known yet";
  return `Now: ${nowLine(tz, now)} (${note}).`;
}

// Writes only when a zone changes (the browser reports it every minute).
const g = globalThis as typeof globalThis & { __meldZones?: Map<string, string> };
const reported = (g.__meldZones ??= new Map());

/** Remember the signed-in person's zone; the first one reported becomes the workspace default. */
export async function reportTimeZone(tz: unknown) {
  if (!isValidTimeZone(tz)) return;
  const { dir, store } = currentCtx();
  const key = `${dir.workspace.id}:${dir.me}`;
  if (reported.get(key) === tz) return;
  const zones = await store.timeZones();
  if (zones[dir.me] !== tz) await store.setTimeZone(dir.me, tz);
  if (!zones["*"]) await store.setTimeZone("*", tz);
  reported.set(key, tz);
}

// ---------------------------------------------------------------- targets

export type Target = Reminder["target"];

/**
 * Who or where a reminder goes: "me", a person (id, @first or full name) or a channel
 * (id or #name). People get it in their Atlas DM; channels need Atlas in them. Guests
 * can only remind themselves.
 */
export function resolveTarget(dir: Directory, raw: unknown, role: Role): Target | { error: string } {
  const s = (typeof raw === "string" ? raw : "").trim().replace(/^[@#]/, "");
  if (!s || /^(me|myself)$/i.test(s) || s === dir.me) return { kind: "person", id: dir.me };
  if (role === "guest") return { error: "Guests can only set reminders for themselves." };
  const lower = s.toLowerCase();

  const chat = dir.chats[s] ?? Object.values(dir.chats).find((c) => c.kind === "channel" && c.label.toLowerCase() === lower);
  if (chat) {
    if (chat.kind !== "channel") return { error: "Reminders go to a person or a channel, not a DM. Name the person instead." };
    if (!agentModeIn(dir, chat.id, ATLAS_ID)) return { error: `Atlas isn't in #${chat.label}, so it can't post there. Add Atlas to the channel first.` };
    return { kind: "channel", id: chat.id };
  }

  if (agentsOf(dir).some((a) => a.id === s || a.handle.toLowerCase() === lower || a.name.toLowerCase() === lower)) {
    return { error: "Agents don't get reminders. Remind a person or a channel." };
  }
  const people = dir.personOrder.map((id) => personOf(dir, id));
  const person = dir.people[s] ?? people.find((p) => p.name.toLowerCase() === lower) ?? (() => {
    const byFirst = people.filter((p) => p.first.toLowerCase() === lower);
    return byFirst.length === 1 ? byFirst[0] : undefined;
  })();
  if (!person) return { error: `No person or channel called "${s}" in this workspace.` };
  if (person.isAgent || agentById(dir, person.id)) return { error: "Agents don't get reminders. Remind a person or a channel." };
  return { kind: "person", id: person.id };
}

export function targetLabel(dir: Directory, t: Target) {
  if (t.kind === "channel") {
    const c = dir.chats[t.id];
    return c?.kind === "channel" ? `#${c.label}` : "a deleted channel";
  }
  return t.id === dir.me ? "you" : personOf(dir, t.id).name;
}

// ---------------------------------------------------------------- create, list, cancel

export interface CreateReminderInput {
  /** ISO with offset, or local wall-clock time ("2026-11-05T09:00") in the requester's zone. */
  when?: string | null;
  inMinutes?: number | null;
  text: string;
  /** "me", a person or a channel. */
  target?: string | null;
  role?: Role;
  /** "Remind me about this": the message it points back to. */
  source?: { chatId: ChatId; threadId: string | null; messageId: string } | null;
  /** The browser's zone, when it sends one (the time picker). */
  timeZone?: string | null;
}

export interface CreatedReminder {
  reminder: Reminder;
  /** Exact time in words, e.g. "Thu, Nov 5, 9:00 AM EST". */
  when: string;
  to: string;
  timeZone: string;
  /** Set when we fell back to the workspace's zone or UTC. */
  zoneNote: string | null;
}

export async function createReminder(input: CreateReminderInput, now = new Date()): Promise<CreatedReminder> {
  const { dir, store } = currentCtx();
  const role = input.role ?? dir.role;
  const text = (input.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) throw new ReminderError("Say what the reminder is about.");
  if (text.length > REMINDER_MAX_TEXT) throw new ReminderError(`Keep reminders under ${REMINDER_MAX_TEXT} characters.`);
  const target = resolveTarget(dir, input.target ?? "me", role);
  if ("error" in target) throw new ReminderError(target.error);
  if (input.source && !dir.chats[input.source.chatId]) throw new ReminderError("That conversation doesn't exist.", 404);

  const zone = isValidTimeZone(input.timeZone) ? { tz: input.timeZone, source: "yours" as const } : await timeZoneFor(dir.me);
  const due = parseWhen({ when: input.when, inMinutes: input.inMinutes }, zone.tz, now);
  if (!due) throw new ReminderError('Give a time like "2026-11-05T09:00" (local) or minutes from now.');
  // A minute of grace: "in 1 minute" that took the model a while still counts.
  if (due.getTime() < now.getTime() - 60_000) throw new ReminderError(`That time (${formatWhen(due.toISOString(), zone.tz)}) has already passed.`);
  if (due.getTime() > now.getTime() + REMINDER_MAX_DAYS * 86400_000) throw new ReminderError("Reminders can be set up to a year ahead.");

  // A ceiling per person, so a runaway loop can't queue thousands of posts.
  const open = (await store.listReminders({ status: "pending" })).filter((r) => r.createdBy === dir.me).length;
  if (open >= MAX_PENDING_PER_PERSON) throw new ReminderError(`You have ${open} upcoming reminders. Cancel some on the You screen first.`, 429);

  const reminder: Reminder = {
    id: `rm${uid()}`, createdBy: dir.me, target, text, dueAt: due.toISOString(), timeZone: zone.tz, status: "pending", attempts: 0,
    source: input.source ?? null, createdAt: now.toISOString(), sentAt: null,
  };
  await store.addReminder(reminder);
  return {
    reminder, when: formatWhen(reminder.dueAt, zone.tz), to: targetLabel(dir, target), timeZone: zone.tz,
    zoneNote: zone.source === "yours" ? null : zone.source === "workspace" ? `Used the workspace time zone (${zone.tz}).` : `No time zone is known yet, so this is ${zone.tz}.`,
  };
}

/** Upcoming reminders I set or that are for me, soonest first. */
export async function listMyReminders(): Promise<(Reminder & { canCancel: boolean })[]> {
  const { dir, store } = currentCtx();
  const all = await store.listReminders({ status: "pending" });
  return all
    .filter((r) => r.createdBy === dir.me || (r.target.kind === "person" && r.target.id === dir.me))
    .map((r) => ({ ...r, canCancel: canCancel(dir, r, dir.role) }));
}

/** Who set it, who it's for, or an org owner. */
export function canCancel(dir: Directory, r: Reminder, role: Role) {
  return r.createdBy === dir.me || (r.target.kind === "person" && r.target.id === dir.me) || role === "owner";
}

export async function cancelReminder(id: string, role?: Role): Promise<{ ok: true }> {
  const { dir, store } = currentCtx();
  const r = await store.getReminder(id);
  if (!r) throw new ReminderError("That reminder doesn't exist.", 404);
  if (!canCancel(dir, r, role ?? dir.role)) throw new ReminderError("Only the person who set it (or who it's for) can cancel it.", 403);
  if (!(await store.transitionReminder(id, ["pending"], "canceled"))) throw new ReminderError("That reminder was already sent or canceled.", 409);
  return { ok: true };
}

// ---------------------------------------------------------------- delivery

export function reminderText(dir: Directory, r: Reminder) {
  const who = r.target.kind === "person" && r.target.id === r.createdBy ? "you" : personOf(dir, r.createdBy).name;
  const link = r.source ? ` [[cite:${r.source.chatId}:${r.source.threadId ?? "-"}:${r.source.messageId}]]` : "";
  return `⏰ Reminder from ${who}: ${r.text}${link}`;
}

/**
 * Post every due reminder once. Safe to call from many places at once: the store's claim
 * hands each reminder to exactly one caller. A failed post goes back to pending (up to
 * REMINDER_MAX_ATTEMPTS), so a blip doesn't lose it.
 */
export async function deliverDueReminders(now = new Date()): Promise<{ delivered: string[]; chats: ChatId[] }> {
  const { dir, store } = currentCtx();
  const claimed = await store.claimDueReminders(now.toISOString(), REMINDER_BATCH);
  const delivered: string[] = [];
  const chats = new Set<ChatId>();
  for (const r of claimed) {
    try {
      const where = await post(dir, r);
      if (!where) {
        // Its channel was deleted or the person left: nowhere to say it.
        await store.transitionReminder(r.id, ["sent"], "failed");
        continue;
      }
      where.forEach((c) => chats.add(c));
      delivered.push(r.id);
    } catch (e) {
      console.error(`[reminders] ${r.id} failed:`, (e as Error).message);
      await store.transitionReminder(r.id, ["sent"], r.attempts >= REMINDER_MAX_ATTEMPTS ? "failed" : "pending").catch(() => {});
    }
  }
  return { delivered, chats: [...chats] };
}

async function post(dir: Directory, r: Reminder): Promise<ChatId[] | null> {
  const { store } = currentCtx();
  const text = reminderText(dir, r);
  if (r.target.kind === "channel") {
    if (dir.chats[r.target.id]?.kind !== "channel") return null;
    const saved = await store.appendMessage(r.target.id, { id: uid(), who: ATLAS_ID, time: stamp(), text });
    await pingChanges({ chats: [r.target.id], tickets: false, origin: null, workspaceId: dir.workspace.id, message: { chatId: r.target.id, threadId: null, message: saved } });
    return [r.target.id];
  }
  if (!dir.people[r.target.id]) return null;
  // Their own Atlas DM (made if they've never opened it): src/server/notify.ts.
  const chats = await deliverNotices([{ to: r.target.id, ticketId: "", text, fallbackChat: null }]);
  if (chats.length) await pingChanges({ chats, tickets: false, origin: null, workspaceId: dir.workspace.id });
  return chats.length ? chats : null;
}
