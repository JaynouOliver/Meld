/**
 * Scheduled agent work without a model: npm run test:scheduled
 * - Reminders: time parsing (zones, DST, relative), target validation and permissions,
 *   exactly-once delivery under concurrent sweeps, retry after a failed post, cancel.
 * - Daily digest: once per day per channel (workdays, after 9:00), "post now", and the
 *   data summary it's built from.
 */
import assert from "node:assert/strict";

import { setCtxProvider, setNotifier, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type AgentInfo, type Directory } from "../src/lib/directory";
import type { Mission } from "../src/lib/missions";
import { digestDue, formatWhen, isStandupAgent, localDay, parseWhen, presetTime, zonedToUtc } from "../src/lib/scheduled";
import { memoryStore } from "../src/lib/store/memory";
import type { Message, Ticket } from "../src/lib/types";
import { buildDigestData, checkFocus, deliverDueDigests, fallbackFocus, postDigest, renderDigest } from "../src/server/scheduled/digest";
import { cancelReminder, clockBlock, createReminder, deliverDueReminders, listMyReminders, resolveTarget } from "../src/server/scheduled/reminders";

const sunny: AgentInfo = { id: "ag-sunny", handle: "sunny", name: "Sunny", description: "Standup: what changed, what's blocked", instructions: "", tools: ["read"], kind: "custom", createdBy: "u1" };
const rex: AgentInfo = { id: "ag-rex", handle: "rex", name: "Rex", description: "Reviewer: checks plans", instructions: "", tools: ["read"], kind: "custom", createdBy: "u1" };
const person = (id: string, name: string, isAgent = false) => ({ id, name, first: name.split(" ")[0], initials: name[0], color: "#000", team: "eng", isAgent });

const dir: Directory = {
  workspace: { id: "ws-sched", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "u3", "atlas"], teams: [{ id: "eng", name: "Engineering" }],
  people: { u1: person("u1", "Ada Lovelace"), u2: person("u2", "Bo Diddley"), u3: person("u3", "Cy Twombly"), atlas: ATLAS, [sunny.id]: person(sunny.id, "Sunny", true), [rex.id]: person(rex.id, "Rex", true) },
  agents: [ATLAS_AGENT, sunny, rex],
  chats: {
    eng: { id: "eng", kind: "channel", label: "eng", topic: "", team: "eng", members: [], agents: [{ id: "atlas", mode: "mention" }, { id: sunny.id, mode: "mention" }] },
    quiet: { id: "quiet", kind: "channel", label: "quiet", topic: "", team: null, members: [], agents: [{ id: rex.id, mode: "mention" }] },
    dmatlas: { id: "dmatlas", kind: "dm", who: "atlas", topic: "" },
    dmbo: { id: "dmbo", kind: "dm", who: "u2", topic: "" },
  },
  channels: ["eng", "quiet"], dms: ["dmatlas", "dmbo"], home: "eng", memberships: [], demo: false,
};
const ctx: RequestCtx = { dir, store: memoryStore("ws-sched", "T") };
let current: RequestCtx = ctx;
setCtxProvider(() => current);
const as = async <T,>(who: string, role: Directory["role"], fn: () => Promise<T>) => {
  current = { ...ctx, dir: { ...dir, me: who, role } };
  try {
    return await fn();
  } finally {
    current = ctx;
  }
};

// Reminders for people go to "their Atlas DM": here, a chat per person.
let failNext = 0;
setNotifier(async (notices) => {
  const chats: string[] = [];
  for (const n of notices) {
    if (failNext > 0) {
      failNext--;
      throw new Error("network blip");
    }
    await ctx.store.appendMessage(`atlas-dm-${n.to}`, { id: `m${Math.random()}`, who: "atlas", time: new Date().toISOString(), text: n.text });
    chats.push(`atlas-dm-${n.to}`);
  }
  return chats;
});
const texts = async (chat: string) => (await ctx.store.listMessages(chat)).map((m) => m.text);
const assertRejects = async (p: Promise<unknown>, re: RegExp, msg: string) => assert.rejects(p, (e: Error) => re.test(e.message), msg);

