import type { ActionRecord } from "../agent/actions";
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
  listMessages(chatId: ChatId): Promise<Message[]>;
  /** Top-level message, or a reply in a thread (optionally under another reply). */
  appendMessage(chatId: ChatId, msg: Omit<Message, "replies">, threadId?: string | null, parentId?: string | null): Promise<Message | ReplyNode>;
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
  /** Back to the seed workspace. */
  reset(): Promise<void>;
}
