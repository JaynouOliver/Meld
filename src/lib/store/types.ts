import type { ChatId, Message, PersonId, ReplyNode, Ticket, WeekDay } from "../types";

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
  searchMessages(terms: string[], limit: number): Promise<{ chatId: ChatId; id: string; who: PersonId; time: string; text: string }[]>;
  week(): Promise<WeekDay[]>;
  bumpWeek(kind: "p" | "a"): Promise<void>;
  logEvent(e: { kind: string; actor: string; chatId?: ChatId | null; ticketId?: string | null; payload?: unknown }): Promise<void>;
  /** Back to the seed workspace. */
  reset(): Promise<void>;
}
