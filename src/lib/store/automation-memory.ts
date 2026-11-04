import type { Playbook, PlaybookRun, TicketTriage } from "../automation";
import type { Db } from "../mock/db";
import type { Store } from "./types";

/** Automation data in the in-memory database (swapped with it on reset). */
export interface AutomationDb {
  triages: Map<string, TicketTriage>;
  playbooks: Map<string, Playbook>;
  runs: Map<string, PlaybookRun>;
}

type Methods = Pick<
  Store,
  "getTriage" | "claimTriage" | "saveTriage" | "listPlaybooks" | "savePlaybook" | "deletePlaybook" | "listPlaybookRuns" | "getPlaybookRun" | "claimPlaybookRun" | "advancePlaybookRun"
>;

const clone = <T,>(x: T): T => structuredClone(x);

/** The memory store's automation methods, over whichever database `d()` returns now. */
export function automationMemory(d: () => Db): Methods {
  const a = () => (d().automation ??= { triages: new Map(), playbooks: new Map(), runs: new Map() });
  return {
    async getTriage(ticketId) {
      const t = a().triages.get(ticketId);
      return t ? clone(t) : null;
    },
    async claimTriage(t) {
      if (a().triages.has(t.ticketId)) return false;
      a().triages.set(t.ticketId, clone(t));
      return true;
    },
    async saveTriage(t) {
      a().triages.set(t.ticketId, clone(t));
    },
    async listPlaybooks() {
      return clone([...a().playbooks.values()]).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    },
    async savePlaybook(p) {
      a().playbooks.set(p.id, clone(p));
    },
    async deletePlaybook(id) {
      a().playbooks.delete(id);
    },
    async listPlaybookRuns(filter = {}) {
      return clone(
        [...a().runs.values()]
          .filter((r) => (!filter.playbookId || r.playbookId === filter.playbookId) && (!filter.ticketId || r.ticketId === filter.ticketId))
          .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
          .slice(0, 50),
      );
    },
    async getPlaybookRun(id) {
      const r = a().runs.get(id);
      return r ? clone(r) : null;
    },
    async claimPlaybookRun(r) {
      if (a().runs.has(r.id)) return false;
      a().runs.set(r.id, clone(r));
      return true;
    },
    async advancePlaybookRun(id, step, patch) {
      const r = a().runs.get(id);
      if (!r || r.status !== "running" || r.step !== step) return false;
      Object.assign(r, clone(patch), { updatedAt: new Date().toISOString() });
      return true;
    },
  };
}
