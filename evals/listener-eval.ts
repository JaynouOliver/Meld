/**
 * Listener accuracy and speed against the real model: npm run eval:listener
 * LISTENER_MODEL=muse-spark-1.2 npm run eval:listener   (compare models)
 * Each case: a message (with context) and what the listener should find.
 */
import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type Directory } from "../src/lib/directory";
import { memoryStore } from "../src/lib/store/memory";
import type { TeamDecision } from "../src/lib/team-decisions";
import type { Ticket } from "../src/lib/types";
import { analyze, LISTENER_MODEL, type Analysis } from "../src/server/listener/analyze";

const person = (id: string, name: string) => ({ id, name, first: name, initials: name[0], color: "#000", team: "eng", isAgent: false });
const dir: Directory = {
  workspace: { id: "ws-eval", name: "Eval", slug: "eval", ticketPrefix: "ORB", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "atlas"], teams: [{ id: "eng", name: "Engineering" }] as Directory["teams"],
  people: { u1: person("u1", "Ada Lee"), u2: person("u2", "Bo Chen"), atlas: ATLAS },
  agents: [ATLAS_AGENT],
  chats: { eng: { id: "eng", kind: "channel", label: "product", topic: "", team: null, members: [], agents: [{ id: "atlas", mode: "mention" }] } },
  channels: ["eng"], dms: [], home: "eng", memberships: [], demo: false,
};
setCtxProvider(() => ({ dir, store: memoryStore("ws-eval", "ORB") }) as RequestCtx);

const t = (id: string, assignee: string, title: string, status: Ticket["status"] = "To do", due: string | null = null): Ticket => ({
  id, team: "eng", title, description: "", status, priority: "Medium", assignee, reporter: "u1", links: [], images: [], updated: "", watch: null, blockedBy: [], activity: [], due,
});
const tickets = [
  t("ORB-1", "u1", "Record the 2-minute demo video", "To do", "2026-12-04"),
  t("ORB-2", "u1", "Stripe webhooks for plan upgrades", "In progress"),
  t("ORB-3", "u2", "Pricing page refresh"),
  t("ORB-4", "u2", "Launch email sequence"),
];
const decisions: TeamDecision[] = [{
  id: "td1", topic: "Onboarding checklist placement", statement: "The onboarding checklist is a sidebar card with 4 steps, not a modal.", rationale: "Modals get dismissed.",
  rejected: ["Modal"], deciders: ["u1", "u2"], chatId: "eng", threadId: null, messageId: "m0", status: "active", supersededBy: null, flags: 0, lastFlaggedAt: null, source: "chat",
  createdAt: "2026-10-30T10:00:00Z",
}];
const ctx = (lines: [string, string][]) => lines.map(([who, text]) => ({ who, time: new Date().toISOString(), text }));

type Expect = { kind: "nothing" } | { kind: "update"; ticket: string; field: "status" | "blockedBy" | "due"; value?: string } | { kind: "commitment"; due?: boolean } | { kind: "decision"; replaces?: string } | { kind: "conflict"; id: string };
const CASES: { text: string; expect: Expect; context?: [string, string][] }[] = [
  { text: "Recorded the demo video, it's up for review now", expect: { kind: "update", ticket: "ORB-1", field: "status", value: "In review" } },
  { text: "Webhooks are merged and deployed to prod", expect: { kind: "update", ticket: "ORB-2", field: "status", value: "Done" } },
  { text: "I'm stuck on the webhooks until Bo finishes the pricing page", expect: { kind: "update", ticket: "ORB-2", field: "blockedBy", value: "ORB-3" } },
  { text: "Pushing the demo video to next Friday, my recording setup broke", expect: { kind: "update", ticket: "ORB-1", field: "due" } },
  { text: "I'll write the migration guide by Thursday", expect: { kind: "commitment", due: true } },
  { text: "lunch was great today, thanks everyone", expect: { kind: "nothing" } },
  { text: "thanks Bo, that's super helpful!", expect: { kind: "nothing" } },
  { text: "What if we put the onboarding checklist in a modal on first login?", expect: { kind: "conflict", id: "td1" } },
  { text: "The onboarding sidebar card looks great, nice work Bo", expect: { kind: "nothing" } },
  {
    text: "Agreed, let's go with weekly digest emails, not daily. Daily is too noisy.",
    context: [["u2", "Should the digest be daily or weekly?"], ["u1", "Weekly feels calmer"], ["u2", "Daily gets more opens though"]],
    expect: { kind: "decision" },
  },
  { text: "Should we do daily or weekly digest emails?", expect: { kind: "nothing" } },
  { text: "Bo, can you review the pricing page copy by Friday?", expect: { kind: "nothing" } },
  { text: "I'll take a look at some point", expect: { kind: "nothing" } },
  { text: "Decision after the user research: we're moving the onboarding checklist into a modal after all.", expect: { kind: "decision", replaces: "td1" } },
];

function score(a: Analysis, e: Expect): boolean {
  const found = !!(a.decision || a.conflict || a.updates.length || a.commitment);
  switch (e.kind) {
    case "nothing": return !found;
    case "update": {
      const u = a.updates.find((x) => x.ticketId === e.ticket);
      if (!u || a.decision || a.conflict) return false;
      if (e.field === "status") return u.status === e.value;
      if (e.field === "blockedBy") return u.blockedBy === e.value;
      return !!u.due;
    }
    case "commitment": return !!a.commitment && (!e.due || !!a.commitment.due) && !a.decision && !a.conflict;
    case "decision": return !!a.decision && (e.replaces ? a.decision.replaces === e.replaces : true) && !a.conflict;
    case "conflict": return a.conflict?.decisionId === e.id && !a.decision;
  }
}

async function main() {
  const rounds = Number(process.env.ROUNDS ?? 2);
  let pass = 0, n = 0;
  const times: number[] = [];
  const fails: string[] = [];
  for (let r = 0; r < rounds; r++) {
    for (const c of CASES) {
      const t0 = Date.now();
      const a = await analyze({ chatId: "eng", threadId: null, text: c.text, author: "u1", context: ctx(c.context ?? []), tickets, decisions });
      times.push(Date.now() - t0);
      n++;
      if (score(a, c.expect)) pass++;
      else fails.push(`${c.text.slice(0, 50)} → expected ${c.expect.kind}, got ${JSON.stringify(a).slice(0, 160)}`);
    }
  }
  times.sort((x, y) => x - y);
  console.log(`listener eval ${LISTENER_MODEL}: ${pass}/${n} correct, median ${times[Math.floor(times.length / 2)]}ms, p90 ${times[Math.floor(times.length * 0.9)]}ms`);
  for (const f of fails) console.log("  ✗ " + f);
}
main().catch((e) => { console.error(e); process.exit(1); });
