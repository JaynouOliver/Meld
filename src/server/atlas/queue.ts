import "server-only";

import { agentById, agentModeIn, type AgentInfo } from "@/lib/directory";
import { stamp } from "@/lib/format";
import { currentCtx } from "@/lib/context";
import { getStore } from "@/lib/store";
import { replyIdFor, RUN_PICKUP_MS, RUN_STALE_MS, type AgentRun } from "@/lib/agent/runs";
import type { Message } from "@/lib/types";
import { runInCtx } from "../context";
import { pingChanges } from "../realtime";
import { contextAs } from "../workspace";
import { agentName, dispatch, runsWeExecute, scopeFor } from "../agents/dispatch";
import { shouldRespond } from "../agents/triage";
import { reporter } from "./progress";
import { runAtlasAgent } from "./run";
import { finishAssignment } from "../agents/assignment";
import { runSummary } from "./summary";
import { isPlaybookStep } from "@/lib/automation";
import { afterPlaybookStep } from "../automation/playbooks";

/**
 * The agent queue (docs/architecture.md §4, docs/agent-platform.md). A run is a row in
 * agent_runs, in one agent's inbox: enqueue (dispatch.ts) → claim (atomic) → run the
 * agent → finish. Runs normally start right after the request that enqueued them (Next's
 * after()); sweepRuns() picks up any that were missed or whose worker died.
 */

/** Execute one run if we can claim it. Safe to call more than once for the same run. */
export async function processRun(id: string): Promise<void> {
  const store = await getStore();
  const run = await store.claimRun(id);
  if (!run) return; // someone else has it, or it's finished
  // Run as the person who asked (the sweep may be triggered by someone else's browser).
  const workspaceId = currentCtx().dir.workspace.id;
  const ctx = currentCtx().dir.me === run.requester && !currentCtx().scopedTo ? currentCtx() : await contextAs(workspaceId, run.requester);
  await runInCtx(ctx, () => execute(run, workspaceId));
}

async function execute(run: AgentRun, workspaceId: string) {
  const { dir, store } = currentCtx();
  const agent = agentById(dir, run.agentId);
  if (!agent) {
    // The agent was deleted while the run waited.
    await store.finishRun(run.id, { status: "failed", error: "agent no longer exists", result: { touchedChats: [], openTicket: null, deleted: [] } });
    if (isPlaybookStep(run.id)) await afterPlaybookStep(run, false);
    return;
  }
  // The agent reads only the chats it's a member of (and the requester can see).
  const scoped = { ...currentCtx(), dir: scopeFor(dir, agent.id), scopedTo: agent.id, run: { id: run.id, depth: run.depth, role: run.role } };
  const out = await runInCtx(scoped, () => executeAs(agent, run, workspaceId));
  // Playbook steps: the next step starts once this one has replied (src/server/automation/playbooks.ts).
  if (isPlaybookStep(run.id)) await afterPlaybookStep(run, !!out?.reply);
  // Hand-offs: agents this reply @mentions pick it up, one level deeper (governed in dispatch).
  // (A thread summary only reports: names in it aren't hand-offs.)
  if (out?.reply && run.trigger !== "summary") {
    const next = await dispatch({
      chatId: run.chatId, threadId: out.threadId, messageId: out.reply.id, authorId: agent.id, text: out.reply.text, parent: run,
    });
    await Promise.all(runsWeExecute(next).map((r) => processRun(r.id)));
  }
}

