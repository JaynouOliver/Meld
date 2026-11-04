import "server-only";

import { applyOps, summarize, toView, UNDO_WINDOW_MS, permissionProblem, type ActionRecord, type TicketOp } from "@/lib/agent/actions";
import { createsCycle } from "@/lib/agent/blockers";
import { currentCtx } from "@/lib/context";
import { agentById, agentModeIn, ATLAS_ID, mentionedAgents, personOf } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import { mayAsk } from "@/lib/proactive";
import { viewerOf } from "@/lib/rbac";
import type { TeamDecision } from "@/lib/team-decisions";
import type { ChatId, PersonId, Role, Ticket } from "@/lib/types";
import { llm } from "../llm";
import { pingChanges } from "../realtime";
import { trackQuestion } from "../proactive/followups";
import { claimLink, relatedCandidate } from "../proactive/links";
import { analyze, type Analysis } from "./analyze";
import { mayMatter } from "./prefilter";

/**
 * The listener (docs/agent-platform.md): after a person's message is saved and the
 * response sent, Atlas reads it once and, when it matters,
 * - logs a decision the conversation just settled (📌, plus the why and what was rejected),
 * - points out when a message goes against a decision already made,
 * - keeps the speaker's tickets true from what they said (done, in review, blocked, new date),
 * - turns "I'll do X by Thursday" into a dated ticket.
 * Ticket changes are applied with Undo, as the speaker (their role). At most one reply,
 * in the message's thread. Silent for everything else.
 */
export interface Heard {
  chatId: ChatId;
  threadId: string | null;
  messageId: string;
  authorId: PersonId;
  text: string;
  role: Role;
}

const fmtDay = (d: string) =>
  new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Worth a look at all? Cheap checks before any model call. */
export function shouldListen(m: Heard): boolean {
  const { dir } = currentCtx();
  if (!llm() || agentById(dir, m.authorId)) return false;
  if (m.text.trim().length < 12) return false;
  // Asked an agent directly: that agent handles it.
  if (mentionedAgents(dir, m.text).length) return false;
  const meta = dir.chats[m.chatId];
  if (!meta) return false;
  if (meta.kind === "channel") return agentModeIn(dir, m.chatId, ATLAS_ID) !== null;
  // DMs between people: Atlas isn't in them. DMs with an agent: that agent answers.
  return false;
}

export async function listen(m: Heard) {
  if (!shouldListen(m)) return;
  const started = Date.now();
  const { dir, store } = currentCtx();
  // Free check first: most chat ("sounds good", "lunch?") can't change anything.
  // Also free: a question to someone, or a conversation in another channel on the same topic.
  const [decisions, related] = await Promise.all([store.listTeamDecisions(), relatedCandidate(m).catch(() => null)]);
  if (!mayMatter(m.text, decisions, dir.workspace.ticketPrefix) && !mayAsk(m.text) && !related) {
    console.log(`[listener] ${dir.workspace.id}/${m.chatId} skipped (prefilter) ${Date.now() - started}ms`);
    return;
  }
  const [messages, tickets] = await Promise.all([store.listMessages(m.chatId, { limit: 30 }), store.listTickets()]);

  // The conversation it belongs to: the thread, or the channel's recent messages.
  const root = m.threadId ? messages.find((x) => x.id === m.threadId) : null;
  const context = (root ? [root, ...root.replies] : messages.slice(-10)).filter((x) => x.id !== m.messageId).slice(-14);
  const a = await analyze({ chatId: m.chatId, threadId: m.threadId, text: m.text, author: m.authorId, context, tickets, decisions, related });
  if (a.question) await trackQuestion(m, a.question).catch((e) => console.error("[listener] question not tracked:", e));
  await respond(m, a, { context, tickets, decisions });
  console.log(
    `[listener] ${dir.workspace.id}/${m.chatId} decision=${!!a.decision} conflict=${!!a.conflict} updates=${a.updates.length} commitment=${!!a.commitment} question=${!!a.question} related=${related ? (a.related ? "linked" : "no") : "-"} ${Date.now() - started}ms`,
  );
}

