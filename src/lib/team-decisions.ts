import type { ChatId, PersonId } from "./types";

/**
 * The team's decision memory. The listener agent logs a decision when a conversation
 * settles one (what, why, what was rejected, who), and flags later messages that go
 * against it, so settled questions aren't re-argued and newcomers learn the "why".
 */
export interface TeamDecision {
  id: string;
  /** Short label, e.g. "Onboarding checklist placement". */
  topic: string;
  /** What was decided, one sentence. */
  statement: string;
  /** Why, one or two sentences, from the conversation. */
  rationale: string;
  /** Options considered and not chosen. */
  rejected: string[];
  /** People who took part in deciding. */
  deciders: PersonId[];
  /** Where it was decided (the message that settled it). */
  chatId: ChatId;
  threadId: string | null;
  messageId: string;
  status: "active" | "reopened" | "superseded";
  /** The decision that replaced this one. */
  supersededBy: string | null;
  /** How often the guard has pointed someone back to it. */
  flags: number;
  lastFlaggedAt: string | null;
  /** "chat" (spotted in conversation) or "mission" (a mission decision someone answered). */
  source: "chat" | "mission";
  createdAt: string;
}
