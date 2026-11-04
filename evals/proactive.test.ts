/**
 * Proactive Atlas without a model: npm run test:proactive
 * Follow-ups (timing, answered detection, exactly-once delivery), linked threads (no
 * self-channel links, one link per pair) and the workload balancer (threshold, team and
 * out-of-office rules, confirm reassigns, never suggests twice).
 */
import assert from "node:assert/strict";

import { decideAction } from "../src/lib/api/service";
import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type Directory } from "../src/lib/directory";
import {
  answers, conversationsOf, FOLLOW_UP_AFTER_MS, isDue, linkCandidate, linkKey, mayAsk, OVERLOAD_OPEN, outOn, suggestOwner, type OpenQuestion,
} from "../src/lib/proactive";
import { memoryStore } from "../src/lib/store/memory";
import type { Person, Ticket } from "../src/lib/types";
import { configureAssignments, withAssignmentPickup } from "../src/server/agents/assignment";
import { NOTHING } from "../src/server/listener/analyze";
import { respond, type Heard } from "../src/server/listener";
import { noteReply, sweepFollowUps, trackQuestion } from "../src/server/proactive/followups";
import { relatedCandidate } from "../src/server/proactive/links";
import { suggestionId } from "../src/server/proactive/workload";

const person = (id: string, name: string, team: string): Person => ({ id, name, first: name.split(" ")[0], initials: name[0], color: "#000", team, isAgent: false });
const channel = (id: string) => ({ id, kind: "channel" as const, label: id, topic: "", team: null, members: [], agents: [{ id: "atlas", mode: "mention" as const }] });
const dir: Directory = {
  workspace: { id: "ws-proactive", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "alex", role: "owner", personOrder: ["alex", "maya", "jonas", "priya", "sam", "atlas"],
  teams: [{ id: "eng", name: "Engineering" }, { id: "design", name: "Design" }, { id: "product", name: "Product" }] as Directory["teams"],
  people: {
    alex: person("alex", "Alex Rivera", "product"), maya: person("maya", "Maya Chen", "design"), jonas: person("jonas", "Jonas Weber", "eng"),
    priya: person("priya", "Priya Raman", "eng"), sam: person("sam", "Sam Lee", "eng"), atlas: ATLAS,
  },
  roles: { alex: "owner", maya: "member", jonas: "member", priya: "member", sam: "member" },
  agents: [ATLAS_AGENT],
  chats: { eng: channel("eng"), design: channel("design"), growth: channel("growth"), atlasdm: { id: "atlasdm", kind: "dm", who: "atlas", topic: "" } },
  channels: ["eng", "design", "growth"], dms: ["atlasdm"], home: "eng", memberships: [], demo: false,
};
configureAssignments({ enabled: () => false });
const ctx: RequestCtx = { dir, store: withAssignmentPickup(memoryStore("ws-proactive", "T")) };
setCtxProvider(() => ctx);
const isPerson = (id: string) => !!dir.people[id] && !dir.people[id].isAgent;

let n = 0;
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
async function post(chatId: string, text: string, who: string, threadId: string | null = null, time = iso()) {
  return ctx.store.appendMessage(chatId, { id: `m${++n}`, who, time, text }, threadId);
}
async function atlasReplies(chatId: string, rootId: string) {
  const root = (await ctx.store.listMessages(chatId)).find((m) => m.id === rootId);
  return (root?.replies ?? []).filter((r) => r.who === "atlas");
}
const ticket = (id: string, assignee: string, extra: Partial<Ticket> = {}): Ticket => ({
  id, team: "eng", title: `Ticket ${id}`, description: "", status: "To do", priority: "Medium", assignee, reporter: "alex",
  links: [], images: [], updated: "Today", watch: null, blockedBy: [], activity: [], ...extra,
});

async function followUps() {
  const { store } = ctx;
  // Free question cue.
  assert.ok(mayAsk("@Jonas can you send the API keys?"));
  assert.ok(mayAsk("Maya, any ETA on the mocks?"));
  assert.ok(!mayAsk("Shipped the fix."));
  assert.ok(!mayAsk("lunch?"));

  // Timing: due after the window, never before; "check now" counts questions a minute old.
  const now = Date.now();
  const q = { status: "open" as const, askedAt: new Date(now - 30_000).toISOString(), dueAt: new Date(now - 30_000 + FOLLOW_UP_AFTER_MS).toISOString() };
  assert.equal(isDue(q, now), false);
  assert.equal(isDue(q, now + FOLLOW_UP_AFTER_MS - 60_000), false, "not due a minute early");
  assert.equal(isDue(q, now + FOLLOW_UP_AFTER_MS), true);
  assert.equal(isDue(q, now, true), false, "check now: too fresh");
  assert.equal(isDue(q, now + 60_000, true), true, "check now: a minute old");
  assert.equal(isDue({ ...q, status: "followed_up" }, now + 2 * FOLLOW_UP_AFTER_MS), false, "never twice");

  // Answered detection.
  const base: Pick<OpenQuestion, "chatId" | "threadId" | "messageId" | "asker" | "addressee" | "askedAt"> = {
    chatId: "eng", threadId: null, messageId: "q1", asker: "maya", addressee: "jonas", askedAt: iso(-60_000),
  };
  const msg = (who: string, threadId: string | null, chatId = "eng") => ({ chatId, threadId, id: `x${++n}`, who, time: iso() });
  assert.ok(answers(base, msg("jonas", "q1"), isPerson), "addressee in the thread");
  assert.ok(answers(base, msg("jonas", null), isPerson), "addressee right after, in the channel");
  assert.ok(!answers(base, msg("priya", "q1"), isPerson), "someone else");
  assert.ok(!answers(base, msg("maya", "q1"), isPerson), "the asker");
  assert.ok(!answers(base, msg("jonas", "q1", "design"), isPerson), "another channel");
  assert.ok(!answers(base, msg("atlas", "q1"), isPerson), "an agent");
  assert.ok(!answers({ ...base, threadId: "root" }, msg("jonas", null), isPerson), "a question in a thread is answered in the thread");
  assert.ok(answers({ ...base, addressee: null }, msg("priya", "q1"), isPerson), "asked the channel: anyone but the asker");
  assert.ok(!answers({ ...base, addressee: null }, msg("priya", null), isPerson), "asked the channel: a thread reply");

  // Tracked, then answered in the thread: no follow-up, ever.
  const ask1 = await post("eng", "@Jonas can you send the Stripe keys?", "maya", null, iso(-FOLLOW_UP_AFTER_MS - 60_000));
  await trackQuestion({ chatId: "eng", threadId: null, messageId: ask1.id, authorId: "maya" }, { addressee: "jonas", summary: "the Stripe keys" }, Date.now() - FOLLOW_UP_AFTER_MS - 60_000);
  const reply = await post("eng", "Sent them in 1Password.", "jonas", ask1.id);
  assert.deepEqual(await noteReply({ chatId: "eng", threadId: ask1.id, messageId: reply.id, authorId: "jonas" }), [`oq${ask1.id}`]);
  let r = await sweepFollowUps();
  assert.equal(r.followedUp.length, 0);
  assert.equal((await atlasReplies("eng", ask1.id)).length, 0);

  // Unanswered past the window: exactly one follow-up, even with sweeps racing.
  const ask2 = await post("design", "Maya, any ETA on the pricing mocks?", "jonas", null, iso(-FOLLOW_UP_AFTER_MS - 60_000));
  await trackQuestion({ chatId: "design", threadId: null, messageId: ask2.id, authorId: "jonas" }, { addressee: "maya", summary: "the ETA on the pricing mocks" }, Date.now() - FOLLOW_UP_AFTER_MS - 60_000);
  const [s1, s2, s3] = await Promise.all([sweepFollowUps(), sweepFollowUps(), sweepFollowUps()]);
  assert.equal(s1.followedUp.length + s2.followedUp.length + s3.followedUp.length, 1, "one follow-up across racing sweeps");
  const fu = await atlasReplies("design", ask2.id);
  assert.equal(fu.length, 1);
  assert.equal(fu[0].text, "@Maya, Jonas's question about the ETA on the pricing mocks is still open.");
  r = await sweepFollowUps({ manual: true, now: Date.now() + 10 * FOLLOW_UP_AFTER_MS });
  assert.equal(r.followedUp.length, 0, "never twice");
  assert.equal((await atlasReplies("design", ask2.id)).length, 1);
  // A late answer doesn't reopen it.
  await post("design", "Friday!", "maya", ask2.id);
  assert.equal((await store.listOpenQuestions()).find((x) => x.messageId === ask2.id)?.status, "followed_up");

  // Answered before it was tracked (the sweep checks the conversation itself).
  const ask3 = await post("growth", "@Priya could you review the funnel copy?", "alex", null, iso(-FOLLOW_UP_AFTER_MS - 60_000));
  await post("growth", "Done, left comments.", "priya", ask3.id);
  await trackQuestion({ chatId: "growth", threadId: null, messageId: ask3.id, authorId: "alex" }, { addressee: "priya", summary: "the funnel copy" }, Date.now() - FOLLOW_UP_AFTER_MS - 60_000);
  r = await sweepFollowUps();
  assert.equal(r.answered, 1);
  assert.equal((await atlasReplies("growth", ask3.id)).length, 0);

  // Not due yet: waits. Check now (a person asking) follows up once it's a minute old.
  const ask4 = await post("growth", "Jonas, can you share the webhook payload?", "maya", null, iso(-120_000));
  await trackQuestion({ chatId: "growth", threadId: null, messageId: ask4.id, authorId: "maya" }, { addressee: "jonas", summary: "the webhook payload" }, Date.now() - 120_000);
  assert.equal((await sweepFollowUps()).followedUp.length, 0);
  assert.equal((await sweepFollowUps({ manual: true })).followedUp.length, 1);
  assert.equal((await atlasReplies("growth", ask4.id)).length, 1);
  console.log("✓ follow-ups: timing, answered detection, exactly once");
}

async function links() {
  const { store } = ctx;
  const now = Date.now();
  const convs = conversationsOf([
    { chatId: "eng", id: "e1", threadId: null, who: "jonas", time: iso(-3600_000), text: "Calendar sync is in PR 214. Recurring events are the tricky part." },
    { chatId: "eng", id: "e2", threadId: "e1", who: "priya", time: iso(-1800_000), text: "Google push notifications for recurring events need the sync token." },
    { chatId: "design", id: "d1", threadId: null, who: "maya", time: iso(-3600_000), text: "Calendar sync recurring events google design review" },
    { chatId: "growth", id: "g1", threadId: null, who: "atlas", time: iso(-3600_000), text: "Calendar sync recurring events google" },
    { chatId: "growth", id: "g2", threadId: null, who: "tom", time: iso(-8 * 86400_000), text: "Calendar sync recurring events google" },
  ]);
  const opts = { now, visible: (id: string) => !!dir.chats[id], isPerson, linked: new Set<string>() };
  const text = "Has anyone tested the Google calendar sync with recurring events?";
  const best = linkCandidate({ chatId: "design", messageId: "new1", text }, convs, opts);
  assert.equal(best?.rootId, "e1", "never its own channel, never Atlas's, never older than a week");
  assert.equal(linkCandidate({ chatId: "design", messageId: "new1", text }, convs, { ...opts, linked: new Set([linkKey("design", "e1")]) }), null, "a pair linked before");
  assert.equal(linkCandidate({ chatId: "design", messageId: "new1", text: "lunch on friday?" }, convs, opts), null, "too little in common");

  // Through the store and the listener's reply: one link per pair.
  const root = await post("eng", "Calendar sync (ORB-1) is in PR #214. Recurring events with Google are the tricky part.", "jonas", null, iso(-3600_000));
  const m1 = await post("growth", "Customers keep asking whether Google calendar sync handles recurring events.", "alex");
  const heard = (id: string, text: string, chatId = "growth"): Heard => ({ chatId, threadId: null, messageId: id, authorId: "alex", text, role: "owner" });
  const cand = await relatedCandidate(heard(m1.id, m1.text));
  assert.equal(cand?.rootId, root.id);
  assert.equal(cand?.chatId, "eng");
  const data = { context: [], tickets: [], decisions: [] };
  const a = { ...NOTHING, related: { chatId: "eng", rootId: root.id, who: "jonas", text: root.text } };
  const res = await respond(heard(m1.id, m1.text), a, data);
  assert.ok(res.replyId);
  const line = (await atlasReplies("growth", m1.id))[0].text;
  assert.match(line, /^Related: this is also being discussed in #eng\./);
  assert.ok(line.includes(`[[cite:eng:-:${root.id}]]`));
  // Same channel, same conversation again: no second link, and the filter skips it too.
  const m2 = await post("growth", "Does the Google calendar sync cover recurring events yet?", "maya");
  assert.equal((await respond(heard(m2.id, m2.text), a, data)).replyId, null);
  assert.equal(await relatedCandidate(heard(m2.id, m2.text)), null);
  // Never to the message's own channel.
  const m3 = await post("eng", "Another note on Google calendar sync for recurring events.", "alex");
  assert.equal((await respond(heard(m3.id, m3.text, "eng"), { ...NOTHING, related: { chatId: "eng", rootId: root.id } }, data)).replyId, null);
  // Replies in a thread aren't new conversations.
  assert.equal(await relatedCandidate({ ...heard(m3.id, m3.text, "design"), threadId: m1.id }), null);
  assert.equal((await store.listThreadLinks()).length, 1);
  console.log("✓ linked threads: candidate filter, no self-channel links, one link per pair");
}

async function workload() {
  const { store } = ctx;
  const people = Object.values(dir.people);
  const t = (id: string, who: string, extra: Partial<Ticket> = {}) => ticket(id, who, extra);
  // Rules, pure.
  const four = [t("A1", "priya"), t("A2", "priya"), t("A3", "priya"), t("A4", "jonas", { status: "Done" }), t("A5", "sam"), t("A6", "sam")];
  assert.equal(suggestOwner(t("N", "priya"), { tickets: four, people, memories: [], previous: null }), null, "4 open: fine");
  const five = [...four, t("A7", "priya")];
  const s = suggestOwner(t("N", "priya"), { tickets: five, people, memories: [], previous: null });
  assert.equal(s?.to, "jonas", "fewest open on the team");
  assert.equal(s?.reason.open, OVERLOAD_OPEN);
  assert.equal(suggestOwner(t("N", "priya", { team: "design" }), { tickets: five, people, memories: [], previous: null })?.to, "maya", "the ticket's team first");
  assert.equal(suggestOwner(t("N", "priya", { team: "growth" }), { tickets: five, people, memories: [], previous: null })?.to, "jonas", "no one on the ticket's team: the assignee's team");
  assert.equal(suggestOwner(t("N", "priya"), { tickets: five, people, memories: [], previous: "jonas" })?.to, "sam", "never back to the previous owner");
  assert.equal(suggestOwner(t("N", "priya", { status: "Done" }), { tickets: five, people, memories: [], previous: null }), null, "closed tickets");

  // Out of office: a team memory, on the due date.
  const said = "2026-11-04T10:00:00.000Z"; // a Wednesday
  const mem = (text: string) => ({ agentId: "team", text, createdAt: said });
  const priya = dir.people.priya;
  assert.ok(outOn([mem("Priya Raman is out on Monday.")], priya, "2026-11-09"));
  assert.equal(outOn([mem("Priya Raman is out on Monday.")], priya, "2026-11-16"), null, "only the next Monday");
  assert.equal(outOn([mem("Priya Raman is out on Monday.")], priya, "2026-11-10"), null);
  assert.ok(outOn([mem("Priya is off Fridays")], priya, "2026-12-04"), "every Friday");
  assert.ok(outOn([mem("Priya on vacation Nov 12")], priya, "2026-11-12"));
  assert.equal(outOn([{ ...mem("Priya Raman is out on Monday."), agentId: "ag1" }], priya, "2026-11-09"), null, "team memories only");
  assert.equal(outOn([mem("Maya is out on Monday.")], priya, "2026-11-09"), null, "someone else");
  const due = { due: "2026-11-09" };
  const out = suggestOwner(t("N", "priya", due), { tickets: four, people, memories: [mem("Priya Raman is out on Monday.")], previous: null });
  assert.equal(out?.to, "jonas", "not overloaded, but out on the due date");
  assert.ok(out?.reason.out);
  assert.equal(
    suggestOwner(t("N", "priya", due), { tickets: four, people, memories: [mem("Priya Raman is out on Monday."), mem("Jonas Weber is out Monday")], previous: null })?.to,
    "sam", "a teammate who's out too is skipped",
  );

  // Through the store: assigning a busy person posts one confirm card; confirming reassigns.
  for (const x of [t("B1", "priya"), t("B2", "priya"), t("B3", "priya"), t("B4", "priya"), t("B5", "sam"), t("B6", "jonas"), t("B7", "jonas")]) await store.insertTicket(x);
  await store.insertTicket(t("W1", "alex", { watch: { chat: "eng", thread: null } }));
  const before = (await store.listMessages("eng")).length;
  const w1 = (await store.getTicket("W1"))!;
  await store.saveTicket({ ...w1, assignee: "priya" });
  let msgs = await store.listMessages("eng");
  assert.equal(msgs.length, before + 1, "one suggestion in the watch channel");
  const card = msgs[msgs.length - 1];
  assert.equal(card.who, "atlas");
  assert.match(card.text, /Priya now has 5 open tickets\. Sam has 1 open on Engineering\. Reassign W1 to Sam\?/);
  assert.equal(card.action?.status, "pending");
  // Saving again (or racing) doesn't suggest twice.
  await store.saveTicket({ ...(await store.getTicket("W1"))!, title: "Renamed" });
  await store.saveTicket({ ...(await store.getTicket("W1"))!, assignee: "alex" });
  await store.saveTicket({ ...(await store.getTicket("W1"))!, assignee: "priya" });
  assert.equal((await store.listMessages("eng")).length, before + 1);
  // Confirm: reassigned, with Undo.
  const done = await decideAction({ id: card.action!.id, decision: "confirm", role: "owner" });
  assert.equal(done.status, "applied");
  assert.equal((await store.getTicket("W1"))!.assignee, "sam");
  assert.equal((await store.getTicket("W1"))!.title, "Renamed", "only the assignee changes");
  assert.equal((await store.listMessages("eng")).length, before + 1, "no new suggestion for Sam");
  // Undo puts Priya back; that's the team's call, so no new suggestion either.
  await decideAction({ id: card.action!.id, decision: "undo", role: "owner" });
  assert.equal((await store.getTicket("W1"))!.assignee, "priya");
  assert.equal((await store.listMessages("eng")).length, before + 1);
  assert.ok(await store.getAction(suggestionId("W1", "priya")));

  // Taking a ticket yourself, or a light load: nothing. No watch channel: the assigner's Atlas DM.
  await store.insertTicket(t("W2", "alex"));
  dir.me = "priya";
  await store.saveTicket({ ...(await store.getTicket("W2"))!, assignee: "priya" });
  dir.me = "alex";
  assert.equal(await store.getAction(suggestionId("W2", "priya")), null, "self-assigned");
  await store.insertTicket(t("W3", "jonas", { due: null }));
  assert.equal(await store.getAction(suggestionId("W3", "jonas")), null, "Jonas isn't overloaded");
  await store.insertTicket(t("W4", "priya"));
  msgs = await store.listMessages("atlasdm");
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /Reassign W4 to Sam\?/);
  console.log("✓ workload balancer: threshold, team, out of office, confirm reassigns, never twice");
}

async function main() {
  await followUps();
  await links();
  await workload();
  console.log("All proactive tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
