import "server-only";

import { ATLAS, ATLAS_ID, makePerson, type Directory } from "@/lib/directory";
import { uid } from "@/lib/format";
import { localDay, type Reminder } from "@/lib/scheduled";
import type { storeFor } from "@/lib/store";
import { buildDigestData, fallbackFocus, renderDigest } from "../scheduled/digest";

type Store = Awaited<ReturnType<typeof storeFor>>;

/**
 * Scheduled work, already in use in the Orbit Labs sandbox:
 * - yesterday's daily digest from Sunny in #product (today's posts on the first
 *   activity after 9:00, or from "Post digest now" on Sunny's profile);
 * - a reminder Jonas set that Atlas already delivered in #engineering;
 * - a "Remind me about this" on Jonas's calendar-sync ask, due 3 minutes after the
 *   sandbox is made, so it arrives in the visitor's Atlas DM while they look around;
 * - upcoming reminders on the You screen (one from Maya, one for #engineering).
 */
export async function seedScheduled(
  store: Store,
  x: {
    me: { id: string; first: string };
    ch: Record<string, string>;
    ag: Record<string, string>;
    ids: string[];
    people: Record<"maya" | "jonas" | "priya" | "sofia" | "tom", string>;
    posted: Record<string, { id: string; root: string | null }>;
  },
) {
  const { maya, jonas } = x.people;
  const sunny = x.ag.standup;
  const now = Date.now();
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const orb = (n: number) => x.ids[n - 1];
  if (!sunny || !x.ch.product || !x.ch.engineering) return;

  // ORB-8 was moved to Done yesterday evening (the #engineering update says so): today's digest ships it.
  const fixed = await store.getTicket(orb(8));
  if (fixed) await store.saveTicket({ ...fixed, activity: [...fixed.activity, { who: "Priya Raman", text: "moved it to Done", time: ago(900) }] });

  // Yesterday's digest in #product, built from the seeded data as it stood then.
  const yesterday = new Date(now - 86400_000);
  const dir = digestDirectory(x);
  const [tickets, messages, missions, decisions] = await Promise.all([
    store.listTickets(), store.listMessages(x.ch.product, { limit: 60 }), store.listMissions(), store.listDecisions({ status: "open" }),
  ]);
  const data = buildDigestData({ dir, chatId: x.ch.product, tickets, messages, missions, decisions, logged: [], now: yesterday, tz: "UTC" });
  await store.appendMessage(x.ch.product, { id: uid(), who: sunny, time: yesterday.toISOString(), text: renderDigest(data, fallbackFocus(data)) });
  await store.claimDigest(x.ch.product, localDay(yesterday, "UTC"));

  // A reminder Atlas already delivered: what one looks like when it fires.
  const reminder = (r: Partial<Reminder> & Pick<Reminder, "createdBy" | "target" | "text" | "dueAt">): Reminder => ({
    id: `rm${uid()}`, timeZone: "UTC", status: "pending", attempts: 0, source: null, createdAt: ago(60), sentAt: null, ...r,
  });
  await store.addReminder(reminder({
    createdBy: jonas, target: { kind: "channel", id: x.ch.engineering }, text: "rotate the Stripe test-mode keys before they expire on Friday",
    dueAt: ago(12), status: "sent", attempts: 1, sentAt: ago(12), createdAt: ago(1440),
  }));
  await store.appendMessage(x.ch.engineering, { id: uid(), who: ATLAS_ID, time: ago(12), text: "⏰ Reminder from Jonas Weber: rotate the Stripe test-mode keys before they expire on Friday" });

  // Fires live a few minutes in, into the visitor's Atlas DM, linking back to Jonas's ask.
  const ask = x.posted.e7;
  await store.addReminder(reminder({
    createdBy: x.me.id, target: { kind: "person", id: x.me.id }, text: "test the calendar sync PR with your Google account (ORB-1)",
    dueAt: new Date(now + 3 * 60_000).toISOString(), createdAt: ago(1),
    source: ask ? { chatId: x.ch.engineering, threadId: ask.root, messageId: ask.id } : null,
  }));
  // Upcoming, on the You screen: tomorrow 9:00 from Maya, and Friday 10:00 for #engineering (US Eastern).
  const at = (daysAhead: number, hourEt: number) => {
    const d = new Date(now + daysAhead * 86400_000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourEt + 5, 0)).toISOString();
  };
  const toFriday = ((5 - new Date(now).getUTCDay() + 7) % 7) || 7;
  await store.addReminder(reminder({
    createdBy: maya, target: { kind: "person", id: x.me.id }, text: "review the pricing page mocks before Tom schedules the emails (ORB-5)",
    dueAt: at(1, 9), timeZone: "America/New_York", createdAt: ago(70),
  }));
  await store.addReminder(reminder({
    createdBy: x.me.id, target: { kind: "channel", id: x.ch.engineering }, text: "demo the Stripe webhooks (ORB-4) at the Friday review",
    dueAt: at(toFriday, 10), timeZone: "America/New_York", createdAt: ago(200),
  }));
}

/** Just enough of a directory for the digest builder (names, the channel, the prefix). */
function digestDirectory(x: { me: { id: string; first: string }; ch: Record<string, string>; ag: Record<string, string>; people: Record<string, string> }): Directory {
  const names: Record<string, string> = { maya: "Maya Chen", jonas: "Jonas Weber", priya: "Priya Raman", sofia: "Sofia Rossi", tom: "Tom Okafor" };
  const people: Directory["people"] = { [ATLAS_ID]: ATLAS, [x.me.id]: makePerson({ id: x.me.id, name: "Alex Rivera" }) };
  for (const [k, id] of Object.entries(x.people)) people[id] = makePerson({ id, name: names[k] ?? k });
  for (const id of Object.values(x.ag)) people[id] = { ...makePerson({ id, name: "Agent" }), isAgent: true };
  return {
    workspace: { id: "", name: "Orbit Labs", slug: "", ticketPrefix: "ORB", repo: null }, me: x.me.id, role: "owner", people, personOrder: Object.keys(people), teams: [],
    chats: { [x.ch.product]: { id: x.ch.product, kind: "channel", label: "product", topic: "", team: "product", members: [] } },
    channels: [x.ch.product], dms: [], home: x.ch.product, memberships: [], demo: false,
  };
}
