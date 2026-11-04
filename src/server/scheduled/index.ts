import "server-only";

import { currentCtx } from "@/lib/context";
import { atlasDmOf } from "@/lib/directory";
import type { ChatId } from "@/lib/types";
import { deliverDueDigests } from "./digest";
import { deliverDueReminders, reportTimeZone } from "./reminders";

export { cancelReminder, createReminder, listMyReminders, ReminderError, type CreateReminderInput } from "./reminders";
export { postDigest } from "./digest";

/**
 * The scheduled-work sweep: due reminders, then today's digests. There's no worker
 * process, so it runs lazily from frequent requests (after() in the rpc route), from the
 * open tab's once-a-minute deliverDue call, and from the daily cron. Every path is safe
 * to run at once: reminders and digests are claimed atomically in the store.
 */
const SWEEP_EVERY_MS = 15_000;
const g = globalThis as typeof globalThis & { __meldSweeps?: Map<string, number> };
const lastSweep = (g.__meldSweeps ??= new Map());

export async function sweepScheduled(opts: { now?: Date; force?: boolean } = {}): Promise<{ reminders: string[]; digests: ChatId[]; chats: ChatId[] }> {
  const ws = currentCtx().dir.workspace.id;
  const t = Date.now();
  // Polls from every open tab land here: one look per workspace per instance is plenty.
  if (!opts.force && t - (lastSweep.get(ws) ?? 0) < SWEEP_EVERY_MS) return { reminders: [], digests: [], chats: [] };
  lastSweep.set(ws, t);
  const now = opts.now ?? new Date();
  const r = await deliverDueReminders(now);
  const digests = await deliverDueDigests(now);
  return { reminders: r.delivered, digests, chats: [...new Set([...r.chats, ...digests])] };
}

/** Sweep from a request without slowing it down or failing it. */
export async function sweepQuietly() {
  try {
    await sweepScheduled();
  } catch (e) {
    console.error("[scheduled] sweep failed:", (e as Error).message);
  }
}

/**
 * The open tab's once-a-minute call: reports the browser's time zone (for "tomorrow at
 * 9") and delivers anything due. Returns the chats that got a post so the tab can show
 * them without waiting for realtime.
 */
export async function deliverDue(timeZone?: string): Promise<{ chats: ChatId[] }> {
  await reportTimeZone(timeZone).catch(() => {});
  const { chats } = await sweepScheduled({ force: true });
  // Also what another request delivered a moment ago, for browsers without realtime.
  const { dir, store } = currentCtx();
  const since = Date.now() - 2 * 60_000;
  const mine = atlasDmOf(dir);
  for (const r of await store.listReminders({ status: "sent" })) {
    if (Date.parse(r.sentAt ?? "") < since) continue;
    const chat = r.target.kind === "channel" ? r.target.id : r.target.id === dir.me ? mine : null;
    if (chat && dir.chats[chat]) chats.push(chat);
  }
  return { chats: [...new Set(chats)] };
}
