import type { ActionRecord } from "../agent/actions";
import type { TeamDecision } from "../team-decisions";
import type { AgentRun } from "../agent/runs";
import type { AgentMemory } from "../agent/memory";
import type { Decision, Mission, MissionEvent } from "../missions";
import type { ChatId, Message, PersonId, ReplyNode, Ticket, WeekDay } from "../types";

/** A message found by search, with the thread it belongs to (null when top-level). */
export interface MessageHit {
  chatId: ChatId;
  id: string;
  threadId: string | null;
  who: PersonId;
  time: string;
  text: string;
}

/** One stored message, with what edit/delete/pin checks need. */
export interface StoredMessage extends MessageHit {
  replyCount: number;
  editedAt: string | null;
  deletedAt: string | null;
  pinnedAt: string | null;
}

/** Fields a message edit, delete (placeholder) or pin changes. Undefined keys are left alone. */
export interface MessagePatch {
  text?: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  pinnedBy?: PersonId | null;
  /** Clear reactions (a deleted root keeps none). */
  clearReactions?: boolean;
}

/** A pinned message in a chat. */
export interface PinnedHit extends MessageHit {
  pinnedAt: string;
  pinnedBy: PersonId | null;
}

/**
 * Where workspace data lives. Two implementations with the same behaviour:
 * - memory: in-process (the single-file preview, evals, local dev without Supabase)
 * - supabase: Postgres via supabase-js over HTTPS (deployed app)
 */
export interface Store {
  kind: "memory" | "supabase";
  listTickets(): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | null>;
  nextTicketId(): Promise<string>;
  insertTicket(t: Ticket): Promise<void>;
  saveTicket(t: Ticket): Promise<void>;
  deleteTicket(id: string): Promise<void>;
  /** A chat's latest conversations (default 100 top-level messages) with their replies, oldest first. */
  listMessages(chatId: ChatId, opts?: { limit?: number }): Promise<Message[]>;
  /** Top-level message, or a reply in a thread. Threads are flat: replies can't have replies. */
  appendMessage(chatId: ChatId, msg: Omit<Message, "replies">, threadId?: string | null): Promise<Message | ReplyNode>;
  searchMessages(terms: string[], limit: number): Promise<MessageHit[]>;
  /** Messages whose text mentions a ticket id (e.g. "NW-130"), newest first. */
  messagesMentioning(ticketId: string, limit: number): Promise<MessageHit[]>;
  /** Where each message lives (unknown ids are left out). Used to verify citations. */
  getMessageRefs(ids: string[]): Promise<Record<string, { chatId: ChatId; threadId: string | null }>>;
  week(): Promise<WeekDay[]>;
  bumpWeek(kind: "p" | "a"): Promise<void>;
  logEvent(e: { kind: string; actor: string; chatId?: ChatId | null; ticketId?: string | null; payload?: unknown }): Promise<void>;
  insertAction(a: ActionRecord): Promise<void>;
  getAction(id: string): Promise<ActionRecord | null>;
  /**
   * Atomically move an action from one of `from` to `to` (e.g. pending -> applied).
   * Returns false if it was already decided, so two clicks can't both apply it.
   */
  transitionAction(id: string, from: ActionRecord["status"][], to: ActionRecord["status"], patch?: { undoUntil?: string | null }): Promise<boolean>;
  /** Add a queued run. Idempotent on triggerMessageId: returns the existing run if there is one. */
  enqueueRun(run: AgentRun): Promise<AgentRun>;
  /**
   * Atomically take a run to execute: queued, or running but stale (its worker died),
   * and under the attempt limit. Returns null if someone else has it or it's finished.
   */
  claimRun(id: string): Promise<AgentRun | null>;
  finishRun(id: string, patch: { status: "done" | "failed"; error?: string | null; result?: AgentRun["result"]; trace?: unknown }): Promise<void>;
  /** Agent runs started in a chat since `since` (rate limiting). */
  countRunsSince(chatId: ChatId, since: string): Promise<number>;
  /** Add or remove a reaction (emoji) by someone on a message. */
  react(messageId: string, emoji: string, who: PersonId, on: boolean): Promise<void>;
  /** One message or reply by id, or null. */
  getMessage(id: string): Promise<StoredMessage | null>;
  updateMessage(id: string, patch: MessagePatch): Promise<void>;
  /** Hard delete (a root takes its replies with it). */
  removeMessage(id: string): Promise<void>;
  /** A chat's pinned messages, newest pin first. */
  listPinned(chatId: ChatId, limit: number): Promise<PinnedHit[]>;
  /** Runs that are queued/running, or finished within RUN_RECENT_MS. */
  listRecentRuns(): Promise<AgentRun[]>;
  /** Messages posted after `since` (ISO), oldest first, across the workspace. */
  messagesSince(since: string, limit: number): Promise<MessageHit[]>;
  /** When each person last looked at each chat (ISO), for "what did I miss?". */
  readMarkers(userId: PersonId): Promise<Record<ChatId, string>>;
  markRead(userId: PersonId, chatId: ChatId, at: string): Promise<void>;
  /** Cached summaries of a stretch of a chat, keyed by chat + first and last message id. */
  getSummary(key: string): Promise<string | null>;
  putSummary(key: string, chatId: ChatId, text: string): Promise<void>;
  listMissions(): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  saveMission(m: Mission): Promise<void>;
  listDecisions(filter?: { missionId?: string; status?: Decision["status"] }): Promise<Decision[]>;
  saveDecision(d: Decision): Promise<void>;
  addMissionEvent(e: MissionEvent): Promise<void>;
  /** The team's decision memory, newest first. */
  listTeamDecisions(): Promise<TeamDecision[]>;
  saveTeamDecision(d: TeamDecision): Promise<void>;
  listMissionEvents(missionId: string): Promise<MissionEvent[]>;
  /** Agent memory (src/lib/agent/memory.ts): every agent's and the team's, newest first (at most 500). */
  listAgentMemories(): Promise<AgentMemory[]>;
  addAgentMemory(m: AgentMemory): Promise<void>;
  /** False if there was no such memory. */
  deleteAgentMemory(id: string): Promise<boolean>;
  /** Remove every message in a chat (its channel was deleted). */
  deleteChatMessages(chatId: ChatId): Promise<void>;
  /** Back to the seed workspace. */
  reset(): Promise<void>;
}
