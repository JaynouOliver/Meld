import "server-only";

import { after } from "next/server";

import { currentCtx } from "@/lib/context";
import { agentById, ATLAS_ID } from "@/lib/directory";
import { isPlaybookStep } from "@/lib/automation";
import type { Store } from "@/lib/store";
import type { Ticket } from "@/lib/types";
import { llm } from "../llm";

/**
 * Workflow automation, hooked on the workspace store like assignment pick-up
 * (src/server/agents/assignment.ts): every way a ticket is created or saved ends in
 * store.insertTicket / saveTicket on the request's context store, so wrapping that one
 * object covers the ticket panel, the board, Atlas, the listener, Undo and MCP alike.
 *
 * - Auto-triage (triage.ts): a ticket a person just created (it got its first title)
 *   gets labels, priority, an owner and maybe a due date from Tess, in one fast call.
 * - Playbooks (playbooks.ts): "ticket labeled bug" / "moved to In review" start a
 *   chain of agent runs through the queue.
 * Changes made inside a playbook step never start a playbook, so playbooks can't loop.
 */

type Job = () => Promise<void>;
type Schedule = (job: Job, workspaceId: string, requester: string) => void;

let enabled: () => boolean = () => !!llm();
let schedule: Schedule = (job, workspaceId, requester) => {
  try {
    // After the response, in a fresh context as the person (their role and view).
    after(async () => {
      const [{ contextAs }, { runInCtx }] = await Promise.all([import("../workspace"), import("../context")]);
      const ctx = await contextAs(workspaceId, requester);
      await runInCtx(ctx, () => job().catch((e) => console.error("[automation] job failed:", e)));
    });
  } catch {
    // Outside a request (scripts): nothing to schedule on.
  }
};

/** Tests: run without a model, and capture jobs instead of scheduling them. */
export function configureAutomation(opts: { enabled?: () => boolean; schedule?: Schedule }) {
  if (opts.enabled) enabled = opts.enabled;
  if (opts.schedule) schedule = opts.schedule;
}

export const scheduleJob: Schedule = (job, ws, requester) => schedule(job, ws, requester);

/** The store, plus: new tickets get triaged, and ticket events start playbooks. */
export function withAutomation(inner: Store): Store {
  const wrapped: Store = {
    ...inner,
    async insertTicket(t) {
      await inner.insertTicket(t);
      if (enabled()) await guarded(wrapped, null, t);
    },
    async saveTicket(t) {
      const before = enabled() ? await inner.getTicket(t.id) : null;
      await inner.saveTicket(t);
      if (before) await guarded(wrapped, before, t);
    },
  };
  return wrapped;
}

/** Automation never fails the save that caused it. Only writes made through this request's store count. */
async function guarded(store: Store, before: Ticket | null, t: Ticket) {
  if (currentCtx().store !== store) return;
  try {
    await onTicketChange(before, t);
  } catch (e) {
    console.error(`[automation] ${t.id} failed:`, e);
  }
}

/**
 * A person created this ticket just now: it got its first title outside any agent run.
 * (The ticket panel creates an empty ticket and the title follows; the listener's
 * commitment tickets arrive titled. Atlas's thread→tickets run, missions and MCP agents
 * aren't people creating tickets.)
 */
export function isPersonCreation(before: Ticket | null, t: Ticket): boolean {
  const ctx = currentCtx();
  if (ctx.run || ctx.scopedTo) return false;
  if (agentById(ctx.dir, ctx.dir.me)) return false;
  if (t.missionId) return false;
  if (!t.title.trim() || (before && before.title.trim())) return false;
  if (t.status === "Done" || t.status === "Backburner") return false;
  // The listener files commitments as Atlas, for the speaker; anything else Atlas reports came from a run.
  return t.reporter === ctx.dir.me || (t.reporter === ATLAS_ID && t.assignee === ctx.dir.me);
}

async function onTicketChange(before: Ticket | null, t: Ticket) {
  const ctx = currentCtx();
  if (isPlaybookStep(ctx.run?.id)) return; // a playbook's own changes start nothing
  const workspaceId = ctx.dir.workspace.id;
  if (isPersonCreation(before, t)) {
    // Playbooks wait for triage, so "labeled bug" sees the labels Tess adds (triage.ts runs them after).
    const { runTriage } = await import("./triage");
    scheduleJob(async () => void (await runTriage(t.id)), workspaceId, ctx.dir.me);
    return;
  }
  const { playbookEvent } = await import("./playbooks");
  await playbookEvent(before, t);
}
