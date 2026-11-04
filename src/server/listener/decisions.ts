import "server-only";

import { ApiError, effectiveRole } from "@/lib/api/service";
import { currentCtx } from "@/lib/context";
import { personOf } from "@/lib/directory";
import { uid } from "@/lib/format";
import type { TeamDecision } from "@/lib/team-decisions";
import { pingChanges } from "../realtime";

/** The decision log, as the Decisions page and Atlas see it (chats the person can open only). */
export async function listTeamDecisions(): Promise<TeamDecision[]> {
  const { dir, store } = currentCtx();
  return (await store.listTeamDecisions()).filter((d) => !!dir.chats[d.chatId]);
}

/** Reopen a decision (it stops being enforced) or make it active again. */
export async function setTeamDecisionStatus(id: string, status: "active" | "reopened", role?: string) {
  const { dir, store } = currentCtx();
  if (effectiveRole(role as never) === "guest") throw new ApiError("Guests can't change decisions", 403);
  const d = (await store.listTeamDecisions()).find((x) => x.id === id);
  if (!d || !dir.chats[d.chatId]) throw new ApiError("That decision doesn't exist", 404);
  if (d.status === "superseded") throw new ApiError("A newer decision replaced this one", 409);
  await store.saveTeamDecision({ ...d, status });
  await pingChanges({ chats: [], tickets: false, decisions: true, origin: null, workspaceId: dir.workspace.id });
  return { ...d, status };
}

/** Decisions matching a question (for Atlas's search_decisions tool): simple word overlap, newest first. */
export async function searchTeamDecisions(query: string) {
  const { dir } = currentCtx();
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const all = await listTeamDecisions();
  const scored = all
    .map((d) => {
      const hay = `${d.topic} ${d.statement} ${d.rationale} ${d.rejected.join(" ")}`.toLowerCase();
      return { d, score: words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => !words.length || x.score > 0)
    .sort((a, b) => b.score - a.score || b.d.createdAt.localeCompare(a.d.createdAt))
    .slice(0, 8);
  return scored.map(({ d }) => ({
    id: d.id, topic: d.topic, decided: d.statement, why: d.rationale, rejected: d.rejected, status: d.status,
    when: d.createdAt.slice(0, 10), by: d.deciders.map((p) => personOf(dir, p).name), source_message: d.messageId,
  }));
}

/** A mission decision someone answered becomes part of the team's decision memory too. */
export async function rememberMissionDecision(input: { topic: string; statement: string; rationale: string; chatId: string; threadId: string | null; messageId: string; by: string }) {
  const { store } = currentCtx();
  await store.saveTeamDecision({
    id: `td${uid()}`, topic: input.topic.slice(0, 60), statement: input.statement.slice(0, 300), rationale: input.rationale.slice(0, 300),
    rejected: [], deciders: [input.by], chatId: input.chatId, threadId: input.threadId, messageId: input.messageId, status: "active",
    supersededBy: null, flags: 0, lastFlaggedAt: null, source: "mission", createdAt: new Date().toISOString(),
  });
}
