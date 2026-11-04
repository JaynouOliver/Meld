import { TEAM_MEMORY, type AgentMemory } from "./agent/memory";
import type { ChatId, Person, PersonId, Ticket } from "./types";

/**
 * Proactive Atlas (src/server/proactive/*): follow-ups on questions nobody answered,
 * links between conversations on the same topic in different channels, and a second
 * owner suggested when a ticket lands on someone who is overloaded or out. The rules
 * live here, pure, so evals/proactive.test.ts can check them without a model.
 */

// ---------------------------------------------------------------------------
// Follow-ups

/** How long a question may sit unanswered before Atlas follows up once. */
export const FOLLOW_UP_AFTER_MS = 24 * 3600_000;
/** "Check follow-ups now" (a person asking): questions at least a minute old count as due. */
export const FOLLOW_UP_MANUAL_MIN_AGE_MS = 60_000;
/** At most this many follow-ups per sweep, and one per chat, so a backlog never floods a channel. */
export const FOLLOW_UPS_PER_SWEEP = 3;
/** The lazy sweep (after() on posted messages) runs at most this often per workspace and process. */
export const SWEEP_EVERY_MS = 60_000;

export type QuestionStatus = "open" | "answered" | "followed_up" | "dropped";

/** A direct question the listener heard, tracked until it's answered or followed up once. */
export interface OpenQuestion {
  id: string;
  chatId: ChatId;
  /** The thread the question was asked in, or null when it's a top-level message. */
  threadId: string | null;
  messageId: string;
  asker: PersonId;
  /** Who it was asked of, or null when it was asked of the channel. */
  addressee: PersonId | null;
  /** What it's about, a short noun phrase ("the Stripe test keys"). */
  summary: string;
  status: QuestionStatus;
  askedAt: string;
  dueAt: string;
  /** Atlas's follow-up message, once posted. */
  followUpId: string | null;
  resolvedAt: string | null;
  /** Who answered (status answered). */
  resolvedBy: PersonId | null;
}

/** Where a follow-up (and replies to the question) go: the question's thread. */
export const threadOf = (q: Pick<OpenQuestion, "threadId" | "messageId">) => q.threadId ?? q.messageId;

/**
 * Does this message answer the question? The addressee (anyone but the asker, for a
 * question to the channel) writing after it, in its thread, or, for a top-level
 * question, directly in the channel.
 */
export function answers(
  q: Pick<OpenQuestion, "chatId" | "threadId" | "messageId" | "asker" | "addressee" | "askedAt">,
  m: { chatId: ChatId; threadId: string | null; id: string; who: PersonId; time: string },
  isPerson: (id: PersonId) => boolean,
): boolean {
  if (m.chatId !== q.chatId || m.id === q.messageId || !isPerson(m.who)) return false;
  if (q.addressee ? m.who !== q.addressee : m.who === q.asker) return false;
  // Seed and preview messages carry display times; ISO times must be after the question.
  const t = Date.parse(m.time);
  if (Number.isFinite(t) && t < Date.parse(q.askedAt)) return false;
  if (m.threadId === threadOf(q)) return true;
  return !q.threadId && !m.threadId && !!q.addressee;
}

/** Due for a follow-up: still open and past its time (or old enough, when someone asks to check now). */
export function isDue(q: Pick<OpenQuestion, "status" | "dueAt" | "askedAt">, now: number, manual = false): boolean {
  if (q.status !== "open") return false;
  if (Date.parse(q.dueAt) <= now) return true;
  return manual && now - Date.parse(q.askedAt) >= FOLLOW_UP_MANUAL_MIN_AGE_MS;
}

/** "@Jonas, Maya's question about the Stripe keys is still open." */
export function followUpText(q: Pick<OpenQuestion, "summary">, asker: Person, addressee: Person | null): string {
  const about = q.summary.replace(/[.?!\s]+$/, "");
  return addressee
    ? `@${addressee.first}, ${asker.first}'s question about ${about} is still open.`
    : `${asker.first}'s question about ${about} is still open. Can anyone here help?`;
}

/**
 * Free check before the listener's model call: does this read like a question to a
 * person (a "?" plus a name, an @mention or "can you…")? Tuned for recall; the model
 * decides.
 */
