import "server-only";

import { ApiError, effectiveRole } from "@/lib/api/service";
import { RATE_ALL, RATE_WINDOW_MS } from "@/lib/agent/runs";
import { currentCtx } from "@/lib/context";
import { agentModeIn, ATLAS_ID } from "@/lib/directory";
import { stamp } from "@/lib/format";
import {
  answers, FOLLOW_UP_AFTER_MS, FOLLOW_UPS_PER_SWEEP, followUpText, isDue, SWEEP_EVERY_MS, threadOf, type OpenQuestion,
} from "@/lib/proactive";
import type { ChatId, Message, PersonId, Role } from "@/lib/types";
import { pingChanges } from "../realtime";

/**
 * Follow-ups on unanswered questions. The listener's one model call also says when a
 * message is a direct question to a teammate (or the channel); it's tracked here. Each
 * person's next message checks whether it answers one (free). Questions still open after
 * FOLLOW_UP_AFTER_MS get one gentle follow-up from Atlas in their thread, posted by a
 * lazy sweep (after() on posted messages, at most once a minute per workspace) or when
 * someone clicks "Check follow-ups now". The open -> followed_up move is atomic, so
 * however many sweeps race, a question is followed up at most once.
 */

const isPerson = (people: Record<PersonId, { isAgent?: boolean }>) => (id: PersonId) => !!people[id] && !people[id].isAgent;

/** Start tracking a question the listener heard. One per message. */
export async function trackQuestion(
  m: { chatId: ChatId; threadId: string | null; messageId: string; authorId: PersonId },
  q: { addressee: PersonId | null; summary: string },
  now = Date.now(),
): Promise<OpenQuestion> {
  const question: OpenQuestion = {
    id: `oq${m.messageId}`, chatId: m.chatId, threadId: m.threadId, messageId: m.messageId, asker: m.authorId, addressee: q.addressee,
    summary: q.summary, status: "open", askedAt: new Date(now).toISOString(), dueAt: new Date(now + FOLLOW_UP_AFTER_MS).toISOString(),
    followUpId: null, resolvedAt: null, resolvedBy: null,
  };
  await currentCtx().store.saveOpenQuestion(question);
  return question;
}

/** A person posted: does it answer an open question in this chat? Returns the ones it closed. */
export async function noteReply(m: { chatId: ChatId; threadId: string | null; messageId: string; authorId: PersonId; time?: string }): Promise<string[]> {
  const { dir, store } = currentCtx();
  const open = (await store.listOpenQuestions({ status: "open" })).filter((q) => q.chatId === m.chatId);
  const closed: string[] = [];
  for (const q of open) {
    const msg = { chatId: m.chatId, threadId: m.threadId, id: m.messageId, who: m.authorId, time: m.time ?? new Date().toISOString() };
    if (answers(q, msg, isPerson(dir.people)) && (await store.transitionQuestion(q.id, ["open"], "answered", { resolvedBy: m.authorId }))) closed.push(q.id);
  }
  return closed;
}

/** Messages after the question that could answer it: its thread, and (top-level questions) the channel after it. */
function laterMessages(q: OpenQuestion, list: Message[]) {
  const out: { chatId: ChatId; threadId: string | null; id: string; who: PersonId; time: string }[] = [];
  const at = list.findIndex((x) => x.id === threadOf(q));
  if (at < 0) return null;
  const root = list[at];
  for (const r of root.replies) out.push({ chatId: q.chatId, threadId: root.id, id: r.id, who: r.who, time: r.time });
  if (!q.threadId) for (const x of list.slice(at + 1)) out.push({ chatId: q.chatId, threadId: null, id: x.id, who: x.who, time: x.time });
  return { root, out };
}

export interface SweepResult {
  followedUp: { questionId: string; chatId: ChatId; messageId: string }[];
  answered: number;
  dropped: number;
  /** Still open and waiting for their time. */
  waiting: number;
}

/**
 * Follow up on questions that are due (or, when a person asks with `manual`, at least a
 * couple of minutes old). Safe to run any number of times, concurrently.
 */
