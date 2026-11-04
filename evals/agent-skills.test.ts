/**
 * Agent skills without a model: npm run test:skills
 * - Assigned tickets: an agent assignee starts one run (any path that saves the ticket),
 *   never for people, never on the agent's own saves, never twice; depth and rate limits.
 * - Agent memory: remember / forget, permissions, and what goes into the prompt.
 */
import assert from "node:assert/strict";

import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type AgentInfo, type Directory } from "../src/lib/directory";
import { memoryLines, MEMORIES_IN_PROMPT, TEAM_MEMORY } from "../src/lib/agent/memory";
import type { AgentRun } from "../src/lib/agent/runs";
import { createTicket, updateTicket } from "../src/lib/api/service";
import { memoryStore } from "../src/lib/store/memory";
import type { Ticket } from "../src/lib/types";
import { configureAssignments, finishAssignment, pickUpAssignment, withAssignmentPickup } from "../src/server/agents/assignment";
import { forgetMemory, memoryBlock, rememberFact } from "../src/server/agents/memory";
import { launchMission } from "../src/server/missions";

const reviewer: AgentInfo = { id: "ag-review", handle: "reviewer", name: "Reviewer", description: "Reviews plans for risks", instructions: "", tools: ["read"], kind: "custom", createdBy: "u1" };
const triage: AgentInfo = { id: "ag-triage", handle: "triage", name: "Triage", description: "Files bugs", instructions: "", tools: ["read", "write"], kind: "custom", createdBy: "u1" };
const person = (id: string, name: string, isAgent = false) => ({ id, name, first: name, initials: name[0], color: "#000", team: "eng", isAgent });

const dir: Directory = {
  workspace: { id: "ws-skills", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "atlas"], teams: [{ id: "eng", name: "Engineering" }] as Directory["teams"],
  people: { u1: person("u1", "Ada"), u2: person("u2", "Bo"), atlas: ATLAS, [reviewer.id]: person(reviewer.id, "Reviewer", true), [triage.id]: person(triage.id, "Triage", true) },
  agents: [ATLAS_AGENT, reviewer, triage],
  chats: {
    eng: { id: "eng", kind: "channel", label: "eng", topic: "", team: null, members: [], agents: [{ id: "atlas", mode: "mention" }, { id: reviewer.id, mode: "mention" }] },
    dmtriage: { id: "dmtriage", kind: "dm", who: triage.id, topic: "" },
    dmatlas: { id: "dmatlas", kind: "dm", who: "atlas", topic: "" },
  },
  channels: ["eng"], dms: ["dmtriage", "dmatlas"], home: "eng", memberships: [], demo: false,
};
let ctx: RequestCtx = { dir, store: withAssignmentPickup(memoryStore("ws-skills", "T")) };
setCtxProvider(() => ctx);

const scheduled: AgentRun[] = [];
configureAssignments({ enabled: () => true, schedule: (r) => scheduled.push(r) });
const runs = async () => (await ctx.store.listRecentRuns()).filter((r) => r.trigger === "assignment");

