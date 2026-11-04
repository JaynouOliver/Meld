import "server-only";

import { after } from "next/server";

import { currentCtx, deliverNotices } from "@/lib/context";
import { agentById, agentDmOf, agentModeIn, atlasDmOf, ATLAS_ID, personOf, teamName, type AgentInfo, type Directory } from "@/lib/directory";
import { stamp } from "@/lib/format";
import { mentionNotice, newComments, parseCommentMentions } from "@/lib/agent/comment-mentions";
import type { BlockerNotice } from "@/lib/agent/blockers";
import { MAX_AGENT_DEPTH, RATE_ALL, RATE_WINDOW_MS, type AgentRun } from "@/lib/agent/runs";
import { canSee } from "@/lib/rbac";
import type { Store } from "@/lib/store";
import { layer, servesCtx } from "@/lib/store/layers";
import { MAX_COMMENT_LENGTH } from "@/lib/ticket-fields";
import type { ChatId, PersonId, Ticket, TicketComment } from "@/lib/types";
import { llm } from "../llm";
import { pingChanges } from "../realtime";

/**
 * @mentions in ticket comments. Hooked on the workspace store like assignment pick-up
 * (assignment.ts): every comment, whether typed in the ticket panel (updateTicket), left
 * by an agent (comment_on_ticket → applyOps) or posted for an agent below, ends in
 * store.saveTicket, so one layer covers them all.
 *
 * - People: Atlas tells them in their Atlas DM, once per comment, never for their own.
 * - Agents: a run in the agent's inbox (trigger "mention", id "cmt…") with the ticket and
 *   the comment as the task. The agent answers on the ticket (comment_on_ticket, or Meld
 *   posts its reply as its comment when it can't write: finishCommentReply).
 * Governed like hand-offs: the requester's permissions, depth (an agent's comment wakes
 * others one level deeper, capped), the per-chat rate limit, one run per comment and
 * agent, and an agent's comment never wakes the agent itself.
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

/** Tests: run agents without a model, and capture instead of scheduling. */
export function configureCommentMentions(opts: { enabled?: () => boolean; schedule?: Schedule }) {
  if (opts.enabled) enabled = opts.enabled;
  if (opts.schedule) schedule = opts.schedule;
}

/** At most this many agents woken by one comment. */
const MAX_AGENTS_PER_COMMENT = 3;
const COMMENT_RUN = "cmt";
export const isCommentRun = (run: Pick<AgentRun, "id">) => run.id.startsWith(COMMENT_RUN);

/** The store, plus: new comments that @mention someone notify them or wake the agent. */
export function withCommentMentions(inner: Store): Store {
  const wrapped: Store = {
    ...inner,
    async saveTicket(t) {
      // Cheap check first: only a save whose latest comments contain "@" needs the previous state.
      const maybe = (t.comments ?? []).slice(-5).some((c) => c.text.includes("@"));
      const before = maybe ? await inner.getTicket(t.id) : null;
      await inner.saveTicket(t);
      if (before) await guarded(wrapped, before, t);
    },
  };
  return layer(inner, wrapped);
}

/** Never fails the save that caused it. Only writes made through this request's store count. */
async function guarded(store: Store, before: Ticket, t: Ticket) {
  if (!servesCtx(store, currentCtx().store)) return;
  try {
    await onNewComments(before, t);
  } catch (e) {
    console.error(`[comment-mentions] ${t.id} failed:`, e);
  }
}

export interface MentionOutcome {
  notified: ChatId[];
  runs: AgentRun[];
}

/** Act on the comments `after` gained over `before`. */
export async function onNewComments(before: Ticket | null, t: Ticket): Promise<MentionOutcome> {
  const ctx = currentCtx();
  const out: MentionOutcome = { notified: [], runs: [] };
  for (const c of newComments(before, t)) {
    if (!c.text.includes("@")) continue;
    const m = parseCommentMentions(ctx.dir, c.text, c.who);
    if (m.people.length) out.notified.push(...(await notifyPeople(t, c, m.people)));
    // Meld posting a read-only agent's answer: the chat reply it copies already handed off (queue.ts).
    const copied = !!ctx.run && c.id === commentIdFor(ctx.run.id);
    if (m.agents.length && enabled() && !copied) {
      for (const a of m.agents.slice(0, MAX_AGENTS_PER_COMMENT)) {
        const r = await wakeAgent(t, c, a);
        if (r) out.runs.push(r);
      }
    }
  }
  if (out.notified.length) {
    void pingChanges({ chats: out.notified, tickets: false, origin: null, workspaceId: ctx.dir.workspace.id });
  }
  return out;
}

