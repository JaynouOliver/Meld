import "server-only";

import {
  cleanPlaybook, matchMessagePlaybooks, matchPlaybooks, MAX_PLAYBOOKS, playbookRunId, runIdOfStep, stepHeader, stepRunId, triggerLabel,
  type Playbook, type PlaybookInput, type PlaybookMessage, type PlaybookRun, type PlaybookView, type TicketAutomationView,
} from "@/lib/automation";
import { MAX_AGENT_DEPTH, RATE_ALL, RATE_WINDOW_MS, type AgentRun } from "@/lib/agent/runs";
import { ApiError, effectiveRole } from "@/lib/api/service";
import { STATUSES } from "@/lib/constants";
import { currentCtx } from "@/lib/context";
import { agentById, agentModeIn, agentsOf, chatTitle, personOf, teamName, type Directory } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import { canSee, viewerOf } from "@/lib/rbac";
import type { ChatId, Role, Ticket } from "@/lib/types";
import { pingChanges } from "../realtime";
import { scheduleJob } from "./index";

/**
 * Agent playbooks: a trigger plus ordered steps, each an agent with an instruction.
 * A firing is a PlaybookRun (its id derived from the event, so it starts once); each
 * step is an ordinary agent run in the queue (id "pb…", trigger "delegation"), posted in
 * the ticket's watch thread under a "Playbook: Bug intake · step 2 of 3" header. When a
 * step's run finishes, the queue calls afterPlaybookStep, which starts the next one.
 * Governed like any agent work: depth (a playbook started by an agent is one hop
 * deeper), the per-chat rate limit, and no playbook starts from a playbook's own changes.
 */

type Runner = (run: AgentRun) => Promise<void>;
let runner: Runner | null = null;
/** Tests: capture step runs instead of executing them. */
export function configurePlaybooks(r: Runner | null) {
  runner = r;
}
async function execute(run: AgentRun) {
  if (runner) return runner(run);
  const { processRun } = await import("../atlas/queue");
  await processRun(run.id);
}

// ---------------------------------------------------------------- triggers

