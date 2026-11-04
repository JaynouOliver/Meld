/**
 * Meeting notes to actions, without a model: npm run test:notes
 * A fake extraction goes through the same checks and apply step as the real one:
 * owners must be people (or write-capable agents in the channel), dates must be real and
 * ahead, open tickets are reused instead of duplicated, decisions land in the decision
 * log, and the action items wait on one confirm card that files every ticket, with Undo.
 */
import assert from "node:assert/strict";

import { decideAction } from "../src/lib/api/service";
import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type AgentInfo, type Directory } from "../src/lib/directory";
import { memoryStore } from "../src/lib/store/memory";
import type { Ticket } from "../src/lib/types";
import { checkDue, checkExtraction, resolvePerson, type RawExtraction } from "../src/server/notes/extract";
import { applyMeetingNotes, decodeNotes, encodeNotes, notesWorld } from "../src/server/notes";

const tess: AgentInfo = { id: "ag-tess", handle: "tess", name: "Tess", description: "Triage", instructions: "", tools: ["read", "write"], kind: "custom", createdBy: "u1" };
const rex: AgentInfo = { id: "ag-rex", handle: "rex", name: "Rex", description: "Reviews", instructions: "", tools: ["read"], kind: "custom", createdBy: "u1" };
const person = (id: string, name: string, team = "eng", isAgent = false) => ({ id, name, first: name.split(" ")[0], initials: name[0], color: "#000", team, isAgent });

const dir: Directory = {
  workspace: { id: "ws-notes", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "u3", "atlas"],
  teams: [{ id: "eng", name: "Engineering" }, { id: "design", name: "Design" }] as Directory["teams"],
  people: {
    u1: person("u1", "Ada Lovelace"), u2: person("u2", "Bo Chen", "design"), u3: person("u3", "Cy Park"), atlas: ATLAS,
    [tess.id]: person(tess.id, "Tess", "eng", true), [rex.id]: person(rex.id, "Rex", "eng", true),
  },
  agents: [ATLAS_AGENT, tess, rex],
  chats: {
    product: {
      id: "product", kind: "channel", label: "product", topic: "", team: null, members: [],
      agents: [{ id: "atlas", mode: "mention" }, { id: tess.id, mode: "mention" }, { id: rex.id, mode: "mention" }],
    },
  },
  channels: ["product"], dms: [], home: "product", memberships: [], demo: false,
};
const ctx: RequestCtx = { dir, store: memoryStore("ws-notes", "T") };
setCtxProvider(() => ctx);

const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const ticket = (id: string, title: string, assignee: string, extra: Partial<Ticket> = {}): Ticket => ({
  id, team: "eng", title, description: "", status: "To do", priority: "Medium", assignee, reporter: "u1",
  links: [], images: [], updated: "Today", watch: null, blockedBy: [], activity: [], ...extra,
});

