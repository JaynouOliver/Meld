import "server-only";

import { summarize, toView, type ActionRecord, type TicketOp } from "@/lib/agent/actions";
import { currentCtx } from "@/lib/context";
import { agentById, agentModeIn, atlasDmOf, ATLAS_ID, personOf, teamName } from "@/lib/directory";
import { stamp } from "@/lib/format";
import { OVERLOAD_OPEN, suggestOwner } from "@/lib/proactive";
import type { ChatId, Ticket } from "@/lib/types";
import { pingChanges } from "../realtime";

/**
 * Workload balancer. When a ticket is assigned to a person who is overloaded (OVERLOAD_OPEN
 * open tickets) or out on its due date (a team memory like "Priya is out on Monday"),
 * Atlas suggests the teammate with the fewest open tickets as a confirm card: one click
 * reassigns it, with Undo. Rules are in src/lib/proactive.ts (suggestOwner). Called from
 * the store wrapper that detects assignments (src/server/agents/assignment.ts), so every
 * path that assigns (ticket panel, Atlas, listener, MCP) is covered. No model call.
 *
 * Never twice for the same ticket and person: the action id comes from the pair, so a
 * repeated save, a confirm racing a save, or undoing the reassignment doesn't ask again.
 */

let enabled = () => true;
/** Tests: turn the balancer off (or on). */
export function configureWorkload(opts: { enabled?: () => boolean }) {
  if (opts.enabled) enabled = opts.enabled;
}
export const workloadEnabled = () => enabled();

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
/** Stable per workspace, ticket and person (agent action ids are unique across all workspaces). */
export const suggestionId = (workspaceId: string, ticketId: string, assignee: string) =>
  `wl${hash(`${workspaceId}|${ticketId}|${assignee}`)}${hash(`${workspaceId}|${ticketId}`)}`;

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** A ticket just got a (new) human assignee: suggest someone else if they're overloaded or out. */
export async function balanceAssignment(before: Ticket | null, t: Ticket): Promise<ActionRecord | null> {
  if (!enabled()) return null;
  const ctx = currentCtx();
  const { dir, store } = ctx;
  if (before && before.assignee === t.assignee) return null;
  const assignee = dir.people[t.assignee];
  if (!assignee || assignee.isAgent) return null;
  // Taking it yourself is your call; an external agent (MCP) has no one to ask; a custom agent's run sees only its chats.
  if (t.assignee === dir.me || agentById(dir, dir.me) || (ctx.scopedTo && ctx.scopedTo !== ATLAS_ID)) return null;
  const id = suggestionId(currentCtx().dir.workspace.id, t.id, t.assignee);
  if (await store.getAction(id)) return null;

  const [tickets, memories] = await Promise.all([store.listTickets(), store.listAgentMemories()]);
  const people = Object.values(dir.people).filter((p) => dir.roles?.[p.id] !== "guest");
  const s = suggestOwner(t, { tickets, people, memories, previous: before?.assignee ?? null });
  if (!s) return null;

  // Where: the ticket's watch thread if Atlas reads that channel, else the assigner's Atlas DM.
  const where: { chat: ChatId; thread: string | null } | null =
    t.watch && agentModeIn(dir, t.watch.chat, ATLAS_ID) ? { chat: t.watch.chat, thread: t.watch.thread } : atlasDmOf(dir) ? { chat: atlasDmOf(dir)!, thread: null } : null;
  if (!where) return null;

  const to = personOf(dir, s.to);
  const after: Ticket = { ...structuredClone(t), assignee: s.to };
  const op: TicketOp = { type: "update", before: structuredClone(t), after, changes: [`assignee → ${to.name}`] };
  const replyId = `${id}m`;
  const action: ActionRecord = {
    id, chatId: where.chat, messageId: replyId, status: "pending", ops: [op], summary: summarize([op]), destructive: false, undoUntil: null,
    createdAt: new Date().toISOString(),
  };
  try {
    await store.insertAction(action);
  } catch {
    return null; // another request suggested it a moment ago
  }
  const why = [
    s.reason.open >= OVERLOAD_OPEN ? `${assignee.first} now has ${s.reason.open} open tickets` : null,
    s.reason.out && t.due ? `${s.reason.open >= OVERLOAD_OPEN ? "and is" : `${assignee.first} is`} out on ${fmtDay(t.due)}, the due date ("${s.reason.out.replace(/[.\s]+$/, "")}")` : null,
  ].filter(Boolean);
  const text = `${why.join(" ")}. ${to.first} has ${s.toOpen} open on ${teamName(dir, to.team)}. Reassign ${t.id} to ${to.first}?`;
  const saved = await store.appendMessage(where.chat, { id: replyId, who: ATLAS_ID, time: stamp(), text, ticket: t.id, actionId: id }, where.thread);
  await pingChanges({
    chats: [where.chat], tickets: false, origin: null, workspaceId: dir.workspace.id,
    message: { chatId: where.chat, threadId: where.thread, message: { ...saved, actionId: undefined, action: toView(action) } },
  });
  console.log(`[workload] ${t.id} → ${assignee.first}: suggested ${to.first} in ${where.chat}`);
  return action;
}