/** A ticket was created or saved (outside any playbook step): start the playbooks it matches. */
export async function playbookEvent(before: Ticket | null, t: Ticket): Promise<PlaybookRun[]> {
  // Cheap check first: most saves gain no label and change no status.
  const gained = !before || !before.title.trim() || (t.labels ?? []).some((l) => !(before.labels ?? []).includes(l));
  if (!gained && before?.status === t.status) return [];
  const { store } = currentCtx();
  const matches = matchPlaybooks(await store.listPlaybooks(), before, t);
  const out: PlaybookRun[] = [];
  for (const m of matches) {
    const r = await startPlaybook(m.pb, m.key, t);
    if (r) out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------- keyword triggers

/**
 * Enabled keyword playbooks per workspace, cached briefly: every message from a person is
 * checked, so this is one read per workspace per window, not per message. Edits on this
 * instance clear it at once; other instances catch up within the window.
 */
const KEYWORD_TTL_MS = 20_000;
const keywordCache = new Map<string, { at: number; pbs: Playbook[] }>();
const forgetKeywordPlaybooks = () => keywordCache.delete(currentCtx().dir.workspace.id);

async function keywordPlaybooks(): Promise<Playbook[]> {
  const { dir, store } = currentCtx();
  const hit = keywordCache.get(dir.workspace.id);
  if (hit && Date.now() - hit.at < KEYWORD_TTL_MS) return hit.pbs;
  const pbs = (await store.listPlaybooks()).filter((p) => p.enabled && p.trigger.kind === "keyword");
  keywordCache.set(dir.workspace.id, { at: Date.now(), pbs });
  return pbs;
}

/** The keyword playbooks a message starts (none for agents' messages). */
export async function matchMessage(m: PlaybookMessage): Promise<{ pb: Playbook; key: string }[]> {
  const { dir } = currentCtx();
  if (agentById(dir, m.authorId) || !dir.chats[m.chatId] || dir.chats[m.chatId].kind !== "channel") return [];
  return matchMessagePlaybooks(await keywordPlaybooks(), m, false);
}

/** A person posted a message: start the keyword playbooks it matches, in its thread. */
export async function messageEvent(m: PlaybookMessage, role?: Role): Promise<PlaybookRun[]> {
  const out: PlaybookRun[] = [];
  for (const x of await matchMessage(m)) {
    const r = await startMessagePlaybook(x.pb, x.key, m, role);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Start a keyword playbook on a message: its steps post in the message's thread (or the
 * thread it was posted in), with the message as their context. Keyed by the message, so
 * it runs once per message.
 */
export async function startMessagePlaybook(pb: Playbook, key: string, m: PlaybookMessage, role?: Role): Promise<PlaybookRun | null> {
  const ctx = currentCtx();
  const { dir, store } = ctx;
  const meta = dir.chats[m.chatId];
  const missing = pb.steps.filter((s) => !agentModeIn(dir, m.chatId, s.agentId)).map((s) => personOf(dir, s.agentId).first);
  const ok = !!meta && !missing.length;
  const now = new Date().toISOString();
  const run: PlaybookRun = {
    id: playbookRunId(key), playbookId: pb.id, playbookName: pb.name, ticketId: "", chatId: m.chatId, threadId: m.threadId ?? m.messageId,
    step: 0, total: pb.steps.length, status: ok ? "running" : "failed", runIds: [], requester: dir.me, createdAt: now, updatedAt: now,
    error: ok ? null : `${[...new Set(missing)].join(", ")} can't read ${meta ? chatTitle(dir, m.chatId) : "that channel"}. Add them to it.`,
    finishedAt: ok ? null : now,
    messageId: m.messageId, messageText: m.text.replace(/\s+/g, " ").trim().slice(0, 280), messageAuthor: m.authorId,
  };
  if (ok && (await store.countRunsSince(m.chatId, new Date(Date.now() - RATE_WINDOW_MS).toISOString())) >= RATE_ALL) {
    console.log(`[playbook] ${pb.name} on message ${m.messageId}: rate-limited in ${m.chatId}, not started`);
    return null;
  }
  if (!(await store.claimPlaybookRun(run))) return null; // this message already started it
  console.log(`[playbook] ${pb.name} on message ${m.messageId} in ${m.chatId}: ${run.status}`);
  if (!ok) return run;
  const first = await startStep(run, 0, 0, null, ctx.run?.role ?? effectiveRole(role));
  if (first) {
    if (runner) await runner(first);
    else scheduleJob(() => execute(first), dir.workspace.id, run.requester);
  }
  return (await store.getPlaybookRun(run.id)) ?? run;
}

/** A keyword run's request: the message that started it, and this step's instruction. */
export function messageStepTask(dir: Directory, pb: Pick<Playbook, "name">, i: number, total: number, instruction: string, run: Pick<PlaybookRun, "chatId" | "messageText" | "messageAuthor">) {
  return `${stepHeader(pb.name, i, total)}, started by a message in ${chatTitle(dir, run.chatId)} from ${personOf(dir, run.messageAuthor ?? dir.me).name}:
"${run.messageText ?? ""}"

Your step: ${instruction}

How to do it:
- The message and earlier steps are in this thread; build on them, don't repeat them.
- Do only your step. If it says to open or change a ticket, do that with your tools; otherwise just report.
- Post the result in at most five "• " lines, concrete and specific to this message.
- Don't @mention other agents or hand off: the playbook starts the next step itself.`;
}

/** Where a playbook works: the ticket's watch thread, else its channel, else any channel all its agents read. */
function placeFor(dir: Directory, pb: Playbook, t: Ticket): { chat: ChatId; thread: string | null } | null {
  const readable = (chat: ChatId) => dir.chats[chat] && pb.steps.every((s) => agentModeIn(dir, chat, s.agentId));
  if (t.watch && readable(t.watch.chat)) return { chat: t.watch.chat, thread: t.watch.thread };
  if (pb.chatId && readable(pb.chatId)) return { chat: pb.chatId, thread: null };
  const team = dir.channels.find((c) => readable(c) && dir.chats[c]?.kind === "channel" && dir.chats[c].team === t.team);
  const any = dir.channels.find((c) => readable(c));
  return team || any ? { chat: (team ?? any)!, thread: null } : null;
}

export async function startPlaybook(pb: Playbook, key: string, t: Ticket): Promise<PlaybookRun | null> {
  const ctx = currentCtx();
  const depth = ctx.run ? ctx.run.depth + 1 : 0;
  if (depth > MAX_AGENT_DEPTH) {
    console.log(`[playbook] ${pb.name} on ${t.id}: depth ${depth} over the limit, not started`);
    return null;
  }
  // An agent's run sees only its own chats; place it with the requester's full view.
  const dir = ctx.scopedTo ? (await (await import("../workspace")).contextAs(ctx.dir.workspace.id, ctx.dir.me)).dir : ctx.dir;
  const where = placeFor(dir, pb, t);
  const now = new Date().toISOString();
  const run: PlaybookRun = {
    id: playbookRunId(key), playbookId: pb.id, playbookName: pb.name, ticketId: t.id, chatId: where?.chat ?? "", threadId: where?.thread ?? null,
    step: 0, total: pb.steps.length, status: where ? "running" : "failed", runIds: [], requester: dir.me, createdAt: now, updatedAt: now,
    error: where ? null : `No channel where ${pb.steps.map((s) => personOf(dir, s.agentId).first).join(", ")} can all read. Add them to one.`,
    finishedAt: where ? null : now,
  };
  const { store } = ctx;
  if (where && (await store.countRunsSince(where.chat, new Date(Date.now() - RATE_WINDOW_MS).toISOString())) >= RATE_ALL) {
    console.log(`[playbook] ${pb.name} on ${t.id}: rate-limited in ${where.chat}, not started`);
    return null;
  }
  if (!(await store.claimPlaybookRun(run))) return null; // this event already started it
  console.log(`[playbook] ${pb.name} on ${t.id} (depth ${depth}) in ${run.chatId || "nowhere"}: ${run.status}`);
  if (!where) return run;
  const first = await startStep(run, 0, depth, ctx.run?.id ?? null, ctx.run?.role ?? ctx.dir.role);
  if (first) {
    if (runner) await runner(first);
    else scheduleJob(() => execute(first), dir.workspace.id, run.requester);
  }
  return (await store.getPlaybookRun(run.id)) ?? run;
}

/** The run's request: the playbook, the ticket as it is now, and this step's instruction. */
export function stepTask(dir: Directory, pb: Pick<Playbook, "name">, i: number, total: number, instruction: string, t: Ticket) {
  return `${stepHeader(pb.name, i, total)} for ticket ${t.id}: "${t.title || "Untitled"}"
${t.status} · ${t.priority} priority · ${teamName(dir, t.team)} · owner ${personOf(dir, t.assignee).name}${(t.labels ?? []).length ? ` · labels ${t.labels!.join(", ")}` : ""}${t.due ? ` · due ${t.due}` : ""}
Description: ${t.description.trim().slice(0, 1200) || "(none)"}

Your step: ${instruction}

How to do it:
- Earlier steps posted in this thread; build on them, don't repeat them.
- Do only your step. If it says to change the ticket (labels, priority, owner), do that with your tools; otherwise just report.
- Post the result in at most five "• " lines, concrete and specific to this ticket.
- Don't @mention other agents or hand off: the playbook starts the next step itself.`;
}

/**
 * Post the step's header (as its agent) and queue its run. The first step's header
 * starts the thread when the ticket has none. Returns the run to execute, or null.
 */
async function startStep(run: PlaybookRun, i: number, depth: number, parentRunId: string | null, role: Role): Promise<AgentRun | null> {
  const { dir, store } = currentCtx();
  const pb = (await store.listPlaybooks()).find((p) => p.id === run.playbookId);
  const step = pb?.steps[i];
  const agent = step ? agentById(dir, step.agentId) : null;
  // A keyword run has no ticket: its context is the message (and its thread).
  const t = run.messageId ? null : await store.getTicket(run.ticketId);
  if (!pb || !step || !agent || (!t && !run.messageId)) {
    await store.advancePlaybookRun(run.id, i, { status: "failed", error: !t && !run.messageId ? "The ticket was deleted" : !agent ? `Step ${i + 1}'s agent no longer exists` : "The playbook changed", finishedAt: new Date().toISOString() });
    return null;
  }
  const id = stepRunId(run.id, i);
  const headerId = `${id}h`;
  const header = { id: headerId, who: agent.id, time: stamp(), text: `**${stepHeader(pb.name, i, run.total)}** · ${step.instruction}`, ticket: i === 0 && t ? t.id : null };
  const saved = await store.appendMessage(run.chatId, header, run.threadId);
  const threadId = run.threadId ?? headerId;
  const agentRun: AgentRun = {
    id, triggerMessageId: headerId, chatId: run.chatId, threadId, agentId: agent.id, trigger: "delegation", depth, parentRunId,
    requester: run.requester, role, text: t ? stepTask(dir, pb, i, run.total, step.instruction, t) : messageStepTask(dir, pb, i, run.total, step.instruction, run),
    status: "queued", attempts: 0, error: null, result: null, trace: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
  };
  const queued = await store.enqueueRun(agentRun);
  await store.advancePlaybookRun(run.id, i, { threadId, runIds: [...run.runIds, id] });
  void pingChanges({
    chats: [run.chatId], tickets: false, runs: true, origin: null, workspaceId: dir.workspace.id,
    message: { chatId: run.chatId, threadId: run.threadId, message: saved },
  });
  return queued.id === id ? queued : null;
}

/**
 * The queue finished a playbook step's run: start the next step (in this same worker,
 * like hand-offs), or finish. A step that didn't reply stops the playbook.
 */
export async function afterPlaybookStep(agentRun: AgentRun, replied: boolean): Promise<void> {
  const ref = runIdOfStep(agentRun.id);
  if (!ref) return;
  const { dir, store } = currentCtx();
  const run = await store.getPlaybookRun(ref.runId);
  if (!run || run.status !== "running" || run.step !== ref.step) return;
  const ping = () => pingChanges({ chats: [], tickets: true, runs: true, origin: null, workspaceId: dir.workspace.id });
  const now = new Date().toISOString();
  if (!replied) {
    await store.advancePlaybookRun(run.id, ref.step, { status: "failed", error: `Step ${ref.step + 1} didn't finish`, finishedAt: now });
    await ping();
    return;
  }
  const next = ref.step + 1;
  if (next >= run.total) {
    await store.advancePlaybookRun(run.id, ref.step, { step: run.total, status: "done", finishedAt: now });
    await ping();
    return;
  }
  // Only one worker moves the run on.
  if (!(await store.advancePlaybookRun(run.id, ref.step, { step: next }))) return;
  const queued = await startStep({ ...run, step: next }, next, agentRun.depth, agentRun.parentRunId, agentRun.role);
  if (queued) await execute(queued);
}

// ---------------------------------------------------------------- API (rpc)

const agentIds = (dir: Directory) => agentsOf(dir).filter((a) => a.kind !== "external").map((a) => a.id);


/** Every playbook with its recent runs (anyone in the workspace can read them). */
export async function listPlaybooks(): Promise<PlaybookView[]> {
  const { store } = currentCtx();
  const [pbs, runs] = await Promise.all([store.listPlaybooks(), store.listPlaybookRuns()]);
  return pbs.map((p) => ({ ...p, runs: runs.filter((r) => r.playbookId === p.id).slice(0, 5) }));
}


/** Create or edit (org owners). */
export async function savePlaybook(input: PlaybookInput, role?: Role): Promise<Playbook> {
  const { dir, store } = currentCtx();
  if (effectiveRole(role) !== "owner") throw new ApiError("Only org owners can change playbooks", 403);
  const r = cleanPlaybook(input, { agents: agentIds(dir), statuses: STATUSES, chats: dir.channels });
  if ("error" in r) throw new ApiError(r.error);
  const all = await store.listPlaybooks();
  const prev = input.id ? all.find((p) => p.id === input.id) : null;
  if (input.id && !prev) throw new ApiError("That playbook no longer exists", 404);
  if (!prev && all.length >= MAX_PLAYBOOKS) throw new ApiError(`A workspace can have at most ${MAX_PLAYBOOKS} playbooks`);
  const now = new Date().toISOString();
  const pb: Playbook = { id: prev?.id ?? `pbk${uid()}`, createdBy: prev?.createdBy ?? dir.me, createdAt: prev?.createdAt ?? now, updatedAt: now, ...r.ok };
  await store.savePlaybook(pb);
  forgetKeywordPlaybooks();
  console.log(`[playbook] ${prev ? "edited" : "created"} "${pb.name}" (${triggerLabel(pb.trigger)}, ${pb.steps.length} steps)`);
  return pb;
}

export async function setPlaybookEnabled(id: string, enabled: boolean, role?: Role): Promise<Playbook> {
  const { store } = currentCtx();
  if (effectiveRole(role) !== "owner") throw new ApiError("Only org owners can change playbooks", 403);
  const pb = (await store.listPlaybooks()).find((p) => p.id === id);
  if (!pb) throw new ApiError("That playbook no longer exists", 404);
  const next = { ...pb, enabled, updatedAt: new Date().toISOString() };
  await store.savePlaybook(next);
  forgetKeywordPlaybooks();
  return next;
}

export async function deletePlaybook(id: string, role?: Role): Promise<void> {
  if (effectiveRole(role) !== "owner") throw new ApiError("Only org owners can delete playbooks", 403);
  await currentCtx().store.deletePlaybook(id);
  forgetKeywordPlaybooks();
}

/** The ticket panel's automation note: its triage (with Undo while it lasts) and playbook runs. */
export async function ticketAutomation(ticketId: string, role?: Role): Promise<TicketAutomationView> {
  const { store } = currentCtx();
  const t = await store.getTicket(ticketId);
  if (!t || !canSee(viewerOf(currentCtx().dir, effectiveRole(role)), t)) return { triage: null, runs: [] };
  const [triage, runs] = await Promise.all([store.getTriage(ticketId), store.listPlaybookRuns({ ticketId })]);
  let view: TicketAutomationView["triage"] = null;
  if (triage) {
    const a = triage.actionId ? await store.getAction(triage.actionId) : null;
    const undone = triage.status === "undone" || a?.status === "undone";
    const undoable = !undone && a?.status === "applied" && !!a.undoUntil && Date.parse(a.undoUntil) > Date.now() && effectiveRole(role) !== "guest";
    view = { ...triage, status: undone ? "undone" : triage.status, undoable };
  }
  return { triage: view, runs: runs.slice(0, 5) };
}
