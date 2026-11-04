import "server-only";

import { currentCtx } from "@/lib/context";
import { agentById, ATLAS_ID, personOf } from "@/lib/directory";
import { uid } from "@/lib/format";
import { cleanFact, memoryLines, TEAM_MEMORY, type AgentMemory } from "@/lib/agent/memory";
import { ApiError, effectiveRole } from "@/lib/api/service";
import type { Role } from "@/lib/types";

/**
 * Persistent agent memory (src/lib/agent/memory.ts). Agents write it with remember() and
 * forget(); people see and prune it in the agent's dialog. Everyone in the workspace can
 * read it; guests can't change it.
 */

/** The agent doing the work right now: the one whose run this is, else Atlas. */
export const runningAgentId = () => currentCtx().scopedTo ?? ATLAS_ID;

/** An agent's memories and the team's, newest first. */
export async function listAgentMemories(agentId: string): Promise<AgentMemory[]> {
  const { dir, store } = currentCtx();
  if (agentId !== TEAM_MEMORY && !agentById(dir, agentId)) throw new ApiError("No such agent", 404);
  return (await store.listAgentMemories()).filter((m) => m.agentId === agentId || m.agentId === TEAM_MEMORY);
}

export async function rememberFact(input: { text: unknown; forTeam?: boolean; agentId?: string; role?: Role }): Promise<AgentMemory> {
  const { dir, store } = currentCtx();
  if (effectiveRole(input.role) === "guest") throw new ApiError("Guests can't add to an agent's memory", 403);
  const text = cleanFact(input.text);
  if (!text) throw new ApiError("Say what to remember in a few words");
  const agentId = input.forTeam ? TEAM_MEMORY : (input.agentId ?? runningAgentId());
  if (agentId !== TEAM_MEMORY && !agentById(dir, agentId)) throw new ApiError("No such agent", 404);
  // The same fact twice is one memory.
  const existing = (await store.listAgentMemories()).find((m) => m.agentId === agentId && m.text.toLowerCase() === text.toLowerCase());
  if (existing) return existing;
  const m: AgentMemory = { id: `mem${uid()}`, agentId, text, createdBy: dir.me, createdAt: new Date().toISOString() };
  await store.addAgentMemory(m);
  return m;
}

export async function forgetMemory(id: string, role?: Role): Promise<{ ok: true }> {
  const { store } = currentCtx();
  if (effectiveRole(role) === "guest") throw new ApiError("Guests can't change an agent's memory", 403);
  if (!(await store.deleteAgentMemory(String(id ?? "")))) throw new ApiError("That memory is already gone", 404);
  return { ok: true };
}

/** What this agent remembers, for its prompt (empty when nothing). */
export async function memoryBlock(agentId: string): Promise<string> {
  const { dir, store } = currentCtx();
  const lines = memoryLines(await store.listAgentMemories().catch(() => []), agentId, (id) => personOf(dir, id).name);
  if (!lines.length) return "";
  return `<memory>
What you remember from earlier conversations (newest first). Take these into account when they're relevant; forget(id) removes one that's no longer true:
${lines.join("\n")}
</memory>`;
}