/** Act on an analysis: log, flag, update, track; then one reply in the thread. */
export async function respond(
  m: Heard,
  a: Analysis,
  data: { context: { who: PersonId }[]; tickets: Ticket[]; decisions: TeamDecision[] },
): Promise<{ replyId: string | null }> {
  const { dir, store } = currentCtx();
  const { context, tickets, decisions } = data;
  if (!a.decision && !a.conflict && !a.updates.length && !a.commitment && !a.related) return { replyId: null };

  const lines: string[] = [];
  const replyThread = m.threadId ?? m.messageId;
  const replyId = uid();
  let decisionsChanged = false;

  // 1. A decision was just made: remember it, with the why.
  if (a.decision) {
    const humans = [...new Set([...context.map((x) => x.who), m.authorId])].filter((id) => !personOf(dir, id).isAgent).slice(-6);
    const d: TeamDecision = {
      id: `td${uid()}`, topic: a.decision.topic, statement: a.decision.statement, rationale: a.decision.rationale, rejected: a.decision.rejected,
      deciders: humans, chatId: m.chatId, threadId: m.threadId, messageId: m.messageId, status: "active", supersededBy: null,
      flags: 0, lastFlaggedAt: null, source: "chat", createdAt: new Date().toISOString(),
    };
    await store.saveTeamDecision(d);
    const old = a.decision.replaces ? decisions.find((x) => x.id === a.decision!.replaces) : null;
    if (old) await store.saveTeamDecision({ ...old, status: "superseded", supersededBy: d.id });
    await store.react(m.messageId, "📌", ATLAS_ID, true).catch(() => {});
    lines.push(
      `📌 Logged as a decision: ${d.statement}` +
        (old ? ` This replaces the ${fmtDay(old.createdAt)} decision ("${old.statement}").` : "") +
        ` I'll point people back to it if it comes up again.`,
    );
    decisionsChanged = true;
  }

  // 2. Going against a decision already made: say so once, with the reason and the source.
  if (a.conflict) {
    const d = decisions.find((x) => x.id === a.conflict!.decisionId)!;
    const sameConversation = d.messageId === m.messageId || (d.threadId && d.threadId === replyThread) || d.messageId === replyThread;
    if (!sameConversation) {
      const who = d.deciders.map((p) => personOf(dir, p).first).join(", ");
      lines.push(
        `Heads-up: the team already decided this on ${fmtDay(d.createdAt)}${who ? ` (${who})` : ""}: ${d.statement}` +
          (d.rationale ? ` Why: ${d.rationale}` : "") +
          ` [[cite:${d.chatId}:${d.threadId ?? "-"}:${d.messageId}]]` +
          `\nIf that's changed, say what you're deciding now and I'll log the new decision.`,
      );
      await store.saveTeamDecision({ ...d, flags: d.flags + 1, lastFlaggedAt: new Date().toISOString() });
      decisionsChanged = true;
    }
  }

  // 3 + 4. Keep the speaker's tickets true, and track new commitments, as one undoable action.
  const ops: TicketOp[] = [];
  for (const u of a.updates) {
    const t = tickets.find((x) => x.id === u.ticketId);
    if (!t) continue;
    const after: Ticket = structuredClone(t);
    const changes: string[] = [];
    if (u.status && u.status !== t.status) {
      after.status = u.status;
      changes.push(`${t.status} → ${u.status}`);
    }
    if (u.blockedBy && !(t.blockedBy ?? []).includes(u.blockedBy) && !createsCycle(t.id, u.blockedBy, tickets)) {
      after.blockedBy = [...(t.blockedBy ?? []), u.blockedBy];
      changes.push(`blocked by ${u.blockedBy}`);
    }
    if (u.due && u.due !== (t.due ?? null)) {
      after.due = u.due;
      changes.push(`due ${fmtDay(u.due)}`);
    }
    if (changes.length) ops.push({ type: "update", before: t, after, changes });
  }
  if (a.commitment) {
    const me = personOf(dir, m.authorId);
    const id = await store.nextTicketId();
    const ticket: Ticket = {
      id, team: me.team ?? dir.teams[0]?.id ?? "general", title: a.commitment.title,
      description: `${me.name} committed to this in chat: "${m.text.slice(0, 280)}"`,
      status: "To do", priority: "Medium", assignee: m.authorId, reporter: ATLAS_ID, links: [], images: [], updated: "Just now",
      watch: { chat: m.chatId, thread: replyThread }, blockedBy: [], due: a.commitment.due,
      activity: [{ who: "Atlas", text: `created this from ${me.first}'s message`, time: stamp() }],
    };
    ops.push({ type: "create", after: ticket });
  }

  let action: ActionRecord | null = null;
  const touched = new Set<ChatId>([m.chatId]);
  if (ops.length && !permissionProblem(ops, viewerOf(dir, m.role))) {
    for (const c of await applyOps(store, ops, m.chatId)) touched.add(c);
    action = {
      id: `act${uid()}`, chatId: m.chatId, messageId: null, status: "applied", ops, summary: summarize(ops), destructive: false,
      undoUntil: new Date(Date.now() + UNDO_WINDOW_MS).toISOString(), createdAt: new Date().toISOString(),
    };
    for (const o of ops) {
      if (o.type === "update") lines.push(`Updated ${o.after.id} from your message: ${o.changes.join(", ")}.`);
      else if (o.type === "create")
        lines.push(`Tracking it: ${o.after.id} "${o.after.title}" for ${personOf(dir, o.after.assignee).first}${o.after.due ? `, due ${fmtDay(o.after.due)}` : ""}.`);
    }
  }
  // 5. The same topic is being discussed in another channel: link it (once per pair).
  if (a.related) {
    const link = await claimLink(m, a.related, replyId);
    if (link) lines.push(link);
  }
  if (!lines.length) return { replyId: null };

  if (action) {
    action.messageId = replyId;
    await store.insertAction(action);
  }
  const card = ops.length === 1 && action ? (ops[0].type === "create" ? ops[0].after.id : ops[0].type === "update" ? ops[0].after.id : null) : null;
  const saved = await store.appendMessage(m.chatId, { id: replyId, who: ATLAS_ID, time: stamp(), text: lines.join("\n"), ticket: card, actionId: action?.id ?? null }, replyThread);
  await pingChanges({
    chats: [...touched], tickets: !!action, decisions: decisionsChanged, origin: null, workspaceId: dir.workspace.id,
    message: { chatId: m.chatId, threadId: replyThread, message: action ? { ...saved, actionId: undefined, action: toView(action) } : saved },
  });
  return { replyId };
}