async function main() {
  const { store } = ctx;
  const [T1, T2] = [await store.nextTicketId(), await store.nextTicketId()];
  await store.insertTicket(ticket(T1, "Referral program landing page", "u2", { team: "design", due: day(4) }));
  await store.insertTicket(ticket(T2, "Pricing FAQ", "u3", { status: "Done" }));
  await store.saveTeamDecision({
    id: "td-old", topic: "Referral reward", statement: "Referral reward is a free month.", rationale: "", rejected: [], deciders: ["u1"],
    chatId: "product", threadId: null, messageId: "m0", status: "active", supersededBy: null, flags: 0, lastFlaggedAt: null, source: "chat",
    createdAt: new Date().toISOString(),
  });

  // Helpers on their own.
  assert.equal(resolvePerson(dir, ["u1", "u2"], "u2"), "u2");
  assert.equal(resolvePerson(dir, ["u1", "u2"], "Bo Chen"), "u2");
  assert.equal(resolvePerson(dir, ["u1", "u2"], "@bo"), "u2");
  assert.equal(resolvePerson(dir, ["u1", "u2"], "u3"), null, "not in the allowed list");
  assert.equal(resolvePerson(dir, ["u1", "u2"], "Zed"), null);
  assert.equal(checkDue(day(3), day(0)), day(3));
  assert.equal(checkDue(day(-1), day(0)), null, "past dates are dropped");
  assert.equal(checkDue("2026-02-30", "2026-01-01"), null, "not a real date");
  assert.equal(checkDue("next Friday", day(0)), null);
  assert.equal(checkDue(day(400), day(0)), null, "more than a year out");
  assert.deepEqual(decodeNotes(encodeNotes("Pricing  sync", "line one\nline two")), { title: "Pricing sync", text: "line one\nline two" });

  // A fake model answer with every kind of mistake.
  const raw: RawExtraction = {
    title: "Model's title",
    summary: ["- Referral program goes live with the Q4 launch.", "Onboarding A/B test starts Monday.", "Pricing page waits on legal.", "A fourth line is dropped."],
    decisions: [
      { topic: "Referral reward", statement: "Referral reward is $20 credit for both sides", rationale: "Cash beats a free month in the survey.", rejected: ["Free month"], decided_by: ["Ada Lovelace", "u2", "ghost"], replaces: "td-old" },
      { topic: "Dup", statement: "Referral reward is $20 credit for both sides", decided_by: ["u1"] },
      { topic: "Empty", statement: "  " },
      { topic: "Already logged", statement: "Referral reward is a free month." },
      { topic: "Test length", statement: "The onboarding A/B test runs for two weeks.", decided_by: [], replaces: "td-nope" },
    ],
    actions: [
      { title: "Write referral terms", owner: "u2", due: day(3), team: "design", priority: "High" },
      { title: "Set up A/B test flags", owner: "Nobody Here", due: "2026-02-30", team: "nope" },
      { title: "Triage referral bugs", owner: "@tess", due: day(-2) },
      { title: "Review rollout risks", owner: "rex" },
      { title: "Build the referral program landing page", owner: "u1", due: day(9) },
      { title: "Update the pricing FAQ", owner: "u3", existing: T2, due: day(5) },
      { title: "Write referral terms", owner: "u3" },
      { title: "", owner: "u1" },
    ],
    questions: [
      { question: "Do referral credits expire?", ask: "Bo" },
      { question: "Who owns the launch email?", ask: "someone" },
      { question: "" },
    ],
  };
  const world = await notesWorld("product", "owner");
  const ex = checkExtraction(raw, world, { title: "Launch sync", requester: "u1" });

  assert.equal(ex.title, "Launch sync", "the title the person gave wins");
  assert.deepEqual(ex.summary, ["Referral program goes live with the Q4 launch.", "Onboarding A/B test starts Monday.", "Pricing page waits on legal."]);

  // Decisions: deduped, empty and already-logged ones dropped, deciders and replaces checked.
  assert.equal(ex.decisions.length, 2);
  assert.deepEqual(ex.decisions[0].deciders, ["u1", "u2"]);
  assert.equal(ex.decisions[0].replaces, "td-old");
  assert.deepEqual(ex.decisions[1].deciders, ["u1"], "no deciders named: the person who shared the notes");
  assert.equal(ex.decisions[1].replaces, null, "unknown decision id ignored");

  // Action items: owners, teams, dates, and reuse of open tickets.
  const by = (t: string) => ex.actions.find((a) => a.title === t)!;
  assert.equal(ex.actions.length, 6, "duplicate and empty titles dropped");
  assert.deepEqual([by("Write referral terms").owner, by("Write referral terms").due, by("Write referral terms").team, by("Write referral terms").priority], ["u2", day(3), "design", "High"]);
  const flags = by("Set up A/B test flags");
  assert.deepEqual([flags.owner, flags.ownerNamed, flags.due, flags.team], ["u1", false, null, "eng"], "unknown owner falls to the requester; bad date and team fixed");
  assert.deepEqual([by("Triage referral bugs").owner, by("Triage referral bugs").due], [tess.id, null], "a write-capable agent in the channel can own work; past date dropped");
  assert.deepEqual([by("Review rollout risks").owner, by("Review rollout risks").ownerNamed], ["u1", false], "a read-only agent can't own a ticket");
  const reused = ex.actions.find((a) => a.existing === T1)!;
  assert.ok(reused, "an open ticket covering the item is reused");
  assert.deepEqual([reused.owner, reused.title], ["u2", "Referral program landing page"], "keeps the ticket's owner and title");
  assert.equal(by("Update the pricing FAQ").existing, null, "a Done ticket isn't reused");

  // Questions: who should answer, checked.
  assert.deepEqual(ex.questions, [{ question: "Do referral credits expire?", ask: "u2" }, { question: "Who owns the launch email?", ask: null }]);

  // Apply: decisions logged now, tickets held on one confirm card.
  const before = (await store.listTickets()).length;
  const out = await applyMeetingNotes(ex, { chatId: "product", threadId: null, messageId: "notes1", role: "owner" });
  const decisions = await store.listTeamDecisions();
  const fresh = decisions.filter((d) => d.messageId === "notes1");
  assert.equal(fresh.length, 2);
  assert.ok(fresh.every((d) => d.source === "chat" && d.status === "active" && d.chatId === "product"));
  assert.equal(decisions.find((d) => d.id === "td-old")!.status, "superseded", "a reversed decision is superseded");
  assert.equal(decisions.find((d) => d.id === "td-old")!.supersededBy, fresh[0].id);

  assert.ok(out.action);
  assert.equal(out.action!.status, "pending");
  assert.equal(out.action!.ops.length, 5, "every new item, none for the reused ticket");
  assert.ok(out.action!.ops.every((o) => o.type === "create"));
  assert.equal((await store.listTickets()).length, before, "nothing filed before Confirm");
  assert.deepEqual(out.reused, [T1]);
  assert.ok(out.action!.summary.some((s) => s.includes(`due `)), "the card shows due dates");

  const msg = (await store.listMessages("product")).find((m) => m.id === "notes1")!;
  assert.equal(msg.who, "atlas");
  assert.match(msg.text, /^\*\*Notes: Launch sync\*\*/);
  assert.match(msg.text, /\*\*Decisions\*\*/);
  assert.match(msg.text, /- @Bo Write referral terms, due /);
  assert.match(msg.text, /@tess Triage referral bugs/);
  assert.match(msg.text, /@Ada \(no owner named\) Set up A\/B test flags/);
  assert.match(msg.text, new RegExp(`already tracked in ${T1}`));
  assert.match(msg.text, /\*\*Open questions\*\*\n- @Bo Do referral credits expire\?/);
  assert.match(msg.text, /Confirm below to file all 5 tickets/);

  // Confirm: one click files every ticket with its owner and date.
  await decideAction({ id: out.action!.id, decision: "confirm", role: "owner" });
  const filed = (await store.listTickets()).filter((t) => out.proposed.includes(t.id));
  assert.equal(filed.length, 5);
  const terms = filed.find((t) => t.title === "Write referral terms")!;
  assert.deepEqual([terms.assignee, terms.due, terms.team, terms.priority, terms.reporter], ["u2", day(3), "design", "High", "atlas"]);
  assert.equal(filed.find((t) => t.title === "Triage referral bugs")!.assignee, tess.id);
  assert.match(terms.description, /From the meeting notes "Launch sync"/);
  assert.equal((await store.getAction(out.action!.id))!.status, "applied");

  // Undo: the tickets go away again; the decisions stay (they were said in the meeting).
  await decideAction({ id: out.action!.id, decision: "undo", role: "owner" });
  assert.equal((await store.listTickets()).filter((t) => out.proposed.includes(t.id)).length, 0);
  assert.equal((await store.listTickets()).length, before);
  assert.equal((await store.getAction(out.action!.id))!.status, "undone");

  // Notes with nothing actionable: a message, no card.
  const empty = checkExtraction({ summary: ["Just a demo."], decisions: [], actions: [], questions: [] }, await notesWorld("product", "owner"), { requester: "u1" });
  const none = await applyMeetingNotes(empty, { chatId: "product", threadId: null, messageId: "notes2", role: "owner" });
  assert.equal(none.action, null);
  assert.match(none.message.text, /didn't find decisions/);

  // A member files only in their own team: items for other teams move to it.
  ctx.dir = { ...dir, role: "member" };
  const member = checkExtraction({ actions: [{ title: "Design the referral badge", owner: "u2", team: "design" }] }, await notesWorld("product", "member"), { requester: "u1" });
  const mine = await applyMeetingNotes(member, { chatId: "product", threadId: null, messageId: "notes3", role: "member" });
  assert.equal((mine.action!.ops[0] as { after: Ticket }).after.team, "eng");
  ctx.dir = dir;

  console.log("meeting notes: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