async function main() {
  // ---------------------------------------------------------------- parsing
  const ny = "America/New_York";
  // DST ended Nov 1, 2026: 9:00 in New York is 14:00 UTC after, 13:00 before.
  assert.equal(parseWhen({ when: "2026-11-05T09:00" }, ny)!.toISOString(), "2026-11-05T14:00:00.000Z", "local wall time, EST");
  assert.equal(parseWhen({ when: "2026-10-30T09:00" }, ny)!.toISOString(), "2026-10-30T13:00:00.000Z", "local wall time, EDT");
  assert.equal(parseWhen({ when: "2026-11-05" }, "UTC")!.toISOString(), "2026-11-05T09:00:00.000Z", "a date alone means 9:00");
  assert.equal(parseWhen({ when: "2026-11-05T09:00:00Z" }, ny)!.toISOString(), "2026-11-05T09:00:00.000Z", "explicit UTC kept");
  assert.equal(parseWhen({ when: "2026-11-05T09:00-08:00" }, ny)!.toISOString(), "2026-11-05T17:00:00.000Z", "explicit offset kept");
  const now = new Date("2026-11-04T15:00:00Z");
  assert.equal(parseWhen({ inMinutes: 120 }, ny, now)!.toISOString(), "2026-11-04T17:00:00.000Z", "relative minutes");
  assert.equal(parseWhen({ inMinutes: 1, when: "2026-11-05T09:00" }, ny, now)!.toISOString(), "2026-11-04T15:01:00.000Z", "in_minutes wins");
  assert.equal(parseWhen({ when: "tomorrow at 9" }, ny), null, "free text is not a time");
  assert.equal(parseWhen({ when: "2026-02-31T09:00" }, ny), null, "a date that doesn't exist");
  assert.equal(parseWhen({ when: "2026-11-05T25:00" }, ny), null, "an hour that doesn't exist");
  assert.equal(parseWhen({ inMinutes: -5 }, ny, now), null, "negative minutes");
  assert.equal(zonedToUtc(2026, 3, 8, 3, 0, ny).toISOString(), "2026-03-08T07:00:00.000Z", "just after spring forward");
  assert.match(formatWhen("2026-11-05T14:00:00.000Z", ny), /Thu, Nov 5, 9:00\sAM EST/);
  assert.equal(presetTime("tomorrow", ny, now).toISOString(), "2026-11-05T14:00:00.000Z", "Tomorrow at 9:00 preset");
  assert.equal(localDay(new Date("2026-11-05T03:00:00Z"), ny), "2026-11-04", "late evening is still today in New York");

  // ---------------------------------------------------------------- targets
  assert.deepEqual(resolveTarget(dir, "me", "member"), { kind: "person", id: "u1" });
  assert.deepEqual(resolveTarget(dir, "", "member"), { kind: "person", id: "u1" }, "no target means me");
  assert.deepEqual(resolveTarget(dir, "#eng", "member"), { kind: "channel", id: "eng" });
  assert.deepEqual(resolveTarget(dir, "eng", "member"), { kind: "channel", id: "eng" }, "channel by name");
  assert.deepEqual(resolveTarget(dir, "u2", "member"), { kind: "person", id: "u2" }, "person by id");
  assert.deepEqual(resolveTarget(dir, "@Bo", "member"), { kind: "person", id: "u2" }, "person by first name");
  assert.deepEqual(resolveTarget(dir, "cy twombly", "member"), { kind: "person", id: "u3" }, "person by full name");
  assert.match((resolveTarget(dir, "sunny", "member") as { error: string }).error, /Agents don't get reminders/);
  assert.match((resolveTarget(dir, "dmbo", "member") as { error: string }).error, /not a DM/);
  assert.match((resolveTarget(dir, "#quiet", "member") as { error: string }).error, /Atlas isn't in #quiet/, "Atlas must be able to post there");
  assert.match((resolveTarget(dir, "#nowhere", "member") as { error: string }).error, /No person or channel/);
  assert.match((resolveTarget(dir, "#eng", "guest") as { error: string }).error, /Guests can only/, "guests remind only themselves");
  assert.deepEqual(resolveTarget(dir, "me", "guest"), { kind: "person", id: "u1" });

  // ---------------------------------------------------------------- create + validation
  const made = await createReminder({ when: "2026-11-05T09:00", text: "send the deck", target: "me" }, now);
  assert.equal(made.reminder.dueAt, "2026-11-05T09:00:00.000Z", "no zone known: UTC");
  assert.match(made.zoneNote ?? "", /No time zone is known yet, so this is UTC/, "and it says so");
  assert.match((await clockBlock(now)), /Now: Wednesday, Nov 4, 2026, 3:00 PM \(2026-11-04\), time zone UTC \(no time zone known yet\)/);
  await ctx.store.setTimeZone("*", ny);
  const ws = await createReminder({ when: "2026-11-05T09:00", text: "send the deck", target: "me" }, now);
  assert.equal(ws.reminder.dueAt, "2026-11-05T14:00:00.000Z", "workspace default zone");
  assert.match(ws.zoneNote ?? "", /workspace time zone \(America\/New_York\)/);
  await ctx.store.setTimeZone("u1", "Europe/Berlin");
  const mine = await createReminder({ when: "2026-11-05T09:00", text: "send the deck", target: "me" }, now);
  assert.equal(mine.reminder.dueAt, "2026-11-05T08:00:00.000Z", "the requester's own zone wins");
  assert.equal(mine.zoneNote, null);
  assert.match(mine.when, /Thu, Nov 5, 9:00\sAM GMT\+1/, "confirms the exact time in their zone");
  await assertRejects(createReminder({ when: "2026-11-01T09:00", text: "x", target: "me" }, now), /already passed/, "past times are refused");
  await assertRejects(createReminder({ inMinutes: 5, text: "   ", target: "me" }, now), /Say what/, "empty text");
  await assertRejects(createReminder({ inMinutes: 5, text: "x".repeat(501), target: "me" }, now), /under 500/, "long text");
  await assertRejects(createReminder({ when: "2028-01-01T09:00", text: "x", target: "me" }, now), /up to a year/, "too far ahead");
  await assertRejects(createReminder({ when: "soon", text: "x", target: "me" }, now), /Give a time/, "unreadable time");
  await assertRejects(createReminder({ inMinutes: 5, text: "x", target: "#quiet" }, now), /Atlas isn't in/, "target checked on create");
  await assertRejects(as("u3", "guest", () => createReminder({ inMinutes: 5, text: "x", target: "Bo" }, now)), /Guests/, "guest can't remind others");
  // Clean slate for delivery: cancel the drafts above.
  for (const r of await ctx.store.listReminders({ status: "pending" })) await ctx.store.transitionReminder(r.id, ["pending"], "canceled");

  // ---------------------------------------------------------------- exactly-once delivery
  const a = await createReminder({ inMinutes: 1, text: "check the board", target: "me" }, now);
  const b = await createReminder({ inMinutes: 2, text: "demo the webhooks", target: "#eng" }, now);
  const c = await createReminder({ inMinutes: 3, text: "the pricing mocks", target: "Bo" }, now);
  const later = await createReminder({ inMinutes: 600, text: "not yet", target: "me" }, now);
  assert.equal((await deliverDueReminders(now)).delivered.length, 0, "nothing is due yet");
  const due = new Date(now.getTime() + 5 * 60_000);
  const sweeps = await Promise.all(Array.from({ length: 6 }, () => deliverDueReminders(due)));
  const delivered = sweeps.flatMap((s) => s.delivered).sort();
  assert.deepEqual(delivered, [a.reminder.id, b.reminder.id, c.reminder.id].sort(), "six concurrent sweeps deliver each due reminder once");
  assert.equal((await deliverDueReminders(due)).delivered.length, 0, "and never again");
  assert.deepEqual(await texts("atlas-dm-u1"), ["⏰ Reminder from you: check the board"], "mine, in my Atlas DM");
  assert.deepEqual(await texts("eng"), ["⏰ Reminder from Ada Lovelace: demo the webhooks"], "the channel's, in the channel, from Atlas");
  assert.equal((await ctx.store.listMessages("eng"))[0].who, "atlas");
  assert.deepEqual(await texts("atlas-dm-u2"), ["⏰ Reminder from Ada Lovelace: the pricing mocks"], "Bo's, in Bo's Atlas DM");
  assert.equal((await ctx.store.getReminder(a.reminder.id))!.status, "sent");
  assert.equal((await ctx.store.getReminder(later.reminder.id))!.status, "pending", "later ones wait");

  // A failed post goes back to pending, then delivers on the next sweep.
  const flaky = await createReminder({ inMinutes: 1, text: "retry me", target: "me" }, now);
  failNext = 1;
  assert.equal((await deliverDueReminders(due)).delivered.length, 0);
  const back = (await ctx.store.getReminder(flaky.reminder.id))!;
  assert.equal(back.status, "pending", "requeued after a failed post");
  assert.equal(back.attempts, 1);
  assert.deepEqual((await deliverDueReminders(due)).delivered, [flaky.reminder.id], "delivered on retry");
  assert.equal((await texts("atlas-dm-u1")).filter((t) => t.includes("retry me")).length, 1, "posted once");

  // "Remind me about this" links back to the message.
  const src = await createReminder({ inMinutes: 1, text: "Bo's message", target: "me", source: { chatId: "eng", threadId: null, messageId: "m42" } }, now);
  await deliverDueReminders(due);
  assert.ok((await texts("atlas-dm-u1")).some((t) => t.endsWith("[[cite:eng:-:m42]]")), `cites the source message (${src.reminder.id})`);

  // ---------------------------------------------------------------- cancel
  const soon = await createReminder({ inMinutes: 1, text: "cancel me", target: "Bo" }, now);
  await assertRejects(as("u3", "member", () => cancelReminder(soon.reminder.id)), /Only the person/, "a bystander can't cancel");
  assert.equal((await as("u2", "member", () => listMyReminders())).some((r) => r.id === soon.reminder.id), true, "it shows for who it's for");
  assert.equal((await as("u3", "member", () => listMyReminders())).some((r) => r.id === soon.reminder.id), false, "and not for others");
  assert.deepEqual(await as("u2", "member", () => cancelReminder(soon.reminder.id)), { ok: true }, "who it's for can cancel");
  await assertRejects(cancelReminder(soon.reminder.id), /already sent or canceled/, "cancel twice");
  await assertRejects(cancelReminder("rm-nope"), /doesn't exist/, "unknown id");
  assert.equal((await deliverDueReminders(due)).delivered.includes(soon.reminder.id), false, "a canceled reminder never posts");
  const listed = await listMyReminders();
  assert.deepEqual(listed.map((r) => r.id), [later.reminder.id], "upcoming list: pending only, mine");
  assert.equal(listed[0].canCancel, true);

  // ---------------------------------------------------------------- digest scheduling
  await ctx.store.setTimeZone("*", "UTC");
  assert.equal(isStandupAgent(sunny), true);
  assert.equal(isStandupAgent(rex), false);
  const wed10 = new Date("2026-11-04T10:00:00Z");
  assert.equal(digestDue(new Date("2026-11-04T08:59:00Z"), "UTC", null), false, "not before 9:00");
  assert.equal(digestDue(wed10, "UTC", null), true);
  assert.equal(digestDue(wed10, "UTC", "2026-11-04"), false, "not twice a day");
  assert.equal(digestDue(new Date("2026-11-07T10:00:00Z"), "UTC", null), false, "not on Saturday");
  assert.equal(digestDue(new Date("2026-11-04T14:30:00Z"), ny, null), true, "9:30 in New York");
  assert.equal(digestDue(new Date("2026-11-04T13:30:00Z"), ny, null), false, "8:30 in New York");

  assert.deepEqual(await deliverDueDigests(new Date("2026-11-04T08:00:00Z")), [], "too early");
  const runs = await Promise.all(Array.from({ length: 5 }, () => deliverDueDigests(wed10)));
  assert.deepEqual(runs.flat(), ["eng"], "five concurrent sweeps post one digest, only where Sunny is");
  assert.deepEqual(await deliverDueDigests(new Date("2026-11-04T16:00:00Z")), [], "later the same day: nothing");
  const digests = async () => (await ctx.store.listMessages("eng")).filter((m) => m.who === sunny.id);
  assert.equal((await digests()).length, 1);
  assert.match((await digests())[0].text, /^\*\*Daily digest for #eng\*\* · Wed, Nov 4/);
  assert.ok(await postDigest("eng", { force: true, now: new Date("2026-11-04T17:00:00Z") }), "Post digest now: always");
  assert.equal((await digests()).length, 2);
  assert.deepEqual(await deliverDueDigests(new Date("2026-11-04T18:00:00Z")), [], "and the sweep still skips today");
  assert.deepEqual(await deliverDueDigests(new Date("2026-11-05T09:01:00Z")), ["eng"], "next morning: posts again");
  assert.equal(await postDigest("eng", { now: new Date("2026-11-05T10:00:00Z") }), null, "once per day without force");
  await assertRejects(postDigest("quiet", { force: true }), /No standup agent/, "only where a standup agent is");

  // ---------------------------------------------------------------- digest data summary
  const t = (id: string, x: Partial<Ticket>): Ticket => ({
    id, team: "eng", title: id, description: "", status: "To do", priority: "Medium", assignee: "u1", reporter: "u1", links: [], images: [],
    updated: "", watch: null, activity: [], ...x,
  });
  const at = new Date("2026-11-04T10:00:00Z");
  const tickets: Ticket[] = [
    t("T-1", { status: "Done", assignee: "u2", activity: [{ who: "Bo", text: "moved it to Done", time: "2026-11-03T18:00:00Z" }] }),
    t("T-2", { status: "Done", assignee: "u2", activity: [{ who: "Bo", text: "moved it to Done", time: "2026-10-20T18:00:00Z" }] }),
    t("T-3", { status: "In progress", assignee: "u3", estimate: 8 }),
    t("T-4", { status: "In review", assignee: "u2", estimate: 3 }),
    t("T-5", { status: "To do", assignee: "u3", blockedBy: ["T-3", "T-1"], estimate: 8 }),
    t("T-6", { status: "To do", assignee: "u2", due: "2026-11-02" }),
    t("T-7", { status: "In progress", assignee: "u1", due: "2026-11-04" }),
    t("T-8", { status: "To do", team: "design", assignee: "u1" }),
    t("T-9", { status: "To do", team: "design", assignee: "u1", missionId: "ms1" }),
    t("T-10", { status: "Backburner", assignee: "u1", due: "2026-10-01" }),
    t("T-11", { status: "To do", assignee: sunny.id, estimate: 40 }),
  ];
  const msgs: Message[] = [
    { id: "m1", who: "u2", time: "2026-11-04T08:00:00Z", text: "T-3 is close", replies: [{ id: "m1r", who: "u3", time: "2026-11-04T08:10:00Z", text: "nice" }] },
    { id: "m0", who: "u2", time: "2026-11-01T08:00:00Z", text: "old", replies: [] },
  ];
  const mission: Mission = {
    id: "ms1", title: "Launch", goal: "", chatId: "eng", threadId: null, status: "active", deadline: "2026-11-10", plan: { tasks: [{ key: "a", title: "", description: "", owner: "u1", team: "eng", priority: "High", due: null, dependsOn: [], ticketId: "T-9" }], risks: [] },
    summary: "", health: "On track.", createdBy: "u1", createdAt: "", launchedAt: null, lastCheckinAt: null,
  };
  const data = buildDigestData({
    dir, chatId: "eng", tickets, messages: msgs, missions: [mission],
    decisions: [{ id: "d1", missionId: "ms1", question: "Annual discount?", options: [], context: "", status: "open", answer: null, answeredBy: null, answeredAt: null, createdAt: "" }],
    logged: [{ statement: "Ship on the 18th.", createdAt: "2026-11-04T07:00:00Z" }, { statement: "Old call.", createdAt: "2026-10-01T07:00:00Z" }],
    now: at, tz: "UTC",
  });
  assert.deepEqual(data.shipped, [{ id: "T-1", owner: "Bo" }], "shipped yesterday only");
  assert.deepEqual(data.inProgress.map((x) => x.id), ["T-3", "T-4", "T-7"]);
  assert.deepEqual(data.blocked, [{ id: "T-5", owner: "Cy", by: [{ id: "T-3", owner: "Cy", status: "In progress" }] }], "blocked by open work only");
  assert.deepEqual(data.due.map((x) => [x.id, x.daysLate, x.owner]), [["T-6", 2, "Bo"], ["T-7", 0, "Ada"]], "overdue first; backburner and other teams left out");
  assert.deepEqual(data.overloaded, [{ who: "Cy", open: 2, points: 16, ids: ["T-3", "T-5"] }], "points over the line; agents don't count");
  assert.deepEqual(data.decisions, [{ question: "Annual discount?", mission: "Launch" }]);
  assert.deepEqual(data.logged, ["Ship on the 18th."]);
  assert.deepEqual(data.missions, [{ title: "Launch", deadline: "2026-11-10", health: "On track.", done: 0, total: 1 }]);
  assert.equal(data.messages, 2, "messages in the last day, replies included");
  assert.equal(data.window, "yesterday");
  assert.equal(buildDigestData({ dir, chatId: "eng", tickets, messages: [], missions: [], decisions: [], logged: [], now: new Date("2026-11-09T10:00:00Z"), tz: "UTC" }).window, "since Friday", "Mondays cover the weekend");

  const text = renderDigest(data, fallbackFocus(data));
  for (const want of ["**Shipped yesterday**\n- T-1 (Bo)", "- T-5 (Cy) waits on T-3 (Cy, in progress)", "- T-6 2 days overdue, @Bo", "- T-7 due today, @Ada", "Cy: 2 open, 16 points (T-3, T-5)", "Annual discount? (Launch)", 'Mission "Launch": 0 of 1 done, due Tue, Nov 10'])
    assert.ok(text.includes(want), `digest says: ${want}\n---\n${text}`);
  assert.equal(fallbackFocus(data), "Close out T-6 (Bo), it's 2 days overdue.");
  assert.match(renderDigest({ ...data, shipped: [], inProgress: [], blocked: [], due: [], overloaded: [], decisions: [], logged: [], missions: [] }, null), /Quiet day/);
  assert.equal(checkFocus("Focus today: unblock T-5 by landing T-3.", data, "T"), "unblock T-5 by landing T-3.", "a focus line about real tickets");
  assert.equal(checkFocus("Ship T-99 today.", data, "T"), null, "an id that isn't in the data is refused");
  assert.equal(checkFocus("@Bo please finish T-6", data, "T"), null, "no mentions from the model");

  console.log("scheduled: all tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
