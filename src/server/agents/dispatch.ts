import "server-only";

import { currentCtx } from "@/lib/context";
import { agentById, agentModeIn, agentsOf, ATLAS_ID, mentionedAgents, personOf, type Directory } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import { MAX_AGENT_DEPTH, RATE_ALL, RATE_PROACTIVE, RATE_WINDOW_MS, type AgentRun, type RunTrigger } from "@/lib/agent/runs";
import type { ChatId, PersonId, Role } from "@/lib/types";

/**
 * Who should look at a new message (docs/agent-platform.md, "Flows"):
 * - agents @mentioned there that can read the chat,
 * - the agent in a DM,
 * - for messages from people, channel agents in lurk / active mode (a cheap triage
 *   decides later whether they actually speak).
 * Agent-written messages only wake agents they @mention, one level deeper each time,
 * and never the author itself. Each candidate becomes a run in that agent's inbox.
 */
export interface NewMessage {
  chatId: ChatId;
  threadId: string | null;
  messageId: string;
  authorId: PersonId;
  text: string;
  /** For agent-written messages: the run that wrote it (its depth, requester and role carry over). */
  parent?: Pick<AgentRun, "id" | "depth" | "requester" | "role" | "triggerMessageId"> | null;
  /** For messages from people: their role (already clamped). */
  role?: Role;
}

/** Messages worth a lurking agent's attention: questions, errors, blockers, asks for help. */
const LURK_HINT = /\?|\b(error|bug|broken|fail(ed|ing|s)?|crash(ed|es)?|blocked|blocker|stuck|help|anyone know|how do|outage|down|regression|incident)\b/i;

export async function dispatch(msg: NewMessage): Promise<AgentRun[]> {
  const { dir, store } = currentCtx();
  const meta = dir.chats[msg.chatId];
  if (!meta) return [];
  const fromAgent = !!agentById(dir, msg.authorId);
  const depth = fromAgent ? (msg.parent?.depth ?? 0) + 1 : 0;
  if (fromAgent && depth > MAX_AGENT_DEPTH) return [];

  const picks = new Map<PersonId, RunTrigger>();
  for (const id of mentionedAgents(dir, msg.text)) {
    if (id === msg.authorId) continue;
    if (agentModeIn(dir, msg.chatId, id)) picks.set(id, fromAgent ? "delegation" : "mention");
    else if (!fromAgent) await notInChannel(id, msg);
  }
  if (meta.kind === "dm" && agentById(dir, meta.who) && meta.who !== msg.authorId && !picks.has(meta.who)) {
    picks.set(meta.who, fromAgent ? "delegation" : "dm");
  }
  if (!fromAgent && meta.kind === "channel") {
    for (const a of meta.agents ?? []) {
      if (picks.has(a.id) || a.id === msg.authorId) continue;
      if (a.mode === "active" || (a.mode === "lurk" && LURK_HINT.test(msg.text))) picks.set(a.id, "proactive");
    }
  }
  // A hand-off to an agent that the same person's message already asked would make it
  // answer twice ("@triage file it and ask @reviewer"): skip it.
  if (fromAgent && picks.size && msg.parent?.triggerMessageId) {
    const recentRuns = await store.listRecentRuns();
    for (const id of [...picks.keys()]) {
      if (recentRuns.some((r) => r.agentId === id && r.triggerMessageId === msg.parent!.triggerMessageId)) picks.delete(id);
    }
  }
  if (!picks.size) return [];

  // Rate limit per chat: proactive checks give way first, then everything.
  const recent = await store.countRunsSince(msg.chatId, new Date(Date.now() - RATE_WINDOW_MS).toISOString());
  const out: AgentRun[] = [];
  let n = recent;
  for (const [agentId, trigger] of picks) {
    if (n >= RATE_ALL || (trigger === "proactive" && n >= RATE_PROACTIVE)) continue;
    n++;
    out.push(
      await store.enqueueRun({
        id: `run${uid()}`, triggerMessageId: msg.messageId, chatId: msg.chatId, threadId: msg.threadId,
        agentId, trigger, depth, parentRunId: msg.parent?.id ?? null,
        // Permissions travel with the work: a hand-off acts for the person who started it.
        requester: msg.parent?.requester ?? msg.authorId, role: msg.parent?.role ?? msg.role ?? "member",
        text: msg.text, status: "queued", attempts: 0, error: null, result: null, trace: null,
        createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
      }),
    );
  }
  return out;
}

/** Tagged in a channel it can't read: say so (it doesn't read the channel to do it). */
async function notInChannel(agentId: PersonId, msg: NewMessage) {
  const { dir, store } = currentCtx();
  const meta = dir.chats[msg.chatId];
  if (!meta || meta.kind !== "channel") return;
  const a = agentById(dir, agentId)!;
  const text =
    a.id === ATLAS_ID
      ? `I've been removed from #${meta.label}. Add me back in the channel settings to bring me in.`
      : `I'm not in #${meta.label}, so I can't read it. Add @${a.handle} in the channel settings (gear icon) to bring me in.`;
  await store.appendMessage(msg.chatId, { id: uid(), who: agentId, time: stamp(), text }, msg.threadId);
}

/** Agents (besides `self`) this agent may hand work to, for its prompt. */
export function teammatesFor(self: PersonId) {
  const { dir } = currentCtx();
  return agentsOf(dir)
    .filter((a) => a.id !== self)
    .map((a) => `@${a.handle}: ${a.name}${a.description ? `, ${a.description}` : ""}`);
}

export const agentName = (id: PersonId) => personOf(currentCtx().dir, id).name;

/** The directory as an agent may see it: channels it's in, and its own DM. */
export function scopeFor(dir: Directory, agentId: PersonId): Directory {
  const chats = Object.fromEntries(Object.entries(dir.chats).filter(([id]) => agentModeIn(dir, id, agentId) !== null));
  return { ...dir, chats, channels: dir.channels.filter((c) => chats[c]), dms: dir.dms.filter((c) => chats[c]) };
}

/**
 * Runs Meld executes itself. External agents (MCP) pull their runs from their inbox
 * instead, so those stay queued until the agent picks them up.
 */
export function runsWeExecute<T extends { agentId: PersonId }>(runs: T[]): T[] {
  const { dir } = currentCtx();
  return runs.filter((r) => agentById(dir, r.agentId)?.kind !== "external");
}
