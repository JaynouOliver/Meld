import "server-only";

import { after } from "next/server";

import { currentCtx, deliverNotices } from "@/lib/context";
import { agentById, agentDmOf, agentModeIn, atlasDmOf, ATLAS_ID, personOf, teamName, type AgentInfo, type Directory } from "@/lib/directory";
import { stamp } from "@/lib/format";
import { blockerNotices } from "@/lib/agent/blockers";
import { MAX_AGENT_DEPTH, RATE_ALL, RATE_WINDOW_MS, type AgentRun } from "@/lib/agent/runs";
import type { Store } from "@/lib/store";
import { layer, servesCtx } from "@/lib/store/layers";
import type { ChatId, Ticket, TicketStatus } from "@/lib/types";
import { llm } from "../llm";
import { pingChanges } from "../realtime";
import { balanceAssignment, workloadEnabled } from "../proactive/workload";

/**
 * Agents work on tickets assigned to them. The hook is the workspace store itself: every
 * way a ticket gets an assignee (the ticket panel, createTicket, Atlas and the listener via
 * applyOps, Undo/Confirm, mission launch, MCP) ends in store.insertTicket / saveTicket on
 * the request's context store, so wrapping that one object (withAssignmentPickup, applied
 * where contexts are built in src/server/workspace.ts) covers them all, including paths
 * added later. Only a change of assignee *to* an agent counts, so an agent re-saving its
 * own ticket (moving it to In review) never wakes it again.
 *
 * The pick-up is a run in the agent's inbox (trigger "assignment"), governed like any
 * other: depth (an agent assigning to another agent is one hop deeper), the per-chat rate
 * limit, and an idempotency key so the same assignment never runs twice.
 */

type Schedule = (run: AgentRun, workspaceId: string) => void;

let enabled: () => boolean = () => !!llm();
let schedule: Schedule = (run, workspaceId) => {
  try {
    // After the response, in a fresh context as the requester (a DM may have just been made).
    after(async () => {
      const [{ contextAs }, { runInCtx }, { processRun }] = await Promise.all([import("../workspace"), import("../context"), import("../atlas/queue")]);
      const ctx = await contextAs(workspaceId, run.requester);
      await runInCtx(ctx, () => processRun(run.id));
    });
  } catch {
    // Outside a request (scripts): the run stays queued and the sweep starts it.
  }
};

/** Tests: run without a model, and capture instead of scheduling. */
export function configureAssignments(opts: { enabled?: () => boolean; schedule?: Schedule }) {
  if (opts.enabled) enabled = opts.enabled;
  if (opts.schedule) schedule = opts.schedule;
}

const isAgent = (t: Ticket) => !!agentById(currentCtx().dir, t.assignee);
/** Assigned to a person, inside a request (the balancer needs one). */
const toPerson = (t: Ticket) => {
  try {
    return !isAgent(t);
  } catch {
    return false;
  }
};

/** The store, plus: a ticket newly assigned to an agent starts that agent's run. */
export function withAssignmentPickup(inner: Store): Store {
  const wrapped: Store = {
    ...inner,
    async insertTicket(t) {
      await inner.insertTicket(t);
      if (enabled() && isAgent(t)) await guarded(wrapped, null, t);
      else if (workloadEnabled() && toPerson(t)) await balanced(wrapped, null, t);
    },
    async saveTicket(t) {
      // An agent assignee needs the previous state (one read); so does the workload balancer for people.
      const person = workloadEnabled() && toPerson(t);
      const before = (enabled() && isAgent(t)) || person ? await inner.getTicket(t.id) : null;
      await inner.saveTicket(t);
      if (before && before.assignee !== t.assignee) await (person ? balanced(wrapped, before, t) : guarded(wrapped, before, t));
    },
  };
  return layer(inner, wrapped);
}

/** The pick-up never fails the save that caused it. Only writes made through this request's store count. */
async function guarded(store: Store, before: Ticket | null, t: Ticket) {
  if (!servesCtx(store, currentCtx().store)) return;
  try {
    await pickUpAssignment(before, t);
  } catch (e) {
    console.error(`[assignment] ${t.id} → ${t.assignee} failed:`, e);
  }
}