async function executeAs(agent: AgentInfo, run: AgentRun, workspaceId: string) {
  const { dir, store } = currentCtx();
  const ping = (p: { chats: string[]; tickets: boolean; message?: { chatId: string; threadId: string | null; message: unknown } }) =>
    pingChanges({ ...p, runs: true, origin: null, workspaceId });
  await ping({ chats: [], tickets: false });
  const replyId = replyIdFor(run.id);
  const silent = { touchedChats: [] as string[], openTicket: null, deleted: [] as string[] };

  // A retried run (its first worker died) may have replied already: don't do it twice.
  if (run.attempts > 1 && (await store.getMessageRefs([replyId]))[replyId]) {
    await store.finishRun(run.id, { status: "done", result: { touchedChats: [run.chatId], openTicket: null, deleted: [] } });
    await ping({ chats: [run.chatId], tickets: true });
    return null;
  }

  // Proactive (lurk / active): first decide whether this is ours to answer at all.
  const meta = dir.chats[run.chatId];
  if (run.trigger === "proactive") {
    const list = await store.listMessages(run.chatId, { limit: 30 });
    const recent = run.threadId ? (() => { const r = list.find((m) => m.id === run.threadId); return r ? [r, ...r.replies] : []; })() : list;
    const go = await shouldRespond({
      agent, mode: agentModeIn(dir, run.chatId, agent.id) ?? "lurk", dir, recent: recent as Message[], text: run.text,
      chatLabel: meta?.kind === "channel" ? `#${meta.label}` : "a direct message", author: agentName(run.requester),
    }).catch(() => false);
    if (!go) {
      await store.finishRun(run.id, { status: "done", result: silent });
      await ping({ chats: [], tickets: false });
      return null;
    }
  }

  // 👀 on the message while working on it (replaced by the reply).
  await store.react(run.triggerMessageId, "👀", agent.id, true).catch(() => {});
  await ping({ chats: [run.chatId], tickets: false });
  // Speaking up uninvited goes in a thread, so it doesn't take over the channel.
  const threadId = run.threadId ?? (run.trigger === "proactive" ? run.triggerMessageId : null);

  const progress = reporter(workspaceId, { ...run, threadId });
  try {
    const { trace, replyMessage, ...result } = await (run.trigger === "summary" ? runSummary : runAtlasAgent)({
      chatId: run.chatId, text: run.text, threadId, role: run.role, replyId, progress, agent, depth: run.depth,
    });
    // Assigned work: move the ticket on once the agent has posted its result.
    if (run.trigger === "assignment" && !trace.error) result.touchedChats.push(...(await finishAssignment(run, agent, replyMessage?.text ?? "", threadId)));
    await store.finishRun(run.id, { status: "done", result, trace, error: trace.error ?? null });
    await store.react(run.triggerMessageId, "👀", agent.id, false).catch(() => {});
    // The reply rides along, so the chat shows it without refetching.
    await ping({
      chats: result.touchedChats, tickets: true,
      message: replyMessage ? { chatId: run.chatId, threadId, message: replyMessage } : undefined,
    });
    return replyMessage && !trace.error ? { reply: replyMessage, threadId } : null;
  } catch (e) {
    const error = (e as Error).message;
    console.error(`[agent] run ${run.id} (${agent.handle}) failed:`, e);
    // Tell the person instead of leaving them waiting.
    await store
      .appendMessage(run.chatId, { id: replyId, who: agent.id, time: stamp(), text: "Sorry, something went wrong on my side and nothing was changed. Please try again." }, threadId)
      .catch(() => {});
    await store.react(run.triggerMessageId, "👀", agent.id, false).catch(() => {});
    await store.finishRun(run.id, { status: "failed", error, result: { touchedChats: [run.chatId], openTicket: null, deleted: [] } });
    await ping({ chats: [run.chatId], tickets: false });
    return null;
  } finally {
    progress.done();
  }
}

/** Runs that should be running but aren't: never picked up, or their worker died. */
export function dueRuns(runs: AgentRun[], now = Date.now()) {
  return runs.filter(
    (r) =>
      (r.status === "queued" && now - Date.parse(r.createdAt) > RUN_PICKUP_MS) ||
      (r.status === "running" && now - Date.parse(r.startedAt ?? "") > RUN_STALE_MS),
  );
}

/** Start any due runs. Called opportunistically when browsers poll run status. */
export async function sweepRuns(runs?: AgentRun[]): Promise<number> {
  const store = await getStore();
  const due = runsWeExecute(dueRuns(runs ?? (await store.listRecentRuns()))).slice(0, 2);
  for (const r of due) await processRun(r.id);
  return due.length;
}
