/**
 * Agent dispatch + loop governor (no model calls): npm run test:agents
 * Who gets a run for a message: mentions, DMs, lurk/active channel agents; agent-to-agent
 * hand-offs one level deeper; no self-wakes; depth and rate limits; channel scoping.
 */
import assert from "node:assert/strict";

import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type AgentInfo, type Directory } from "../src/lib/directory";
import { memoryStore } from "../src/lib/store/memory";
import { dispatch } from "../src/server/agents/dispatch";

const triage: AgentInfo = { id: "ag-triage", handle: "triage", name: "Triage", description: "Triages bugs", instructions: "", tools: ["read", "write"], kind: "custom", createdBy: "u1" };
const reviewer: AgentInfo = { id: "ag-review", handle: "reviewer", name: "Reviewer", description: "Reviews", instructions: "", tools: ["read"], kind: "custom", createdBy: "u1" };
const helper: AgentInfo = { id: "ag-help", handle: "helper", name: "Helper", description: "Chimes in", instructions: "", tools: ["read"], kind: "custom", createdBy: "u1" };
const person = (id: string, name: string, isAgent = false) => ({ id, name, first: name, initials: name[0], color: "#000", team: null, isAgent });

const dir: Directory = {
  workspace: { id: "ws-test", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "atlas"], teams: [],
  people: { u1: person("u1", "Ada"), atlas: ATLAS, [triage.id]: person(triage.id, "Triage", true), [reviewer.id]: person(reviewer.id, "Reviewer", true), [helper.id]: person(helper.id, "Helper", true) },
  agents: [ATLAS_AGENT, triage, reviewer, helper],
  chats: {
    bugs: { id: "bugs", kind: "channel", label: "bugs", topic: "", team: null, members: [], agents: [{ id: "atlas", mode: "mention" }, { id: triage.id, mode: "lurk" }, { id: reviewer.id, mode: "mention" }] },
    lounge: { id: "lounge", kind: "channel", label: "lounge", topic: "", team: null, members: [], agents: [{ id: helper.id, mode: "active" }] },
    dmtriage: { id: "dmtriage", kind: "dm", who: triage.id, topic: "" },
  },
  channels: ["bugs", "lounge"], dms: ["dmtriage"], home: "bugs", memberships: [], demo: false,
};
let ctx: RequestCtx = { dir, store: memoryStore("ws-test", "T") };
setCtxProvider(() => ctx);
let n = 0;
const msg = (chatId: string, text: string, extra: Partial<Parameters<typeof dispatch>[0]> = {}) =>
  dispatch({ chatId, threadId: null, messageId: `m${n++}`, authorId: "u1", text, role: "owner", ...extra });
const who = (runs: { agentId: string; trigger: string }[]) => runs.map((r) => `${r.agentId}:${r.trigger}`).sort();

async function main() {
  // Mentions of member agents; lurkers only on questions/bugs.
  assert.deepEqual(who(await msg("bugs", "@reviewer can you look at this diff")), ["ag-review:mention"]);
  assert.deepEqual(who(await msg("bugs", "lunch?")), ["ag-triage:proactive"], "a question wakes the lurker");
  assert.deepEqual(who(await msg("bugs", "shipped the release notes")), [], "no trigger, no lurker");
  assert.deepEqual(who(await msg("bugs", "Checkout is broken on Safari")), ["ag-triage:proactive"]);
  assert.deepEqual(who(await msg("bugs", "@triage checkout is broken")), ["ag-triage:mention"], "mention beats proactive");
  // Atlas is in every channel by default; @agent still means Atlas.
  assert.deepEqual(who(await msg("bugs", "@agent file this")), ["atlas:mention"]);

  // Not in the channel: no run, a short note instead.
  const before = (await ctx.store.listMessages("lounge")).length;
  assert.deepEqual(who(await msg("lounge", "@reviewer thoughts?")), ["ag-help:proactive"], "active agent still checks in");
  const notes = (await ctx.store.listMessages("lounge")).slice(before);
  assert.ok(notes.some((m) => m.who === reviewer.id && /not in #lounge/.test(m.text)), "reviewer says it can't read #lounge");

  // DMs go to that agent.
  assert.deepEqual(who(await msg("dmtriage", "hey")), ["ag-triage:dm"]);

  // Agent-to-agent: only explicit mentions, one level deeper, never itself, capped.
  const parent = { id: "p1", depth: 0, requester: "u1", role: "member" as const, triggerMessageId: "human-1" };
  const handed = await msg("bugs", "@reviewer please check edge cases. @triage noted.", { authorId: triage.id, parent });
  assert.deepEqual(who(handed), ["ag-review:delegation"], "author never wakes itself; no proactive on agent messages");
  assert.equal(handed[0].depth, 1);
  assert.equal(handed[0].requester, "u1", "permissions travel with the hand-off");
  assert.equal(handed[0].role, "member");
  assert.deepEqual(who(await msg("lounge", "anyone?", { authorId: triage.id, parent })), [], "agents don't trigger proactive agents");
  assert.deepEqual(who(await msg("bugs", "@reviewer again", { authorId: triage.id, parent: { ...parent, depth: 3 } })), [], "depth cap");

  // No double answers: an agent already asked by the same human message isn't handed it again.
  await msg("bugs", "@reviewer and @triage, look at this", { messageId: "human-2" });
  assert.deepEqual(who(await msg("bugs", "@reviewer over to you", { authorId: triage.id, parent: { ...parent, triggerMessageId: "human-2" } })), [], "reviewer already has it");

  // Rate limit per chat (16 runs / 5 min, proactive gives way at 8).
  ctx = { dir, store: memoryStore("ws-rate", "T") };
  let total = 0;
  for (let i = 0; i < 30; i++) total += (await msg("bugs", "@reviewer ping")).length;
  assert.equal(total, 16, "all runs capped at 16 per window");
  assert.deepEqual(who(await msg("bugs", "is it down?")), [], "proactive dropped when busy");

  console.log("agents: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