/** A person was assigned: maybe suggest someone less loaded (src/server/proactive/workload.ts). Never fails the save. */
async function balanced(store: Store, before: Ticket | null, t: Ticket) {
  if (!servesCtx(store, currentCtx().store)) return;
  try {
    await balanceAssignment(before, t);
  } catch (e) {
    console.error(`[workload] ${t.id} → ${t.assignee} failed:`, e);
  }
}

/** Small stable hash for idempotency keys (message ids must stay short). */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Where the agent works on it: the ticket's watch thread/channel if it can read there, else its DM with the assigner. */
async function placeFor(dir: Directory, agent: AgentInfo, t: Ticket): Promise<{ chat: ChatId; thread: string | null } | null> {
  if (t.watch && agentModeIn(dir, t.watch.chat, agent.id)) return { chat: t.watch.chat, thread: t.watch.thread };
  const dm = agent.id === ATLAS_ID ? atlasDmOf(dir) : agentDmOf(dir, agent.id);
  if (dm) return { chat: dm, thread: null };
  const { openDm } = await import("../workspace");
  return { chat: (await openDm({ dir, store: currentCtx().store }, agent.id)).id, thread: null };
}

/**
 * A ticket's assignee became an agent: queue that agent's run and say "On it" where it
 * will work. Returns the run, or null when nothing should happen (and why, in the log).
 */
export async function pickUpAssignment(before: Ticket | null, t: Ticket): Promise<AgentRun | null> {
  const ctx = currentCtx();
  const agent = agentById(ctx.dir, t.assignee);
  if (!agent) return null; // people pick their own work up
  if (before && before.assignee === t.assignee) return null; // not a new assignment
  if (ctx.scopedTo === agent.id) return null; // an agent taking a ticket mid-run is already on it
  if (agentById(ctx.dir, ctx.dir.me)) return null; // an external agent (MCP) acting as itself: no requester to run for
  if (t.status === "Done" || t.status === "Backburner") return null; // nothing to work on
  const depth = ctx.run ? ctx.run.depth + 1 : 0;
  if (depth > MAX_AGENT_DEPTH) {
    console.log(`[assignment] ${t.id} → @${agent.handle}: depth ${depth} over the limit, not started`);
    return null;
  }

  // An agent's run sees only its own chats; pick the place with the requester's full view.
  const { store } = ctx;
  const dir = ctx.scopedTo ? (await (await import("../workspace")).contextAs(ctx.dir.workspace.id, ctx.dir.me)).dir : ctx.dir;
  const where = await placeFor(dir, agent, t);
  if (!where) return null;
  if ((await store.countRunsSince(where.chat, new Date(Date.now() - RATE_WINDOW_MS).toISOString())) >= RATE_ALL) {
    console.log(`[assignment] ${t.id} → @${agent.handle}: rate-limited in ${where.chat}, not started`);
    return null;
  }

  // Same ticket, agent, previous owner and history → same key: a repeated save can't start it twice.
  const key = `as${hash(`${t.id}|${agent.id}|${before?.assignee ?? ""}|${t.activity.length}`)}${hash(t.id)}`;
  const external = agent.kind === "external";
  const channel = dir.chats[where.chat]?.kind === "channel";
  const run: AgentRun = {
    // A fresh id: enqueueRun returns the existing run (another id) if this key was queued before.
    id: `run${key}${Date.now().toString(36)}`, triggerMessageId: key, chatId: where.chat,
    // In a channel without a thread, the work goes in the thread of the "On it" message.
    threadId: where.thread ?? (channel && !external ? key : null),
    agentId: agent.id, trigger: "assignment", depth, parentRunId: ctx.run?.id ?? null,
    requester: ctx.dir.me, role: ctx.run?.role ?? ctx.dir.role,
    text: assignmentTask(dir, agent, t), status: "queued", attempts: 0, error: null, result: null, trace: null,
    createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
  };
  const queued = await store.enqueueRun(run);
  if (queued.id !== run.id) return null; // this assignment is already being handled

  // External agents (MCP) pick it up from their inbox; Meld doesn't speak for them.
  if (!external) {
    const by = personOf(dir, ctx.dir.me).name;
    await store.appendMessage(
      where.chat,
      { id: key, who: agent.id, time: stamp(), text: `On it: ${t.id}, assigned by ${by}. I'll post what I find here and move it to In review when I'm done.`, ticket: t.id },
      where.thread,
    );
  }
  const workspaceId = ctx.dir.workspace.id;
  void pingChanges({ chats: [where.chat], tickets: false, runs: true, origin: null, workspaceId });
  if (!external) schedule(queued, workspaceId);
  console.log(`[assignment] ${t.id} → @${agent.handle} (depth ${depth}) in ${where.chat}`);
  return queued;
}