export function mayAsk(text: string): boolean {
  if (!text.includes("?")) return false;
  return /@[a-z]/i.test(text) || /^\s*[A-Z][a-z]+\s*[,:]/.test(text) || /\b(can|could|would|will|did|do|have) (you|someone|anyone|we)\b|\b(any|an) (eta|update|news)\b|\bwhen (can|will|do)\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Linked threads

/** Only conversations active in the last week are worth linking to. */
export const LINK_WINDOW_MS = 7 * 86400_000;
/** Shared topic words a candidate needs before the model is asked to confirm. */
export const LINK_MIN_SHARED = 3;

/** A link Atlas posted between two conversations. `key` is unique per workspace: one link per pair, ever. */
export interface ThreadLink {
  key: string;
  chatId: ChatId;
  messageId: string;
  toChatId: ChatId;
  toMessageId: string;
  replyId: string;
  createdAt: string;
}

/** One link per (channel, other conversation): the same thread is never pointed to twice from a channel. */
export const linkKey = (chatId: ChatId, toMessageId: string) => `${chatId}>${toMessageId}`;

const STOP = new Set(
  ("about after again also because before being could does doing from have here into just like make more most much need only other over same should some still such than that their them then there these they this those very want what when where which while will with would your yours ours " +
    "anyone someone everyone thanks thank today tomorrow yesterday week please think know going sure good great yeah okay sounds looks right maybe really already actually")
    .split(" "),
);
/** Topic words: lowercase, 4+ letters, minus filler. Ticket ids count as words. */
export function topicWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
    if (STOP.has(w)) continue;
    out.add(w.replace(/(?:ing|ed|es|s)$/, "") || w);
  }
  return out;
}

export interface Conversation {
  chatId: ChatId;
  rootId: string;
  who: PersonId;
  text: string;
  /** Root plus replies, for word overlap. */
  body: string;
  lastAt: number;
}

/**
 * The best conversation in another channel to link a new top-level message to, or null.
 * Free: word overlap only. Never the message's own channel, never a pair linked before,
 * never one Atlas started, and only if active in the last week.
 */
export function linkCandidate(
  m: { chatId: ChatId; messageId: string; text: string },
  conversations: Conversation[],
  opts: { now: number; visible: (chatId: ChatId) => boolean; isPerson: (id: PersonId) => boolean; linked: Set<string> },
): (Conversation & { shared: string[] }) | null {
  const mine = topicWords(m.text);
  if (mine.size < LINK_MIN_SHARED) return null;
  let best: (Conversation & { shared: string[] }) | null = null;
  for (const c of conversations) {
    if (c.chatId === m.chatId || c.rootId === m.messageId || !opts.visible(c.chatId) || !opts.isPerson(c.who)) continue;
    if (opts.now - c.lastAt > LINK_WINDOW_MS) continue;
    if (opts.linked.has(linkKey(m.chatId, c.rootId)) || opts.linked.has(linkKey(c.chatId, m.messageId))) continue;
    const theirs = topicWords(c.body);
    const shared = [...mine].filter((w) => theirs.has(w));
    if (shared.length < LINK_MIN_SHARED) continue;
    if (!best || shared.length > best.shared.length || (shared.length === best.shared.length && c.lastAt > best.lastAt)) best = { ...c, shared };
  }
  return best;
}

/** Group recent messages into conversations (top-level roots with their replies). */
export function conversationsOf(hits: { chatId: ChatId; id: string; threadId: string | null; who: PersonId; time: string; text: string }[]): Conversation[] {
  const byRoot = new Map<string, Conversation>();
  for (const h of hits) {
    const at = Date.parse(h.time);
    if (!h.threadId) {
      const c = byRoot.get(h.id);
      if (c) Object.assign(c, { who: h.who, text: h.text, body: `${h.text} ${c.body}`, lastAt: Math.max(c.lastAt, at || 0) });
      else byRoot.set(h.id, { chatId: h.chatId, rootId: h.id, who: h.who, text: h.text, body: h.text, lastAt: at || 0 });
    } else {
      const c = byRoot.get(h.threadId);
      if (c) Object.assign(c, { body: `${c.body} ${h.text}`, lastAt: Math.max(c.lastAt, at || 0) });
      // A reply whose root is older than the window: the root's text is unknown, so it can't be matched.
      else byRoot.set(h.threadId, { chatId: h.chatId, rootId: h.threadId, who: "", text: "", body: h.text, lastAt: at || 0 });
    }
  }
  return [...byRoot.values()].filter((c) => c.who);
}