/** Can this person see the ticket? (Their role from the member list; unknown means the demo: yes.) */
function mayRead(dir: Directory, id: PersonId, t: Ticket) {
  const role = dir.memberships?.find((m) => m.id === id)?.role;
  return !role || canSee({ role, me: id, team: dir.people[id]?.team ?? null }, t);
}

async function notifyPeople(t: Ticket, c: TicketComment, people: PersonId[]): Promise<ChatId[]> {
  const { dir } = currentCtx();
  const notices: BlockerNotice[] = people
    .filter((id) => id !== c.who && dir.people[id] && !agentById(dir, id) && mayRead(dir, id, t))
    .map((to) => ({ to, ticketId: t.id, text: mentionNotice(dir, c.who, t, c.text), fallbackChat: t.watch }));
  if (!notices.length) return [];
  console.log(`[comment-mentions] ${t.id}: told ${notices.map((n) => personOf(dir, n.to).first).join(", ")}`);
  return deliverNotices(notices);
}

/** Small stable hash for idempotency keys (message ids must stay short). */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** The comment Meld posts for a run's answer (stable, so it's posted once). */
const commentIdFor = (runId: string) => `${runId}c`;

/** Where the agent works on it: the ticket's watch thread if it reads that channel, else its DM with the requester. */
async function placeFor(dir: Directory, agent: AgentInfo, t: Ticket): Promise<{ chat: ChatId; thread: string | null }> {
  if (t.watch?.thread && agentModeIn(dir, t.watch.chat, agent.id)) return { chat: t.watch.chat, thread: t.watch.thread };
  const dm = agent.id === ATLAS_ID ? atlasDmOf(dir) : agentDmOf(dir, agent.id);
  if (dm) return { chat: dm, thread: null };
  const { openDm } = await import("../workspace");
  return { chat: (await openDm({ dir, store: currentCtx().store }, agent.id)).id, thread: null };
}

/** Queue the mentioned agent's run on this ticket and comment. Returns it, or null (and why, in the log). */
async function wakeAgent(t: Ticket, c: TicketComment, agentId: PersonId): Promise<AgentRun | null> {
  const ctx = currentCtx();
  const agent = agentById(ctx.dir, agentId);
  if (!agent || agent.kind === "external") return null; // MCP agents read their own inbox; Meld can't answer for them
  if (agent.id === c.who || ctx.scopedTo === agent.id) return null; // never wakes itself
  if (agentById(ctx.dir, ctx.dir.me)) return null; // an MCP agent acting as itself: no person to run for
  const fromAgent = !!agentById(ctx.dir, c.who);
  const depth = fromAgent ? (ctx.run?.depth ?? 0) + 1 : 0;
  if (depth > MAX_AGENT_DEPTH) {
    console.log(`[comment-mentions] ${t.id} → @${agent.handle}: depth ${depth} over the limit, not started`);
    return null;
  }
  // An agent's run sees only its own chats; place it with the requester's full view.
  const dir = ctx.scopedTo ? (await (await import("../workspace")).contextAs(ctx.dir.workspace.id, ctx.dir.me)).dir : ctx.dir;
  const where = await placeFor(dir, agent, t);
  const { store } = ctx;
  if ((await store.countRunsSince(where.chat, new Date(Date.now() - RATE_WINDOW_MS).toISOString())) >= RATE_ALL) {
    console.log(`[comment-mentions] ${t.id} → @${agent.handle}: rate-limited in ${where.chat}, not started`);
    return null;
  }
  const key = `cm${hash(`${t.id}|${c.id}`)}${hash(agent.id)}`;
  const run: AgentRun = {
    // A fresh id: enqueueRun returns the existing run (another id) if this comment already woke this agent.
    id: `${COMMENT_RUN}${key}${Date.now().toString(36)}`, triggerMessageId: key, chatId: where.chat, threadId: where.thread,
    agentId: agent.id, trigger: "mention", depth, parentRunId: ctx.run?.id ?? null,
    // Permissions travel with the work: the person who commented, or who started the agent that did.
    requester: ctx.dir.me, role: ctx.run?.role ?? ctx.dir.role,
    text: commentTask(dir, agent, t, c), status: "queued", attempts: 0, error: null, result: null, trace: null,
    createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
  };
  const queued = await store.enqueueRun(run);
  if (queued.id !== run.id) return null; // this comment already woke it
  void pingChanges({ chats: [], tickets: false, runs: true, origin: null, workspaceId: ctx.dir.workspace.id });
  schedule(queued, ctx.dir.workspace.id);
  console.log(`[comment-mentions] ${t.id} → @${agent.handle} (depth ${depth}) in ${where.chat}`);
  return queued;
}