/** The run's request: the ticket, and how to finish. */
export function assignmentTask(dir: Directory, agent: AgentInfo, t: Ticket) {
  const extra = [
    t.due ? `due ${t.due}` : null,
    t.links.length ? `links: ${t.links.map((l) => `${l.kind} #${l.num}`).join(", ")}` : null,
    t.blockedBy?.length ? `blocked by ${t.blockedBy.join(", ")}` : null,
  ].filter(Boolean);
  return `${personOf(dir, dir.me).name} assigned a ticket to you. Work on it now, as far as your role and tools allow.
Ticket ${t.id}: "${t.title || "Untitled"}"
${t.status} · ${t.priority} priority · ${teamName(dir, t.team)}${extra.length ? ` · ${extra.join(" · ")}` : ""}
Description: ${t.description.trim().slice(0, 1500) || "(none)"}

How to do it:
- Read what you need first: get_ticket, and ticket_discussion for the conversation behind it.
- Do the part your role covers (${agent.description || "help the team"}) and post the result: concrete findings, a summary, or what you changed. At most six "• " lines, citing the messages you rely on.
- Don't reassign it or change its status yourself; Meld does that when you finish.
- End with exactly one line: "Moving ${t.id} to In review." Write "Moving ${t.id} to Done." instead only if the work is completely finished and needs no one's review.`;
}

const ticketOfTask = (text: string) => /^Ticket (\S+): /m.exec(text)?.[1] ?? null;

/**
 * After the agent's reply: move the ticket to In review (or Done if the agent said it's
 * finished), as the agent. Its own save doesn't wake it again (same assignee). Returns
 * chats that got a message.
 */
export async function finishAssignment(run: AgentRun, agent: AgentInfo, reply: string, threadId: string | null): Promise<ChatId[]> {
  const { dir, store } = currentCtx();
  const id = ticketOfTask(run.text);
  const t = id ? await store.getTicket(id) : null;
  // Reassigned or deleted while the agent worked: leave it to whoever has it now.
  if (!t || t.assignee !== agent.id) return [];
  const said = new RegExp(`Moving ${t.id} to (In review|Done)`, "i").exec(reply)?.[1];
  const status: TicketStatus = said?.toLowerCase() === "done" ? "Done" : "In review";
  const chats: ChatId[] = [];
  if (t.status !== status && t.status !== "Done") {
    const before = structuredClone(t);
    t.status = status;
    t.updated = "Just now";
    t.activity.push({ who: agent.name, text: `moved it to ${status} after working on it`, time: stamp() });
    await store.saveTicket(t);
    chats.push(...(await deliverNotices(blockerNotices(dir, before, t, await store.listTickets(), agent.id))));
  }
  // The reply normally says where the ticket went; if it didn't, say it in one line.
  if (!said) {
    await store.appendMessage(run.chatId, { id: `${run.id}m`, who: agent.id, time: stamp(), text: `Moved ${t.id} to ${t.status}.` }, threadId);
    chats.push(run.chatId);
  }
  return chats;
}
