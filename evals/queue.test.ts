/**
 * Agent queue invariants (no model calls): npm run test:queue
 * One run per trigger message, one claimer per run, stale runs retried up to the
 * attempt limit, and the sweep picks up only runs that are overdue.
 */
import assert from "node:assert/strict";

import { RUN_MAX_ATTEMPTS, RUN_PICKUP_MS, RUN_STALE_MS, type AgentRun } from "../src/lib/agent/runs";
import { getStore } from "../src/lib/store";
import { dbFor } from "../src/lib/mock/db";
import { DEMO_WORKSPACE_ID } from "../src/lib/mock/demo";
import { dueRuns } from "../src/server/atlas/queue";

const run = (id: string, trigger: string): AgentRun => ({
  id, triggerMessageId: trigger, chatId: "design", threadId: null, agentId: "atlas", trigger: "mention", depth: 0, parentRunId: null, requester: "me", role: "owner", text: "@Atlas hi",
  status: "queued", attempts: 0, error: null, result: null, trace: null,
  createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
});

async function main() {
  const store = await getStore();
  assert.equal(store.kind, "memory");
  await store.reset();

  // Idempotent enqueue: the same message never makes two runs.
  const a = await store.enqueueRun(run("runA", "msg1"));
  const again = await store.enqueueRun(run("runB", "msg1"));
  assert.equal(again.id, a.id);
  assert.equal((await store.listRecentRuns()).length, 1);

  // Only one claimer wins.
  const [c1, c2] = await Promise.all([store.claimRun("runA"), store.claimRun("runA")]);
  assert.equal([c1, c2].filter(Boolean).length, 1);
  assert.equal((c1 ?? c2)!.attempts, 1);

  // A live running run isn't due; a stale one is, and can be re-claimed up to the limit.
  const now = Date.now();
  const listed = await store.listRecentRuns();
  assert.equal(dueRuns(listed, now).length, 0);
  assert.equal(dueRuns(listed, now + RUN_STALE_MS + 1000).length, 1);

  // Finished runs stay listed briefly (so pollers see them finish), then aren't due.
  await store.finishRun("runA", { status: "done", result: { touchedChats: ["design"], openTicket: null, deleted: [] } });
  assert.equal(await store.claimRun("runA"), null, "finished runs can't be claimed");
  const done = (await store.listRecentRuns()).find((r) => r.id === "runA");
  assert.equal(done?.status, "done");
  assert.equal(dueRuns([done!], now + RUN_STALE_MS * 2).length, 0);

  // Queued runs become due after the pickup delay.
  await store.enqueueRun(run("runC", "msg2"));
  const queued = (await store.listRecentRuns()).filter((r) => r.id === "runC");
  assert.equal(dueRuns(queued, now).length, 0);
  assert.equal(dueRuns(queued, now + RUN_PICKUP_MS + 1000).length, 1);

  // Attempt limit: after RUN_MAX_ATTEMPTS claims, a dead run is left alone.
  let claims = 0;
  for (let i = 0; i < RUN_MAX_ATTEMPTS + 2; i++) {
    const c = await store.claimRun("runC");
    if (c) claims++;
    // Simulate its worker dying: make the run look stale.
    const r = dbFor(DEMO_WORKSPACE_ID).runs.get("runC")!;
    r.startedAt = new Date(Date.now() - RUN_STALE_MS - 1000).toISOString();
  }
  assert.equal(claims, RUN_MAX_ATTEMPTS);

  // Threads are flat: a reply always lands at the thread's top level.
  const reply = await store.appendMessage("design", { id: "flat1", who: "me", time: new Date().toISOString(), text: "reply" }, "m2");
  assert.ok(!("replies" in reply));
  const thread = (await store.listMessages("design")).find((m) => m.id === "m2")!;
  assert.equal(thread.replies.at(-1)?.id, "flat1");
  assert.ok(thread.replies.every((r) => !("kids" in r)));

  console.log("queue: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
