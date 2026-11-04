import type { PersonId } from "../types";

/**
 * Agent memory: short facts people ask an agent to keep ("Maya is out on Fridays"). Each
 * belongs to one agent, or to the whole team (every agent reads those). The latest ones
 * go into the agent's prompt on every run, so they carry across conversations.
 */
export interface AgentMemory {
  id: string;
  /** The agent that keeps it, or TEAM_MEMORY for facts every agent should know. */
  agentId: PersonId | typeof TEAM_MEMORY;
  text: string;
  createdBy: PersonId;
  createdAt: string;
}

export const TEAM_MEMORY = "team";
/** How many memories an agent's prompt carries (newest first). */
export const MEMORIES_IN_PROMPT = 30;
export const MEMORY_MAX_CHARS = 280;

/** A fact worth keeping: one line, trimmed, bounded. Null when there's nothing to keep. */
export function cleanFact(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, MEMORY_MAX_CHARS);
  return text.length >= 3 ? text : null;
}

/** What an agent remembers, for its prompt: its own and the team's, newest first, compact. */
export function memoryLines(all: AgentMemory[], agentId: PersonId, nameOf: (id: PersonId) => string): string[] {
  return all
    .filter((m) => m.agentId === agentId || m.agentId === TEAM_MEMORY)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MEMORIES_IN_PROMPT)
    .map((m) => `[${m.id}] ${m.text} (${m.agentId === TEAM_MEMORY ? "team" : "yours"}, from ${nameOf(m.createdBy)}, ${m.createdAt.slice(0, 10)})`);
}
