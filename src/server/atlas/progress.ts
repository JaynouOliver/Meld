import "server-only";

import { broadcastRun } from "../realtime";

/**
 * Live progress for Atlas runs: the current step ("Checking NW-130") and the reply as it
 * streams. Broadcast over realtime (drafts throttled), and kept in this process so
 * polling browsers (no realtime, e.g. local dev) see it through getAgentRuns.
 */
const live = new Map<string, { step: string | null; draft: string | null; note: string | null }>();
export const progressOf = (runId: string) => live.get(runId) ?? null;

export interface Progress {
  /** Atlas's one-line "here's what I'll do" before it starts working: stays up while it works. */
  note(text: string): void;
  step(label: string): void;
  draft(text: string): void;
  done(): void;
}

export function reporter(workspaceId: string, run: { id: string; chatId: string; threadId: string | null }): Progress {
  const state = { step: null as string | null, draft: null as string | null, note: null as string | null };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = 0;
  const send = () => {
    timer = null;
    last = Date.now();
    void broadcastRun(workspaceId, { runId: run.id, chatId: run.chatId, threadId: run.threadId, ...state });
  };
  const publish = (urgent: boolean) => {
    live.set(run.id, { ...state });
    if (urgent) {
      if (timer) clearTimeout(timer);
      return send();
    }
    // Drafts: at most every 150 ms, always flushing the latest.
    if (!timer) timer = setTimeout(send, Math.max(0, 150 - (Date.now() - last)));
  };
  return {
    note(text) {
      if (state.note) return; // the first plan line is the acknowledgement
      state.note = text.trim().slice(0, 300) || null;
      publish(true);
    },
    step(label) {
      state.step = label;
      state.draft = null;
      publish(true);
    },
    draft(text) {
      state.draft = text;
      publish(false);
    },
    done() {
      if (timer) clearTimeout(timer);
      live.delete(run.id);
    },
  };
}

/** What Atlas is doing, in words, for a tool call. */
export function stepLabel(name: string, args: Record<string, unknown>) {
  const id = typeof args.id === "string" ? args.id.toUpperCase() : "";
  switch (name) {
    case "list_tickets":
      return "Looking through tickets";
    case "get_ticket":
      return `Checking ${id || "a ticket"}`;
    case "ticket_discussion":
      return `Reading what people said about ${id || "the ticket"}`;
    case "search_messages":
      return "Searching the conversation";
    case "create_ticket":
      return typeof args.title === "string" ? `Drafting “${args.title.slice(0, 48)}”` : "Drafting a ticket";
    case "update_ticket":
      return `Updating ${id || "a ticket"}`;
    case "delete_ticket":
      return `Preparing to delete ${id || "a ticket"}`;
    case "catch_up":
      return "Catching up on what you missed";
    case "start_mission":
      return "Planning the mission: tasks, owners, dates";
    default:
      return "Working on it";
  }
}