// ---------------------------------------------------------------------------
// Workload balancer

/** Holding this many open tickets (counting the new one) is overloaded. */
export const OVERLOAD_OPEN = 5;

export const isOpen = (t: Pick<Ticket, "status">) => t.status !== "Done" && t.status !== "Backburner";
export const openCount = (tickets: Ticket[], who: PersonId) => tickets.filter((t) => t.assignee === who && isOpen(t)).length;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const AWAY = /\b(out|off|away|ooo|on leave|on vacation|on holiday|vacation|holiday|pto|unavailable|sick)\b/i;

/**
 * Is this person out on that day (YYYY-MM-DD), by a team memory like "Priya Raman is out
 * on Monday", "Maya is off Fridays" or "Jonas is on vacation 2026-11-12"? A weekday in a
 * memory means that weekday from the day it was written on (or every one, if plural).
 */
export function outOn(memories: Pick<AgentMemory, "agentId" | "text" | "createdAt">[], person: Pick<Person, "name" | "first">, day: string | null | undefined): AgentMemory["text"] | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T12:00:00Z`);
  const first = person.first.toLowerCase();
  const full = person.name.toLowerCase();
  for (const m of memories) {
    if (m.agentId !== TEAM_MEMORY) continue;
    const text = m.text.toLowerCase();
    if (!text.includes(full) && !new RegExp(`\\b${first.replace(/[^a-z]/g, "")}\\b`).test(text)) continue;
    if (!AWAY.test(text)) continue;
    if (text.includes(day)) return m.text;
    const md = new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\.? (\\d{1,2})\\b`).exec(text);
    if (md && MONTHS.indexOf(md[1]) === date.getUTCMonth() && Number(md[2]) === date.getUTCDate()) return m.text;
    const wd = WEEKDAYS[date.getUTCDay()];
    const hit = new RegExp(`\\b${wd}(s)?\\b`).exec(text);
    if (!hit) continue;
    if (hit[1] || /\b(every|each)\b/.test(text)) return m.text; // "Fridays": every week
    // "Monday": the next one after the day it was said.
    const said = new Date(`${m.createdAt.slice(0, 10)}T12:00:00Z`);
    const diff = Math.round((date.getTime() - said.getTime()) / 86400_000);
    if (diff > 0 && diff <= 7) return m.text;
  }
  return null;
}

export interface OwnerSuggestion {
  reason: { open: number; out: string | null };
  to: PersonId;
  toOpen: number;
}

/**
 * Should Atlas suggest someone else for this ticket, and who? The assignee is overloaded
 * (OVERLOAD_OPEN open tickets, this one included) or out on the due date; the suggestion
 * is the teammate on the ticket's team (else the assignee's) with the fewest open
 * tickets, not out that day, not the previous owner, and clearly less loaded.
 */
export function suggestOwner(
  t: Ticket,
  input: { tickets: Ticket[]; people: Person[]; memories: Pick<AgentMemory, "agentId" | "text" | "createdAt">[]; previous: PersonId | null },
): OwnerSuggestion | null {
  if (!isOpen(t)) return null;
  const assignee = input.people.find((p) => p.id === t.assignee);
  if (!assignee || assignee.isAgent) return null;
  const tickets = input.tickets.some((x) => x.id === t.id) ? input.tickets.map((x) => (x.id === t.id ? t : x)) : [...input.tickets, t];
  const open = openCount(tickets, assignee.id);
  const out = outOn(input.memories, assignee, t.due);
  if (open < OVERLOAD_OPEN && !out) return null;
  const pick = (team: string | null) =>
    input.people
      .filter((p) => !p.isAgent && p.team === team && p.id !== assignee.id && p.id !== input.previous && !outOn(input.memories, p, t.due))
      .map((p) => ({ p, n: openCount(tickets, p.id) }))
      // Taking it must leave them under the line, and lighter than the assignee is now.
      .filter((x) => x.n + 1 < OVERLOAD_OPEN && (out || x.n + 1 < open))
      .sort((a, b) => a.n - b.n || a.p.name.localeCompare(b.p.name))[0];
  const best = pick(t.team) ?? (assignee.team && assignee.team !== t.team ? pick(assignee.team) : undefined);
  return best ? { reason: { open, out }, to: best.p.id, toOpen: best.n } : null;
}