const writes = (a: AgentInfo) => (a.tools ?? ["read", "write", "delete"]).includes("write");

/** The run's request: the ticket, its recent comments, and the one to answer. */
export function commentTask(dir: Directory, agent: AgentInfo, t: Ticket, c: TicketComment) {
  const author = personOf(dir, c.who);
  const recent = (t.comments ?? []).slice(-6).map((x) => `• ${personOf(dir, x.who).name}: ${x.text.replace(/\s+/g, " ").slice(0, 300)}`);
  const how = writes(agent)
    ? `- Post your answer on the ticket with comment_on_ticket (id ${t.id}), addressed to @${author.first}: a few sentences, or at most five "• " lines, specific to this ticket.
- Then reply here in one short line, e.g. "Replied on ${t.id}."`
    : `- You can't write to tickets, so write your answer as your reply here, addressed to @${author.first}: a few sentences, or at most five "• " lines, specific to this ticket. Meld posts it on ${t.id} as your comment.`;
  return `${author.name} mentioned you in a comment on ticket ${t.id} (comment ${c.id}): "${t.title || "Untitled"}"
${t.status} · ${t.priority} priority · ${teamName(dir, t.team)} · owner ${personOf(dir, t.assignee).name}${(t.labels ?? []).length ? ` · labels ${t.labels!.join(", ")}` : ""}
Description: ${t.description.trim().slice(0, 1200) || "(none)"}

Recent comments, oldest first:
${recent.join("\n")}

The comment to answer, from ${author.name}: "${c.text}"

How to answer:
- Read what you need first: get_ticket, and ticket_discussion for the conversation behind it. If the comment asks for a change your role and tools allow, make it.
${how}
- Only @mention another agent if you really need its help.`;
}

const refOfTask = (text: string) => {
  const m = /comment on ticket (\S+) \(comment ([^)]+)\)/.exec(text);
  return m ? { ticketId: m[1], commentId: m[2] } : null;
};

/**
 * After the agent's reply: if it didn't answer on the ticket itself (read-only agents
 * can't), post its reply there as its comment. Idempotent (the comment id comes from the run).
 */
export async function finishCommentReply(run: AgentRun, agent: AgentInfo, reply: string): Promise<boolean> {
  const ref = refOfTask(run.text);
  const { store } = currentCtx();
  const t = ref ? await store.getTicket(ref.ticketId) : null;
  if (!ref || !t) return false;
  const comments = t.comments ?? [];
  const from = comments.findIndex((x) => x.id === ref.commentId);
  if (comments.slice(from + 1).some((x) => x.who === agent.id) || comments.some((x) => x.id === commentIdFor(run.id))) return false;
  const text = reply
    .split("\n")
    .filter((l) => !/^\s*replied on \S+?\.?\s*$/i.test(l))
    .join("\n")
    .replace(/\s*\[\[cite:[^\]]+\]\]/g, "")
    .trim()
    .slice(0, MAX_COMMENT_LENGTH);
  if (!text) return false;
  t.comments = [...comments, { id: commentIdFor(run.id), who: agent.id, text, time: stamp() }];
  t.updated = "Just now";
  await store.saveTicket(t);
  return true;
}
