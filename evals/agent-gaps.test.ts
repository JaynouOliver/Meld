/**
 * Agent gaps without a model: npm run test:agentgaps
 * - @mentions in ticket comments: the parser (people, agents, unknown names, self),
 *   one notice per mention, an agent mention queuing exactly one run, no loops past the
 *   depth cap, and a read-only agent's answer posted on the ticket once.
 * - Keyword playbooks: whole-word / phrase matching, case, agents' messages ignored,
 *   one run per message, steps in the message's thread; ticket playbooks unchanged.
 */
import assert from "node:assert/strict";

import { setCtxProvider, setNotifier, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type AgentInfo, type Directory } from "../src/lib/directory";
import { newComments, parseCommentMentions } from "../src/lib/agent/comment-mentions";
import type { BlockerNotice } from "../src/lib/agent/blockers";
import { MAX_AGENT_DEPTH, RATE_ALL, type AgentRun } from "../src/lib/agent/runs";
import { cleanPlaybook, keywordRegex, matchMessagePlaybooks, matchPlaybooks, stepHeader, type Playbook } from "../src/lib/automation";
import { createTicket, updateTicket } from "../src/lib/api/service";
import { STATUSES } from "../src/lib/constants";
import { memoryStore } from "../src/lib/store/memory";
import type { Ticket } from "../src/lib/types";
import { configureAssignments, withAssignmentPickup } from "../src/server/agents/assignment";
import { configureCommentMentions, finishCommentReply, onNewComments, withCommentMentions } from "../src/server/agents/comment-mentions";
import { configureAutomation, withAutomation } from "../src/server/automation";
import { afterPlaybookStep, configurePlaybooks, messageEvent, savePlaybook } from "../src/server/automation/playbooks";

const tess: AgentInfo = { id: "ag-tess", handle: "tess", name: "Tess", description: "Triage", instructions: "", tools: ["read", "write"], kind: "custom", createdBy: "u1" };
const rex: AgentInfo = { id: "ag-rex", handle: "rex", name: "Rex", description: "Reviewer", instructions: "", tools: ["read"], kind: "custom", createdBy: "u1" };
const person = (id: string, name: string, team: string, isAgent = false) => ({ id, name, first: name.split(" ")[0], initials: name[0], color: "#000", team, isAgent });

const dir: Directory = {
  workspace: { id: "ws-gaps", name: "Test", slug: "test", ticketPrefix: "G", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "u3", "u4", "u5", "atlas"],
  teams: [{ id: "eng", name: "Engineering" }, { id: "design", name: "Design" }] as Directory["teams"],
  people: {
    u1: person("u1", "Alex Rivera", "eng"), u2: person("u2", "Jonas Weber", "eng"), u3: person("u3", "Maya Chen", "design"),
    u4: person("u4", "Gus Guest", "design"), u5: person("u5", "Jonas Berg", "design"), atlas: ATLAS,
    [tess.id]: person(tess.id, "Tess", "eng", true), [rex.id]: person(rex.id, "Rex", "eng", true),
  },
  agents: [ATLAS_AGENT, tess, rex],
  chats: {
    eng: { id: "eng", kind: "channel", label: "engineering", topic: "", team: "eng", members: [], agents: [{ id: "atlas", mode: "mention" }, { id: tess.id, mode: "lurk" }, { id: rex.id, mode: "mention" }] },
    design: { id: "design", kind: "channel", label: "design", topic: "", team: "design", members: [], agents: [{ id: "atlas", mode: "mention" }] },
    dmrex: { id: "dmrex", kind: "dm", who: rex.id, topic: "" },
    dmatlas: { id: "dmatlas", kind: "dm", who: "atlas", topic: "" },
  } as Directory["chats"],
  channels: ["eng", "design"], dms: ["dmrex", "dmatlas"], home: "eng", demo: false,
  memberships: [
    { id: "u1", name: "Alex Rivera", role: "owner" }, { id: "u2", name: "Jonas Weber", role: "member" }, { id: "u3", name: "Maya Chen", role: "member" },
    { id: "u4", name: "Gus Guest", role: "guest" }, { id: "u5", name: "Jonas Berg", role: "member" },
  ],
};
const store = withAutomation(withAssignmentPickup(withCommentMentions(memoryStore("ws-gaps", "G"))));
const base: RequestCtx = { dir, store };
let ctx: RequestCtx = base;
setCtxProvider(() => ctx);
const as = async <T,>(c: RequestCtx, fn: () => Promise<T>) => {
  const prev = ctx;
  ctx = c;
  try {
    return await fn();
  } finally {
    ctx = prev;
  }
};

