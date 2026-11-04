import type { Playbook, PlaybookRun, TicketTriage } from "../automation";
import { check, sb } from "./supabase";
import type { Store } from "./types";

type Methods = Pick<
  Store,
  "getTriage" | "claimTriage" | "saveTriage" | "listPlaybooks" | "savePlaybook" | "deletePlaybook" | "listPlaybookRuns" | "getPlaybookRun" | "claimPlaybookRun" | "advancePlaybookRun"
>;

interface TriageRow {
  ticket_id: string; agent_id: string; action_id: string | null; status: TicketTriage["status"]; summary: string; reason: string; by_user: string; created_at: string;
}
interface PlaybookRow {
  id: string; name: string; trigger: Playbook["trigger"]; steps: Playbook["steps"]; enabled: boolean; chat_id: string | null; created_by: string; created_at: string; updated_at: string;
}
interface RunRow {
  id: string; playbook_id: string; playbook_name: string; ticket_id: string; chat_id: string; thread_id: string | null; step: number; total: number;
  status: PlaybookRun["status"]; error: string | null; run_ids: string[]; requester: string; created_at: string; updated_at: string; finished_at: string | null;
}

const triageFrom = (r: TriageRow): TicketTriage => ({
  ticketId: r.ticket_id, agentId: r.agent_id, actionId: r.action_id, status: r.status, summary: r.summary, reason: r.reason, by: r.by_user, createdAt: r.created_at,
});
const playbookFrom = (r: PlaybookRow): Playbook => ({
  id: r.id, name: r.name, trigger: r.trigger, steps: r.steps, enabled: r.enabled, chatId: r.chat_id, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});
const runFrom = (r: RunRow): PlaybookRun => ({
  id: r.id, playbookId: r.playbook_id, playbookName: r.playbook_name, ticketId: r.ticket_id, chatId: r.chat_id, threadId: r.thread_id, step: r.step, total: r.total,
  status: r.status, error: r.error, runIds: r.run_ids ?? [], requester: r.requester, createdAt: r.created_at, updatedAt: r.updated_at, finishedAt: r.finished_at,
});

/** The Supabase store's automation methods (tables from 20261110110000_automation.sql). */
export function automationSupabase(ws: string): Methods {
  const triageRow = (t: TicketTriage) => ({
    workspace_id: ws, ticket_id: t.ticketId, agent_id: t.agentId, action_id: t.actionId, status: t.status, summary: t.summary, reason: t.reason, by_user: t.by, created_at: t.createdAt,
  });
  return {
    async getTriage(ticketId) {
      const row = check(await sb().from("ticket_triages").select("*").eq("workspace_id", ws).eq("ticket_id", ticketId).maybeSingle(), "get triage") as TriageRow | null;
      return row ? triageFrom(row) : null;
    },
    async claimTriage(t) {
      const res = await sb().from("ticket_triages").insert(triageRow(t));
      if (res.error?.code === "23505") return false;
      check(res, "claim triage");
      return true;
    },
    async saveTriage(t) {
      check(await sb().from("ticket_triages").upsert(triageRow(t)), "save triage");
    },
    async listPlaybooks() {
      const rows = check(await sb().from("playbooks").select("*").eq("workspace_id", ws).order("created_at").limit(100), "list playbooks") as PlaybookRow[];
      return rows.map(playbookFrom);
    },
    async savePlaybook(p) {
      check(
        await sb().from("playbooks").upsert({
          id: p.id, workspace_id: ws, name: p.name, trigger: p.trigger, steps: p.steps, enabled: p.enabled, chat_id: p.chatId, created_by: p.createdBy, created_at: p.createdAt, updated_at: p.updatedAt,
        }),
        "save playbook",
      );
    },
    async deletePlaybook(id) {
      check(await sb().from("playbooks").delete().eq("workspace_id", ws).eq("id", id), "delete playbook");
    },
    async listPlaybookRuns(filter = {}) {
      let q = sb().from("playbook_runs").select("*").eq("workspace_id", ws);
      if (filter.playbookId) q = q.eq("playbook_id", filter.playbookId);
      if (filter.ticketId) q = q.eq("ticket_id", filter.ticketId);
      const rows = check(await q.order("created_at", { ascending: false }).limit(50), "list playbook runs") as RunRow[];
      return rows.map(runFrom);
    },
    async getPlaybookRun(id) {
      const row = check(await sb().from("playbook_runs").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle(), "get playbook run") as RunRow | null;
      return row ? runFrom(row) : null;
    },
    async claimPlaybookRun(r) {
      const res = await sb().from("playbook_runs").insert({
        id: r.id, workspace_id: ws, playbook_id: r.playbookId, playbook_name: r.playbookName, ticket_id: r.ticketId, chat_id: r.chatId, thread_id: r.threadId,
        step: r.step, total: r.total, status: r.status, error: r.error, run_ids: r.runIds, requester: r.requester, created_at: r.createdAt, updated_at: r.updatedAt, finished_at: r.finishedAt,
      });
      if (res.error?.code === "23505") return false;
      check(res, "claim playbook run");
      return true;
    },
    async advancePlaybookRun(id, step, patch) {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.step !== undefined) update.step = patch.step;
      if (patch.status !== undefined) update.status = patch.status;
      if (patch.error !== undefined) update.error = patch.error;
      if (patch.runIds !== undefined) update.run_ids = patch.runIds;
      if (patch.chatId !== undefined) update.chat_id = patch.chatId;
      if (patch.threadId !== undefined) update.thread_id = patch.threadId;
      if (patch.finishedAt !== undefined) update.finished_at = patch.finishedAt;
      // Conditional update: only one worker moves a run past a step.
      const rows = check(
        await sb().from("playbook_runs").update(update).eq("workspace_id", ws).eq("id", id).eq("status", "running").eq("step", step).select("id"),
        "advance playbook run",
      ) as { id: string }[];
      return rows.length > 0;
    },
  };
}