export async function sweepFollowUps(opts: { manual?: boolean; now?: number } = {}): Promise<SweepResult> {
  const { dir, store } = currentCtx();
  const now = opts.now ?? Date.now();
  const open = await store.listOpenQuestions({ status: "open" });
  const due = open.filter((q) => isDue(q, now, opts.manual)).sort((a, b) => a.askedAt.localeCompare(b.askedAt));
  const result: SweepResult = { followedUp: [], answered: 0, dropped: 0, waiting: open.length - due.length };
  const chatsDone = new Set<ChatId>();
  const lists = new Map<ChatId, Message[]>();
  const drop = async (q: OpenQuestion) => {
    if (await store.transitionQuestion(q.id, ["open"], "dropped")) result.dropped++;
  };

  for (const q of due) {
    if (result.followedUp.length >= FOLLOW_UPS_PER_SWEEP || chatsDone.has(q.chatId)) {
      result.waiting++;
      continue;
    }
    // A chat this person can't open: someone who can will sweep it.
    if (!dir.chats[q.chatId]) {
      result.waiting++;
      continue;
    }
    const asker = dir.people[q.asker];
    const addressee = q.addressee ? dir.people[q.addressee] : null;
    // Atlas was removed from the channel, or someone left: nothing to chase.
    if (agentModeIn(dir, q.chatId, ATLAS_ID) === null || !asker || (q.addressee && !addressee)) {
      await drop(q);
      continue;
    }
    if (!lists.has(q.chatId)) lists.set(q.chatId, await store.listMessages(q.chatId, { limit: 100 }));
    const later = laterMessages(q, lists.get(q.chatId)!);
    const asked = later && (later.root.id === q.messageId ? later.root : later.root.replies.find((r) => r.id === q.messageId));
    // The question (or its thread) was deleted.
    if (!later || !asked || asked.deletedAt) {
      await drop(q);
      continue;
    }
    // Answered by a path that didn't note it (or before it was tracked).
    const answer = later.out.find((x) => answers(q, x, isPerson(dir.people)));
    if (answer) {
      if (await store.transitionQuestion(q.id, ["open"], "answered", { resolvedBy: answer.who })) result.answered++;
      continue;
    }
    // A busy channel (agents at their rate limit) waits for the next sweep.
    if ((await store.countRunsSince(q.chatId, new Date(now - RATE_WINDOW_MS).toISOString())) >= RATE_ALL) {
      result.waiting++;
      continue;
    }
    const replyId = `fu${q.id}`;
    if (!(await store.transitionQuestion(q.id, ["open"], "followed_up", { followUpId: replyId }))) continue;
    const thread = threadOf(q);
    const saved = await store.appendMessage(q.chatId, { id: replyId, who: ATLAS_ID, time: stamp(), text: followUpText(q, asker, addressee) }, thread);
    await pingChanges({ chats: [q.chatId], tickets: false, origin: null, workspaceId: dir.workspace.id, message: { chatId: q.chatId, threadId: thread, message: saved } });
    result.followedUp.push({ questionId: q.id, chatId: q.chatId, messageId: replyId });
    chatsDone.add(q.chatId);
  }
  if (result.followedUp.length || result.answered) {
    console.log(`[follow-ups] ${dir.workspace.id} followed up ${result.followedUp.length}, answered ${result.answered}, waiting ${result.waiting}`);
  }
  return result;
}

// One lazy sweep per workspace per minute in this process (others may run theirs; the claim keeps it exactly-once).
const g = globalThis as typeof globalThis & { __meldFollowUpSweeps?: Map<string, number> };
const lastSweep = (g.__meldFollowUpSweeps ??= new Map());

/** After a person's message: close questions it answers, and now and then sweep for due ones. Never throws. */
export async function afterHumanMessage(m: { chatId: ChatId; threadId: string | null; messageId: string; authorId: PersonId }) {
  try {
    const { dir } = currentCtx();
    if (dir.people[m.authorId]?.isAgent) return;
    await noteReply(m);
    const ws = dir.workspace.id;
    if (Date.now() - (lastSweep.get(ws) ?? 0) < SWEEP_EVERY_MS) return;
    lastSweep.set(ws, Date.now());
    await sweepFollowUps();
  } catch (e) {
    console.error("[follow-ups] failed:", e);
  }
}

/** "Check follow-ups now" (Atlas's profile card): members and owners, not guests. */
export async function checkFollowUps(role?: Role): Promise<SweepResult> {
  if (effectiveRole(role) === "guest") throw new ApiError("Guests can't ask Atlas to follow up", 403);
  return sweepFollowUps({ manual: true });
}