const notices: BlockerNotice[] = [];
setNotifier(async (n) => (notices.push(...n), n.map(() => "dmatlas")));
const woken: AgentRun[] = [];
configureCommentMentions({ enabled: () => true, schedule: (r) => void woken.push(r) });
configureAssignments({ enabled: () => false });
configureAutomation({ enabled: () => true, schedule: () => {} });
const steps: AgentRun[] = [];
configurePlaybooks(async (r) => void steps.push(r));

const blankTicket = (id: string, extra: Partial<Ticket> = {}): Ticket => ({
  id, team: "eng", title: "Stripe webhook retries", description: "Retry failed webhooks with backoff.", status: "In progress", priority: "High",
  assignee: "u2", reporter: "u1", links: [], images: [], updated: "", watch: null, labels: [], activity: [], comments: [], ...extra,
});
const comment = (id: string, text: string) => updateTicket({ id, role: "owner", addComment: text });

async function main() {
  // ---------------------------------------------------------------- parser
  const p = (text: string, author = "u1") => parseCommentMentions(dir, text, author);
  assert.deepEqual(p("@Jonas Weber can you check the retry logic?"), { people: ["u2"], agents: [] }, "full name");
  assert.deepEqual(p("@maya, thoughts?"), { people: ["u3"], agents: [] }, "first name, any case, trailing punctuation");
  assert.deepEqual(p("@Jonas can you check?"), { people: [], agents: [] }, "an ambiguous first name (two Jonases) names nobody");
  assert.deepEqual(p("@jonas berg FYI"), { people: ["u5"], agents: [] }, "the full name settles it");
  assert.deepEqual(p("@rex please review, and @atlas file a follow-up. @agent too"), { people: [], agents: [rex.id, "atlas"] }, "agents by handle, @agent is Atlas, once each");
  assert.deepEqual(p("@Bob and @nobody, mail alex@orbit.dev"), { people: [], agents: [] }, "unknown names and emails are ignored");
  assert.deepEqual(p("@Alex note to self, @maya @Maya"), { people: ["u3"], agents: [] }, "never the author; each person once");
  assert.deepEqual(p("@rex @tess", rex.id), { people: [], agents: [tess.id] }, "an agent never mentions itself");
  assert.deepEqual(newComments({ comments: [{ id: "a", who: "u1", text: "", time: "" }] }, { comments: [{ id: "a", who: "u1", text: "", time: "" }, { id: "b", who: "u1", text: "", time: "" }] }).map((c) => c.id), ["b"]);

  // ---------------------------------------------------------------- people: one notice per mention
  await store.insertTicket(blankTicket("T-1"));
  await comment("T-1", "@Jonas Weber can you check the retry logic? cc @jonas weber @maya");
  assert.deepEqual(notices.map((n) => n.to), ["u2"], "each mentioned person once (Maya is on Design and can't see this Engineering ticket)");
  assert.match(notices[0].text, /^Alex Rivera mentioned you on T-1: “@Jonas Weber can you check the retry logic\?/, "who, the ticket (a chip) and the comment");
  assert.equal(notices[0].ticketId, "T-1");
  notices.length = 0;
  await updateTicket({ id: "T-1", role: "owner", patch: { priority: "Low" } });
  await comment("T-1", "No mentions here");
  assert.equal(notices.length, 0, "later saves and plain comments don't re-notify");
  await comment("T-1", "@Alex reminder to myself");
  assert.equal(notices.length, 0, "self-mentions don't notify");
  await comment("T-1", "@gus can you look?");
  assert.equal(notices.length, 0, "someone who can't see the ticket isn't sent its comment");
  assert.equal(woken.length, 0, "no agent was mentioned");

  // ---------------------------------------------------------------- agents: one run, no loops
  await store.insertTicket(blankTicket("T-2", { watch: { chat: "eng", thread: "root-2" } }));
  await comment("T-2", "@rex is three retries enough, or could a retry charge someone twice?");
  assert.equal(woken.length, 1, "an agent mention queues one run");
  const r1 = woken[0];
  assert.equal(r1.agentId, rex.id);
  assert.equal(r1.trigger, "mention");
  assert.equal(r1.depth, 0);
  assert.equal(r1.requester, "u1", "it acts for the person who commented");
  assert.equal(r1.role, "owner");
  assert.equal(r1.chatId, "eng", "in the ticket's watch thread, which Rex reads");
  assert.equal(r1.threadId, "root-2");
  assert.match(r1.text, /Alex Rivera mentioned you in a comment on ticket T-2 \(comment [^)]+\): "Stripe webhook retries"/);
  assert.match(r1.text, /could a retry charge someone twice/);
  assert.match(r1.text, /Meld posts it on T-2 as your comment/, "a read-only agent answers through its reply");
  assert.equal((await store.listRecentRuns()).filter((r) => r.agentId === rex.id).length, 1);
  await updateTicket({ id: "T-2", role: "owner", patch: { priority: "Low" } });
  assert.equal(woken.length, 1, "re-saving the ticket doesn't wake it again");

  // Rex answers: Meld posts the reply as Rex's comment, once. It mentions Alex (a notice) and @atlas (no hand-off: the chat reply already did).
  const rexCtx: RequestCtx = { ...base, scopedTo: rex.id, run: { id: r1.id, depth: r1.depth, role: r1.role } };
  notices.length = 0;
  const reply = "@Alex No double charge: the handler is idempotent on the event id. @atlas could track a reconcile job.\nReplied on T-2.";
  assert.equal(await as(rexCtx, () => finishCommentReply(r1, rex, reply)), true);
  assert.equal(await as(rexCtx, () => finishCommentReply(r1, rex, reply)), false, "posted once");
  const g2 = (await store.getTicket("T-2"))!;
  const answer = g2.comments!.at(-1)!;
  assert.equal(answer.who, rex.id);
  assert.equal(answer.text, "@Alex No double charge: the handler is idempotent on the event id. @atlas could track a reconcile job.", "the reply, minus the 'Replied on' line");
  assert.deepEqual(notices.map((n) => n.to), ["u1"], "the person it answers hears about it");
  assert.equal(woken.length, 1, "the copied answer doesn't wake agents a second time");

  // An agent's own comment (comment_on_ticket): it never wakes itself, others go one level deeper, capped.
  const comment2 = async (who: string, text: string, depth: number) => {
    // (Not scopedTo: placing the run would rebuild the requester's directory from the registry.)
    const c: RequestCtx = { ...base, run: { id: `run-${who}-${depth}`, depth, role: "owner" } };
    await as(c, async () => {
      const t = (await store.getTicket("T-2"))!;
      t.comments = [...(t.comments ?? []), { id: `c-${who}-${depth}-${Math.random()}`, who, text, time: new Date().toISOString() }];
      await store.saveTicket(t);
    });
  };
  await comment2(rex.id, "@rex noting for myself", 1);
  assert.equal(woken.length, 1, "an agent's comment never wakes the agent itself");
  await comment2(rex.id, "@atlas please file the reconcile job", 1);
  assert.equal(woken.length, 2);
  assert.equal(woken[1].agentId, "atlas");
  assert.equal(woken[1].depth, 2, "one level deeper than the run that commented");
  assert.equal(woken[1].requester, "u1", "permissions travel with the work");
  assert.equal(woken[1].chatId, "eng");
  await comment2("atlas", "@rex ping-pong", MAX_AGENT_DEPTH);
  assert.equal(woken.length, 2, "nothing past the depth cap");
  // A write-capable agent that answered with comment_on_ticket gets no extra comment.
  const tessRun = { ...r1, id: "cmt-tess", agentId: tess.id, text: r1.text };
  await comment2(tess.id, "Answered here.", 0);
  assert.equal(await as({ ...base, scopedTo: tess.id, run: { id: "cmt-tess", depth: 0, role: "owner" } }, () => finishCommentReply(tessRun, tess, "Replied on T-2.")), false);

  // No watch thread Rex can read: his DM with the requester. Rate limit per chat.
  await store.insertTicket(blankTicket("T-3"));
  await comment("T-3", "@rex take a look");
  assert.equal(woken.at(-1)!.chatId, "dmrex", "the agent's DM with the person who asked");
  const n = woken.length;
  for (let i = 0; i < RATE_ALL; i++) {
    await store.enqueueRun({ ...r1, id: `filler${i}`, triggerMessageId: `filler${i}`, chatId: "dmrex", createdAt: new Date().toISOString() });
  }
  await comment("T-3", "@rex and again");
  assert.equal(woken.length, n, "rate-limited per chat");
  // Agents only run with a model.
  configureCommentMentions({ enabled: () => false });
  await store.insertTicket(blankTicket("T-4"));
  assert.equal((await as(base, async () => onNewComments(await store.getTicket("T-4"), { ...(await store.getTicket("T-4"))!, comments: [{ id: "x", who: "u1", text: "@tess hi @maya", time: "" }] }))).runs.length, 0);
  configureCommentMentions({ enabled: () => true });

  // ---------------------------------------------------------------- keyword matching
  const re = keywordRegex("outage")!;
  assert.ok(re.test("We have an outage: login is failing for some users"));
  assert.ok(re.test("OUTAGE!"), "any case");
  assert.ok(re.test("(outage)"), "punctuation around it");
  assert.ok(!re.test("two outages this week"), "whole words only");
  assert.ok(!re.test("burnoutage"), "not inside another word");
  const phrase = keywordRegex("login failing")!;
  assert.ok(phrase.test("Login   failing again"), "phrases allow any spacing");
  assert.ok(!phrase.test("login is failing"), "but keep the words together");
  assert.ok(keywordRegex("c++ (beta)")!.test("the c++ (beta) build"), "special characters are literal");
  assert.equal(keywordRegex("   "), null);

  const kw: Playbook = {
    id: "pb-kw", name: "Incident", trigger: { kind: "keyword", chatId: "eng", keyword: "outage" }, enabled: true, chatId: "eng", createdBy: "u1", createdAt: "", updatedAt: "",
    steps: [{ agentId: tess.id, instruction: "Open an incident ticket" }, { agentId: rex.id, instruction: "List checks" }],
  };
  const msg = { chatId: "eng", threadId: null, messageId: "m1", authorId: "u1", text: "We have an outage: login is failing" };
  assert.equal(matchMessagePlaybooks([kw], msg, false).length, 1);
  assert.equal(matchMessagePlaybooks([kw], msg, true).length, 0, "agents' messages are ignored");
  assert.equal(matchMessagePlaybooks([kw], { ...msg, chatId: "design" }, false).length, 0, "only in its channel");
  assert.equal(matchMessagePlaybooks([{ ...kw, enabled: false }], msg, false).length, 0, "disabled");
  assert.equal(matchMessagePlaybooks([kw], { ...msg, text: "no outages today" }, false).length, 0);

  // The form: a keyword trigger needs a real channel and a keyword; it posts in its channel.
  const x = { agents: ["atlas", tess.id, rex.id], statuses: STATUSES, chats: ["eng", "design"] };
  const ok = cleanPlaybook({ name: "Incident", trigger: { kind: "keyword", chatId: "eng", keyword: "  outage " }, steps: kw.steps, chatId: "design" }, x);
  assert.ok("ok" in ok && ok.ok.trigger.kind === "keyword" && ok.ok.trigger.keyword === "outage" && ok.ok.chatId === "eng");
  assert.ok("error" in cleanPlaybook({ name: "I", trigger: { kind: "keyword", chatId: "nope", keyword: "outage" }, steps: kw.steps }, x));
  assert.ok("error" in cleanPlaybook({ name: "I", trigger: { kind: "keyword", chatId: "eng", keyword: "!!" }, steps: kw.steps }, x));

  // ---------------------------------------------------------------- keyword runs: one per message, in its thread
  const incident = await savePlaybook({ name: "Incident", trigger: { kind: "keyword", chatId: "eng", keyword: "outage" }, steps: kw.steps }, "owner");
  const root = await store.appendMessage("eng", { id: "msg-out", who: "u1", time: new Date().toISOString(), text: "We have an outage: login is failing for some users" });
  const m = { chatId: "eng", threadId: null, messageId: root.id, authorId: "u1", text: root.text };
  const [run] = await messageEvent(m, "owner");
  assert.ok(run, "the keyword starts the playbook");
  assert.equal(run.status, "running");
  assert.equal(run.ticketId, "", "no ticket");
  assert.equal(run.messageId, root.id);
  assert.equal(run.messageAuthor, "u1");
  assert.equal(run.threadId, root.id, "in the message's thread");
  assert.equal((await messageEvent(m, "owner")).length, 0, "one run per message");
  assert.equal(steps.length, 1);
  assert.equal(steps[0].agentId, tess.id);
  assert.equal(steps[0].threadId, root.id);
  assert.match(steps[0].text, /^Playbook: Incident · step 1 of 2, started by a message in #engineering from Alex Rivera:\n"We have an outage: login is failing for some users"/);
  assert.match(steps[0].text, /Your step: Open an incident ticket/);
  let thread = (await store.listMessages("eng")).find((x) => x.id === root.id)!;
  assert.equal(thread.replies[0].who, tess.id, "the step's agent posts its header in the thread");
  assert.equal(thread.replies[0].text, `**${stepHeader("Incident", 0, 2)}** · Open an incident ticket`);
  assert.equal(thread.replies[0].ticket ?? null, null, "no ticket chip");
  await store.appendMessage("eng", { id: `${steps[0].id}r`, who: tess.id, time: "", text: "Opened G-9." }, root.id);
  await afterPlaybookStep(steps[0], true);
  assert.equal(steps.length, 2, "the next step starts");
  assert.equal(steps[1].agentId, rex.id);
  assert.equal(steps[1].threadId, root.id);
  assert.match(steps[1].text, /step 2 of 2, started by a message/);
  await afterPlaybookStep(steps[1], true);
  const runs = await store.listPlaybookRuns({ playbookId: incident.id });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "done");
  thread = (await store.listMessages("eng")).find((x) => x.id === root.id)!;
  assert.equal(thread.replies.filter((r) => r.text.startsWith("**Playbook: Incident")).length, 2);

  // Agents' messages and other channels start nothing; neither does a message without the keyword.
  assert.equal((await messageEvent({ ...m, messageId: "m-agent", authorId: tess.id }, "owner")).length, 0, "agents can't start it");
  assert.equal((await messageEvent({ ...m, messageId: "m-design", chatId: "design" }, "owner")).length, 0);
  assert.equal((await messageEvent({ ...m, messageId: "m-none", text: "All good, no outages" }, "owner")).length, 0);
  // A reply in a thread runs in that thread.
  const [inThread] = await messageEvent({ ...m, messageId: "m-reply", threadId: root.id, text: "Outage is spreading to signup" }, "owner");
  assert.equal(inThread.threadId, root.id);

  // ---------------------------------------------------------------- ticket playbooks: unchanged
  const bug = await savePlaybook({ name: "Bug intake", trigger: { kind: "label", label: "bug" }, chatId: "eng", steps: [{ agentId: tess.id, instruction: "Confirm repro" }] }, "owner");
  const before = blankTicket("T-50", { labels: [] });
  const after = { ...before, labels: ["bug"] };
  const pbs = [kw, { ...bug }];
  assert.deepEqual(matchPlaybooks(pbs, before, after).map((x) => x.key), [`${bug.id}|T-50|label`], "keyword playbooks never match ticket events");
  assert.deepEqual(matchPlaybooks([bug], before, after), matchPlaybooks(pbs, before, after).filter((x) => x.pb.id === bug.id));
  steps.length = 0;
  const t = await createTicket({ team: "eng", title: "Checkout fails for EU cards", labels: [] }, "owner");
  await updateTicket({ id: t.id, role: "owner", patch: { labels: ["bug"] } });
  assert.equal(steps.length, 1, "labeled bug starts Bug intake");
  assert.equal(steps[0].chatId, "eng", "no watch thread: the playbook's channel");
  assert.equal(steps[0].threadId, `${steps[0].id}h`, "in a new thread under the first header");
  assert.match(steps[0].text, new RegExp(`^Playbook: Bug intake · step 1 of 1 for ticket ${t.id}: "Checkout fails for EU cards"`));
  const tr = (await store.listPlaybookRuns({ ticketId: t.id }))[0];
  assert.equal(tr.ticketId, t.id);
  assert.equal(tr.messageId ?? null, null, "ticket runs carry no message");
  const header = (await store.listMessages("eng")).flatMap((x) => [x, ...x.replies]).find((x) => x.id === `${steps[0].id}h`);
  assert.equal(header?.ticket, t.id, "the first header still shows the ticket chip");
  await updateTicket({ id: t.id, role: "owner", patch: { labels: ["bug", "billing"] } });
  assert.equal(steps.length, 1, "once per ticket, as before");

  console.log("agent-gaps: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