async function main() {
  // ---------------------------------------------------------------- assignment
  const t = await createTicket({ title: "Alerts rollout plan", team: "eng", assignee: "u2", watch: { chat: "eng", thread: null } }, "owner");
  assert.equal((await runs()).length, 0, "a person's ticket starts nothing");

  // The ticket panel path (updateTicket) assigns it to the Reviewer agent.
  await updateTicket({ id: t.id, role: "owner", patch: { assignee: reviewer.id } });
  const assigned = (await ctx.store.getTicket(t.id))!;
  let all = await runs();
  assert.equal(all.length, 1, "assigning to an agent starts one run");
  const run = all[0];
  assert.equal(run.agentId, reviewer.id);
  assert.equal(run.chatId, "eng", "works where the ticket is watched");
  assert.equal(run.depth, 0);
  assert.equal(run.requester, "u1", "acts for the person who assigned it");
  assert.match(run.text, new RegExp(`Ticket ${t.id}: "Alerts rollout plan"`));
  assert.equal(scheduled.length, 1, "scheduled after the response");
  const ack = (await ctx.store.listMessages("eng")).find((m) => m.id === run.triggerMessageId);
  assert.ok(ack && ack.who === reviewer.id && /^On it: /.test(ack.text), "the agent says it's on it");
  assert.equal(run.threadId, ack!.id, "in a channel, the work goes in the acknowledgment's thread");

  // Saves that keep the same agent assignee (the agent moving it on, edits) start nothing.
  await updateTicket({ id: t.id, role: "owner", patch: { priority: "High" } });
  await updateTicket({ id: t.id, role: "owner", patch: { title: "Alerts rollout plan v2" } });
  assert.equal((await runs()).length, 1, "no re-trigger on saves of the same assignment");

  // The same assignment noticed twice (a repeated save) runs once.
  const before: Ticket = { ...assigned, assignee: "u2" };
  assert.equal(await pickUpAssignment(before, assigned), null, "same assignment is never queued twice");

  // Finishing: the agent's reply moves it to In review (or Done when it says so), as the agent.
  await ctx.store.claimRun(run.id);
  const moved = await finishAssignment(run, reviewer, "• Risk one\nMoving " + t.id + " to In review.", run.threadId);
  assert.equal((await ctx.store.getTicket(t.id))!.status, "In review");
  assert.deepEqual(moved, [], "the reply already said where it went");
  assert.equal((await runs()).length, 1, "the agent's own save doesn't wake it");

  // Without a watch channel the agent can read: its DM with the assigner. Done when it says so.
  const bug = await createTicket({ title: "Crash on login", team: "eng", assignee: triage.id, watch: { chat: "eng", thread: null } }, "owner");
  all = await runs();
  const r2 = all.find((r) => r.agentId === triage.id)!;
  assert.ok(r2, "createTicket with an agent assignee starts a run");
  assert.equal(r2.chatId, "dmtriage", "Triage can't read #eng: falls back to its DM");
  assert.equal(r2.threadId, null);
  await finishAssignment(r2, triage, `Filed it.\nMoving ${bug.id} to Done.`, null);
  assert.equal((await ctx.store.getTicket(bug.id))!.status, "Done");

  // No status line in the reply: still moves to In review, with a one-line note.
  const t3 = await createTicket({ title: "Draft standup notes", team: "eng", assignee: "atlas" }, "owner");
  const r3 = (await runs()).find((r) => r.agentId === "atlas")!;
  assert.equal(r3.chatId, "dmatlas", "Atlas without a watch: its DM with the assigner");
  assert.deepEqual(await finishAssignment(r3, ATLAS_AGENT, "Here's the summary.", null), ["dmatlas"]);
  assert.equal((await ctx.store.getTicket(t3.id))!.status, "In review");

  // Reassigned while it worked: leave it alone.
  const t4 = await createTicket({ title: "Check copy", team: "eng", assignee: reviewer.id, watch: { chat: "eng", thread: null } }, "owner");
  const r4 = (await runs()).find((r) => r.text.includes(t4.id))!;
  await updateTicket({ id: t4.id, role: "owner", patch: { assignee: "u2" } });
  await finishAssignment(r4, reviewer, `Moving ${t4.id} to Done.`, r4.threadId);
  assert.equal((await ctx.store.getTicket(t4.id))!.status, "To do");

  // Nothing to do on finished tickets; an agent assigning itself mid-run is already on it.
  const done = { ...t4, status: "Done" as const, assignee: reviewer.id };
  assert.equal(await pickUpAssignment({ ...t4, assignee: "u2" }, done), null);
  const base = ctx;
  ctx = { ...base, scopedTo: reviewer.id };
  assert.equal(await pickUpAssignment({ ...t4, activity: [], assignee: "u2" }, { ...t4, assignee: reviewer.id }), null, "no self-trigger");

  // Depth: assigned from inside an agent's run is one hop deeper; capped at 3.
  ctx = { ...base, run: { id: "parent", depth: 1, role: "member" } };
  const deeper = await pickUpAssignment({ ...t4, activity: [], assignee: "u2" }, { ...t4, activity: [], assignee: reviewer.id });
  assert.equal(deeper?.depth, 2);
  assert.equal(deeper?.parentRunId, "parent");
  assert.equal(deeper?.role, "member", "the run's role carries over");
  ctx = { ...base, run: { id: "parent", depth: 3, role: "member" } };
  assert.equal(await pickUpAssignment({ ...t4, activity: [1, 2] as never, assignee: "u2" }, { ...t4, activity: [1, 2] as never, assignee: reviewer.id }), null, "depth cap");
  ctx = base;

  // Rate limit: a busy chat starts no more agent runs.
  ctx = { dir, store: withAssignmentPickup(memoryStore("ws-skills-rate", "T")) };
  for (let i = 0; i < 16; i++) {
    await ctx.store.enqueueRun({ ...run, id: `busy${i}`, triggerMessageId: `busy${i}` });
  }
  const busy = await createTicket({ title: "Busy", team: "eng", assignee: reviewer.id, watch: { chat: "eng", thread: null } }, "owner");
  assert.equal((await runs()).filter((r) => r.text.includes(`Ticket ${busy.id}: "Busy"`)).length, 0, "rate-limited");
  ctx = base;

  // Disabled (no model configured): saving never starts anything.
  configureAssignments({ enabled: () => false });
  const quiet = await createTicket({ title: "Quiet", team: "eng", assignee: reviewer.id }, "owner");
  assert.equal((await runs()).filter((r) => r.text.includes(quiet.id)).length, 0);
  configureAssignments({ enabled: () => true });

  // Mission launch: agent owners start once (their tickets are assigned), not again via the hand-off line.
  ctx = { dir, store: withAssignmentPickup(memoryStore("ws-skills-mission", "T")) };
  const root = await ctx.store.appendMessage("eng", { id: "mroot", who: "atlas", time: new Date().toISOString(), text: "Mission started" });
  await ctx.store.saveMission({
    id: "ms1", title: "Ship", goal: "Ship", chatId: "eng", threadId: root.id, status: "draft", deadline: null,
    plan: { tasks: [{ key: "a", title: "Review the plan", description: "", owner: reviewer.id, team: "eng", priority: "Medium", due: null, dependsOn: [] }], risks: [] },
    summary: "", health: "", createdBy: "u1", createdAt: new Date().toISOString(), launchedAt: null, lastCheckinAt: null,
  });
  await launchMission("ms1", "owner");
  const mruns = await ctx.store.listRecentRuns();
  assert.deepEqual(mruns.map((r) => `${r.agentId}:${r.trigger}`), [`${reviewer.id}:assignment`], "one run per agent task");
  assert.equal(mruns[0].threadId, "mroot", "in the mission's thread");
  ctx = base;

  // ---------------------------------------------------------------- memory
  ctx = { dir, store: withAssignmentPickup(memoryStore("ws-skills-mem", "T")) };
  const m1 = await rememberFact({ text: "  Maya is out   on Fridays. ", forTeam: true, role: "owner" });
  assert.equal(m1.agentId, TEAM_MEMORY);
  assert.equal(m1.text, "Maya is out on Fridays.");
  assert.equal((await rememberFact({ text: "maya is out on fridays.", forTeam: true, role: "owner" })).id, m1.id, "no duplicates");
  const m2 = await rememberFact({ text: "Ada prefers bullet summaries.", role: "member" });
  assert.equal(m2.agentId, "atlas", "outside an agent run, Atlas keeps it");
  ctx = { ...ctx, scopedTo: reviewer.id };
  const m3 = await rememberFact({ text: "Rank risks by customer impact.", role: "member" });
  assert.equal(m3.agentId, reviewer.id, "inside a run, the running agent keeps it");
  ctx = { ...ctx, scopedTo: undefined };
  await assert.rejects(rememberFact({ text: "Guests can't", role: "guest" }), /Guests/);
  await assert.rejects(rememberFact({ text: " ", role: "owner" }), /what to remember/);

  // Prompt injection: own + team, not other agents', with ids for forget().
  const atlasBlock = await memoryBlock("atlas");
  assert.match(atlasBlock, /Maya is out on Fridays/);
  assert.match(atlasBlock, /Ada prefers bullet summaries/);
  assert.doesNotMatch(atlasBlock, /customer impact/, "another agent's memory stays with it");
  assert.match(atlasBlock, new RegExp(`\\[${m1.id}\\]`));
  assert.match(await memoryBlock(reviewer.id), /customer impact/);
  assert.equal(await memoryBlock(triage.id).then((b) => /Ada prefers/.test(b)), false);

  // Capped at the newest 30.
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, agentId: "atlas", text: `fact ${i}`, createdBy: "u1", createdAt: new Date(Date.now() + i * 1000).toISOString() }));
  const lines = memoryLines(many, "atlas", () => "Ada");
  assert.equal(lines.length, MEMORIES_IN_PROMPT);
  assert.match(lines[0], /fact 39/, "newest first");

  // Forget: guests can't; a second forget finds nothing.
  await assert.rejects(forgetMemory(m2.id, "guest"), /Guests/);
  await forgetMemory(m2.id, "owner");
  assert.doesNotMatch(await memoryBlock("atlas"), /bullet summaries/);
  await assert.rejects(forgetMemory(m2.id, "owner"), /already gone/);

  console.log("agent skills: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
