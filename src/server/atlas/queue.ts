import "server-only";

import { ATLAS_ID } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import { currentCtx } from "@/lib/context";
import { getStore } from "@/lib/store";
import { replyIdFor, RUN_PICKUP_MS, RUN_STALE_MS, type AgentRun } from "@/lib/agent/runs";
import type { AskAtlasInput } from "@/lib/api/service";
import { runInCtx } from "../context";
import { pingChanges } from "../realtime";
import { contextAs } from "../workspace";
import { runAtlasAgent } from "./run";

/**
 * The agent queue (docs/architecture.md §4). A run is a row in agent_runs:
 * enqueue → claim (atomic) → run the agent → finish. Runs normally start right after
 * the request that enqueued them (Next's after()); sweepRuns() picks up any that were
 * missed or whose worker died.
 */
export async function enqueueAtlas(input: AskAtlasInput & { triggerMessageId: string }): Promise<AgentRun> {
  const store = await getStore();
  return store.enqueueRun({
    id: `run${uid()}`, triggerMessageId: input.triggerMessageId, chatId: input.chatId,
    threadId: input.threadId ?? null, requester: currentCtx().dir.me, role: input.role, text: input.text,
    status: "queued", attempts: 0, error: null, result: null, trace: null,
    createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
  });
}

/** Execute one run if we can claim it. Safe to call more than once for the same run. */
export async function processRun(id: string): Promise<void> {
  const store = await getStore();
  const run = await store.claimRun(id);
  if (!run) return; // someone else has it, or it's finished
  // Run as the person who asked (the sweep may be triggered by someone else's browser).
  const workspaceId = currentCtx().dir.workspace.id;
  const ctx = currentCtx().dir.me === run.requester ? currentCtx() : await contextAs(workspaceId, run.requester);
  await runInCtx(ctx, () => execute(run, workspaceId));
}

async function execute(run: AgentRun, workspaceId: string) {
  const store = await getStore();
  const ping = (p: { chats: string[]; tickets: boolean }) => pingChanges({ ...p, runs: true, origin: null, workspaceId });
  await ping({ chats: [], tickets: false });
  const replyId = replyIdFor(run.id);

  // A retried run (its first worker died) may have replied already: don't do it twice.
  if (run.attempts > 1 && (await store.getMessageRefs([replyId]))[replyId]) {
    await store.finishRun(run.id, { status: "done", result: { touchedChats: [run.chatId], openTicket: null, deleted: [] } });
    await ping({ chats: [run.chatId], tickets: true });
    return;
  }

  try {
    const { trace, ...result } = await runAtlasAgent({
      chatId: run.chatId, text: run.text, threadId: run.threadId, role: run.role, replyId,
    });
    await store.finishRun(run.id, { status: "done", result, trace, error: trace.error ?? null });
    await ping({ chats: result.touchedChats, tickets: true });
  } catch (e) {
    const error = (e as Error).message;
    console.error(`[atlas] run ${run.id} failed:`, e);
    // Tell the person instead of leaving them waiting.
    await store
      .appendMessage(run.chatId, { id: replyId, who: ATLAS_ID, time: stamp(), text: "Sorry, something went wrong on my side and nothing was changed. Please try again." }, run.threadId)
      .catch(() => {});
    await store.finishRun(run.id, { status: "failed", error, result: { touchedChats: [run.chatId], openTicket: null, deleted: [] } });
    await ping({ chats: [run.chatId], tickets: false });
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
  const due = dueRuns(runs ?? (await store.listRecentRuns())).slice(0, 2);
  for (const r of due) await processRun(r.id);
  return due.length;
}
