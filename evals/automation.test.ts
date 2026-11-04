/**
 * Workflow automation without a model: npm run test:automation
 * - Auto-triage: which creations trigger it (and which don't), validation against real
 *   data, explicit fields never overwritten, once per ticket, Undo.
 * - Playbooks: trigger matching, step chaining order, no retrigger loops, disabled
 *   playbooks, and triage + "labeled bug" composing into one run.
 */
import assert from "node:assert/strict";

import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type AgentInfo, type Directory } from "../src/lib/directory";
import { explicitFields, matchPlaybooks, validateTriage, type Playbook } from "../src/lib/automation";
import type { AgentRun } from "../src/lib/agent/runs";
import { createTicket, updateTicket } from "../src/lib/api/service";
import { memoryStore } from "../src/lib/store/memory";
import type { Ticket } from "../src/lib/types";
import { withAssignmentPickup, configureAssignments } from "../src/server/agents/assignment";
import { configureAutomation, withAutomation } from "../src/server/automation";
import { configureTriage, runTriage, triageAgent, undoTriage } from "../src/server/automation/triage";
import { afterPlaybookStep, configurePlaybooks, savePlaybook, setPlaybookEnabled, ticketAutomation } from "../src/server/automation/playbooks";

const tess: AgentInfo = { id: "ag-tess", handle: "tess", name: "Tess", description: "Triage", instructions: "", tools: ["read", "write"], kind: "custom", createdBy: "u1" };
const rex: AgentInfo = { id: "ag-rex", handle: "rex", name: "Rex", description: "Reviewer", instructions: "", tools: ["read"], kind: "custom", createdBy: "u1" };
const person = (id: string, name: string, team: string, isAgent = false) => ({ id, name, first: name, initials: name[0], color: "#000", team, isAgent });

const dir: Directory = {
  workspace: { id: "ws-auto", name: "Test", slug: "test", ticketPrefix: "A", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "u3", "atlas"],
  teams: [{ id: "eng", name: "Engineering" }, { id: "design", name: "Design" }] as Directory["teams"],
  people: {
    u1: person("u1", "Ada", "eng"), u2: person("u2", "Jonas", "eng"), u3: person("u3", "Maya", "design"), atlas: ATLAS,
    [tess.id]: person(tess.id, "Tess", "eng", true), [rex.id]: person(rex.id, "Rex", "eng", true),
  },
  agents: [ATLAS_AGENT, tess, rex],
  chats: {
    eng: { id: "eng", kind: "channel", label: "engineering", topic: "", team: "eng", members: [], agents: [{ id: "atlas", mode: "mention" }, { id: tess.id, mode: "lurk" }, { id: rex.id, mode: "mention" }] },
    design: { id: "design", kind: "channel", label: "design", topic: "", team: "design", members: [], agents: [{ id: "atlas", mode: "mention" }] },
  },
  channels: ["eng", "design"], dms: [], home: "eng", memberships: [], demo: false,
};
const store = withAutomation(withAssignmentPickup(memoryStore("ws-auto", "A")));
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

const jobs: (() => Promise<void>)[] = [];
configureAssignments({ enabled: () => true, schedule: () => {} });
configureAutomation({ enabled: () => true, schedule: (job) => jobs.push(job) });
const drain = async () => {
  while (jobs.length) await jobs.shift()!();
};
let proposal: unknown = null;
const prompts: string[] = [];
configureTriage(async (p) => (prompts.push(p), proposal));
const steps: AgentRun[] = [];
configurePlaybooks(async (r) => void steps.push(r));

/** The ticket panel's path: an empty ticket, then the title. */
async function panelTicket(title: string, preset: Partial<Ticket> = {}) {
  const t = await createTicket({ team: "eng", ...preset }, "owner");
  await updateTicket({ id: t.id, role: "owner", patch: { title } });
  return t.id;
}

