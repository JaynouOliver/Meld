import type { ChatId, PersonId, Role } from "../types";

/**
 * Atlas runs as queued jobs. Posting an @Atlas message saves the message and enqueues
 * a run in the same request; the run executes after the response is sent, and its
 * reply reaches every browser over realtime. See docs/architecture.md §4.
 */
export type RunStatus = "queued" | "running" | "done" | "failed";

export interface RunResult {
  /** Chats that received a new Atlas message. */
  touchedChats: ChatId[];
  /** Ticket the requester should see opened (e.g. just created). */
  openTicket: string | null;
  /** Ticket ids that no longer exist after this run. */
  deleted: string[];
}

export interface AgentRun {
  id: string;
  /** The message that asked for this run. Unique: one run per message, so retries don't double-run. */
  triggerMessageId: string;
  chatId: ChatId;
  threadId: string | null;
  /** Who asked, and with what role: the run acts with their permissions. */
  requester: PersonId;
  role: Role;
  text: string;
  status: RunStatus;
  attempts: number;
  error: string | null;
  result: RunResult | null;
  /** Model, tool calls, tokens and timing, for debugging (server only). */
  trace: unknown;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** What browsers see: enough to show "Atlas is working…" and react when it's done. */
export interface RunView {
  id: string;
  chatId: ChatId;
  threadId: string | null;
  status: RunStatus;
  result: RunResult | null;
}

/** A run still "running" after this long is assumed dead (function killed) and may be retried. */
export const RUN_STALE_MS = 5 * 60 * 1000;
/** A queued run not picked up after this long is started by the sweep. */
export const RUN_PICKUP_MS = 10 * 1000;
export const RUN_MAX_ATTEMPTS = 2;
/** Finished runs stay visible this long, so browsers that were polling see them finish. */
export const RUN_RECENT_MS = 2 * 60 * 1000;

/** The reply message id is derived from the run, so a retried run can tell it already replied. */
export const replyIdFor = (runId: string) => `${runId}r`;

export const toRunView = (r: AgentRun): RunView => ({
  id: r.id, chatId: r.chatId, threadId: r.threadId, status: r.status, result: r.result,
});