async function main() {
  // Workspace history: Jonas owns billing work.
  await store.insertTicket({
    id: "A-900", team: "eng", title: "Stripe webhooks retries", description: "", status: "In progress", priority: "High", assignee: "u2", reporter: "u1",
    links: [], images: [], updated: "", watch: null, labels: ["billing", "bug"], activity: [],
  });
  await store.insertTicket({
    id: "A-901", team: "design", title: "Pricing page", description: "", status: "To do", priority: "Medium", assignee: "u3", reporter: "u1",
    links: [], images: [], updated: "", watch: null, labels: ["design"], activity: [],
  });
  jobs.length = 0; // seed inserts came from "a person" with titles

  // ---------------------------------------------------------------- triage: when
  assert.equal(triageAgent(dir).id, tess.id, "Tess triages when she's in the workspace");
  assert.equal(triageAgent({ ...dir, agents: [ATLAS_AGENT] }).id, "atlas", "else Atlas");

  const blank = await createTicket({ team: "eng" }, "owner");
  assert.equal(jobs.length, 0, "an empty new ticket waits for its title");
  await updateTicket({ id: blank.id, role: "owner", patch: { title: "Checkout fails for EU cards with 3DS" } });
  assert.equal(jobs.length, 1, "the first title triggers triage");
  await updateTicket({ id: blank.id, role: "owner", patch: { title: "Checkout fails for EU cards with 3DS (iOS)" } });
  assert.equal(jobs.length, 1, "later title edits don't");

  // Atlas in a run (thread → tickets), an MCP agent, a mission ticket: not triaged.
  await as({ ...base, run: { id: "run1", depth: 0, role: "owner" }, scopedTo: "atlas" }, () => createTicket({ team: "eng", title: "From a thread" }, "owner"));
  await as({ ...base, dir: { ...dir, me: tess.id } }, () => createTicket({ team: "eng", title: "Via MCP" }, "member"));
  await createTicket({ team: "eng", title: "Mission task", missionId: "m1" }, "owner");
  assert.equal(jobs.length, 1, "agent-run, agent and mission tickets aren't triaged");

  // ---------------------------------------------------------------- triage: what
  proposal = { labels: ["billing", "BUG", "nonsense"], priority: "High", owner: "u2", ownerWhy: "owns webhooks", due: "2026-12-01", reason: "Payments are failing for customers." };
  await drain();
  let t = (await store.getTicket(blank.id))!;
  assert.deepEqual(t.labels, ["billing", "bug"], "only labels the workspace uses");
  assert.equal(t.priority, "High");
  assert.equal(t.assignee, "u2", "the owner of similar tickets");
  assert.equal(t.due ?? null, null, "no due date unless the text names one");
  assert.equal(t.activity.at(-1)!.who, "Tess");
  assert.equal(t.activity.at(-1)!.text, "triaged it: labels billing, bug · priority High · owner Jonas (owns webhooks)");
  assert.match(prompts[0], /Labels used in this workspace: (billing|bug)/, "compact context: workspace labels");
  assert.match(prompts[0], /u2 \| Jonas \| Engineering/, "and owner candidates");
  let view = await ticketAutomation(blank.id, "owner");
  assert.equal(view.triage?.status, "applied");
  assert.equal(view.triage?.undoable, true, "the panel note offers Undo");
  assert.equal(await runTriage(blank.id), null, "a ticket is triaged once");

  // Invalid answers are dropped field by field.
  const bad = validateTriage(
    { labels: ["made-up"], priority: "Urgent", owner: "atlas", due: "2026-12-01", reason: "x" },
    { labels: ["bug"], candidates: ["u2"], explicit: new Set(), ticket: t, today: "2026-11-04" },
  );
  assert.deepEqual([bad.labels, bad.priority, bad.owner, bad.due], [undefined, undefined, undefined, undefined], "every field validated");
  const dated = validateTriage({ due: "2026-11-06" }, { labels: [], candidates: [], explicit: new Set(), ticket: { ...t, title: "Fix login by Friday" }, today: "2026-11-04" });
  assert.equal(dated.due, "2026-11-06", "a due date when the text names one");

  // ---------------------------------------------------------------- explicit fields
  const explicitId = await panelTicket("Refund button broken", { priority: "Low", assignee: "u3", labels: ["design"] });
  proposal = { labels: ["bug"], priority: "High", owner: "u2", reason: "r" };
  await drain();
  t = (await store.getTicket(explicitId))!;
  assert.deepEqual([t.priority, t.assignee, t.labels], ["Low", "u3", ["design"]], "fields set in the create form are never overwritten");
  assert.equal((await ticketAutomation(explicitId, "owner")).triage?.status, "skipped");
  // A person's own edit counts even when it lands on the default value.
  const ex = explicitFields({ ...t, priority: "Medium", assignee: "u1", labels: [], activity: [{ who: "Ada", text: "set priority to Medium", time: "" }] }, "u1", dir.people);
  assert.ok(ex.has("priority") && !ex.has("assignee") && !ex.has("labels"));

  // The listener's commitment ticket: triaged, but the speaker keeps it.
  await store.insertTicket({
    id: "A-950", team: "eng", title: "Write release notes", description: "", status: "To do", priority: "Medium", assignee: "u1", reporter: "atlas",
    links: [], images: [], updated: "", watch: { chat: "eng", thread: null }, activity: [],
  });
  assert.equal(jobs.length, 1, "listener commitments are triaged");
  proposal = { labels: ["design"], priority: "Low", owner: "u2", reason: "Docs work." };
  await drain();
  t = (await store.getTicket("A-950"))!;
  assert.equal(t.assignee, "u1", "a commitment stays with the speaker");
  assert.equal(t.priority, "Low");
  const posted = (await store.listMessages("eng")).find((m) => m.who === tess.id && m.text.startsWith("Triaged A-950"));
  assert.ok(posted?.action?.status === "applied", "watched tickets get a post with Undo");

  // ---------------------------------------------------------------- Undo
  await updateTicket({ id: blank.id, role: "owner", patch: { status: "In progress" } });
  await undoTriage(blank.id, "owner");
  t = (await store.getTicket(blank.id))!;
  assert.deepEqual([t.labels, t.priority, t.assignee, t.status], [[], "Medium", "u1", "In progress"], "Undo restores triaged fields only");
  assert.equal(t.activity.at(-1)!.text, "undid Tess's triage");
  view = await ticketAutomation(blank.id, "owner");
  assert.deepEqual([view.triage?.status, view.triage?.undoable], ["undone", false]);
  await assert.rejects(() => undoTriage(blank.id, "owner"), /Already undone/);
  await assert.rejects(() => undoTriage("A-950", "guest"), /Guests/);

  // ---------------------------------------------------------------- playbook matching
  const pb = (over: Partial<Playbook>): Playbook => ({
    id: "p", name: "P", trigger: { kind: "label", label: "bug" }, steps: [{ agentId: tess.id, instruction: "x" }], enabled: true, chatId: null,
    createdBy: "u1", createdAt: "", updatedAt: "", ...over,
  });
  const tk = (over: Partial<Ticket>): Ticket => ({ ...t, labels: [], status: "To do", title: "T", ...over });
  assert.equal(matchPlaybooks([pb({})], null, tk({ labels: ["bug"] })).length, 1, "created with the label");
  assert.equal(matchPlaybooks([pb({})], tk({}), tk({ labels: ["bug"] })).length, 1, "labeled later");
  assert.equal(matchPlaybooks([pb({})], tk({ labels: ["bug"] }), tk({ labels: ["bug", "ux"] })).length, 0, "already had it");
  assert.equal(matchPlaybooks([pb({})], tk({ title: "", labels: ["bug"] }), tk({ labels: ["bug"] })).length, 1, "waits for a title");
  assert.equal(matchPlaybooks([pb({})], null, tk({ labels: ["bug"], title: "" })).length, 0, "not while untitled");
  assert.equal(matchPlaybooks([pb({ enabled: false })], null, tk({ labels: ["bug"] })).length, 0, "disabled playbooks never match");
  const st = pb({ trigger: { kind: "status", status: "In review" } });
  assert.equal(matchPlaybooks([st], tk({}), tk({ status: "In review" })).length, 1, "moved to the status");
  assert.equal(matchPlaybooks([st], tk({ status: "In review" }), tk({ status: "In review", title: "x" })).length, 0, "not on other saves");
  assert.equal(matchPlaybooks([st], null, tk({ status: "In review" })).length, 0, "created in a status isn't a move");

  // ---------------------------------------------------------------- playbooks end to end
  await assert.rejects(() => savePlaybook({ name: "X", trigger: { kind: "label", label: "bug" }, steps: [{ agentId: tess.id, instruction: "x" }] }, "member"), /owners/);
  await assert.rejects(() => savePlaybook({ name: "X", trigger: { kind: "label", label: "bug" }, steps: [{ agentId: "u2", instruction: "x" }] }, "owner"), /pick an agent/);
  const bugIntake = await savePlaybook({
    name: "Bug intake", trigger: { kind: "label", label: "bug" }, chatId: "eng",
    steps: [
      { agentId: tess.id, instruction: "Confirm steps to reproduce, set severity" },
      { agentId: rex.id, instruction: "Assess rollout risk" },
      { agentId: "atlas", instruction: "Assign the right owner and post a summary" },
    ],
  }, "owner");

  // Auto-triage labels it bug → the playbook starts once (triage's save and its follow-up look both match).
  const bugId = await panelTicket("App crashes when exporting a calendar");
  proposal = { labels: ["bug"], priority: "High", reason: "Crash." };
  await drain();
  let runs = (await ticketAutomation(bugId, "owner")).runs;
  assert.equal(runs.length, 1, "triage + label trigger: exactly one run");
  assert.equal(steps.length, 1);
  assert.equal(steps[0].agentId, tess.id, "step 1 is Tess");
  assert.equal(runs[0].chatId, "eng", "unwatched tickets use the playbook's channel");
  const header = (await store.listMessages("eng")).find((m) => m.id === steps[0].triggerMessageId)!;
  assert.match(header.text, /^\*\*Playbook: Bug intake · step 1 of 3\*\*/, "visible step header");
  assert.equal(steps[0].threadId, header.id, "the steps share one thread");
  assert.match(steps[0].text, new RegExp(`for ticket ${bugId}`));

  // A person adding the label too, or a repeat of the event, doesn't start it again.
  await updateTicket({ id: bugId, role: "owner", patch: { labels: ["bug", "billing"] } });
  assert.equal((await ticketAutomation(bugId, "owner")).runs.length, 1, "no double runs");

  // Chaining: each step starts when the previous one finished, in order.
  await afterPlaybookStep(steps[0], true);
  assert.equal(steps.length, 2);
  assert.equal(steps[1].agentId, rex.id, "then Rex");
  assert.equal(steps[1].threadId, header.id);
  await afterPlaybookStep(steps[0], true);
  assert.equal(steps.length, 2, "a finished step can't advance twice");
  // A step's own changes (Rex moving it, adding labels) start nothing.
  const status = await savePlaybook({ name: "Review", trigger: { kind: "status", status: "In review" }, steps: [{ agentId: rex.id, instruction: "Review" }] }, "owner");
  await as({ ...base, run: { id: steps[1].id, depth: 0, role: "owner" }, scopedTo: rex.id }, async () => {
    const cur = (await store.getTicket(bugId))!;
    await store.saveTicket({ ...cur, status: "In review", labels: [...(cur.labels ?? []), "regression"] });
  });
  assert.equal(steps.length, 2, "a playbook's own changes never retrigger playbooks");
  await afterPlaybookStep(steps[1], true);
  assert.equal(steps[2].agentId, "atlas", "then Atlas");
  await afterPlaybookStep(steps[2], true);
  runs = (await ticketAutomation(bugId, "owner")).runs;
  assert.deepEqual([runs[0].status, runs[0].step, runs[0].runIds.length], ["done", 3, 3], "finished, all steps run");

  // A person moving a ticket to In review starts the status playbook; a failed step stops it.
  await updateTicket({ id: explicitId, role: "owner", patch: { status: "In review" } });
  assert.equal(steps.length, 4);
  assert.equal(steps[3].agentId, rex.id);
  await afterPlaybookStep(steps[3], false);
  const failed = (await ticketAutomation(explicitId, "owner")).runs.find((r) => r.playbookId === status.id)!;
  assert.equal(failed.status, "failed", "a step that doesn't reply stops the playbook");

  // Disabled playbooks don't run.
  await setPlaybookEnabled(bugIntake.id, false, "owner");
  await updateTicket({ id: explicitId, role: "owner", patch: { labels: ["design", "bug"] } });
  assert.equal(steps.length, 4, "disabled: nothing starts");
  await setPlaybookEnabled(bugIntake.id, true, "owner");

  // Depth: an agent past the hand-off limit can't start one.
  await as({ ...base, run: { id: "deep", depth: 3, role: "owner" }, scopedTo: "atlas" }, async () => {
    const cur = (await store.getTicket("A-950"))!;
    await store.saveTicket({ ...cur, labels: ["bug"] });
  });
  assert.equal(steps.length, 4, "depth limit respected");

  console.log("automation tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
