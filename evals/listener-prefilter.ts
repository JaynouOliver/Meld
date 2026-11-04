/**
 * How many messages can the free prefilter skip, and does it ever skip one that
 * mattered? Labels a corpus of real chat messages with the model (ground truth), then
 * checks the prefilter against it: npm run eval:prefilter
 */
import fs from "node:fs";

import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type Directory } from "../src/lib/directory";
import { memoryStore } from "../src/lib/store/memory";
import type { TeamDecision } from "../src/lib/team-decisions";
import type { Ticket } from "../src/lib/types";
import { analyze } from "../src/server/listener/analyze";
import { mayMatter } from "../src/server/listener/prefilter";

const person = (id: string, name: string) => ({ id, name, first: name, initials: name[0], color: "#000", team: "eng", isAgent: false });
const dir: Directory = {
  workspace: { id: "ws-pf", name: "Eval", slug: "eval", ticketPrefix: "ORB", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "atlas"], teams: [{ id: "eng", name: "Engineering" }] as Directory["teams"],
  people: { u1: person("u1", "Ada Lee"), u2: person("u2", "Bo Chen"), atlas: ATLAS },
  agents: [ATLAS_AGENT],
  chats: { eng: { id: "eng", kind: "channel", label: "product", topic: "", team: null, members: [], agents: [{ id: "atlas", mode: "mention" }] } },
  channels: ["eng"], dms: [], home: "eng", memberships: [], demo: false,
};
setCtxProvider(() => ({ dir, store: memoryStore("ws-pf", "ORB") }) as RequestCtx);
const t = (id: string, assignee: string, title: string): Ticket => ({
  id, team: "eng", title, description: "", status: "To do", priority: "Medium", assignee, reporter: "u1", links: [], images: [], updated: "", watch: null, blockedBy: [], activity: [],
});
const tickets = [
  t("ORB-1", "u1", "Record the 2-minute demo video"), t("ORB-2", "u1", "Stripe webhooks for plan upgrades"), t("ORB-3", "u2", "Pricing page refresh"),
  t("ORB-4", "u2", "Launch email sequence"), t("ORB-5", "u1", "Pricing page design"), t("ORB-6", "u2", "Launch email sequence"), t("ORB-9", "u1", "Product Hunt launch kit"),
];
const decisions: TeamDecision[] = [{
  id: "td1", topic: "Onboarding checklist placement", statement: "The onboarding checklist is a sidebar card with 4 steps, not a modal.", rationale: "", rejected: ["Modal on first login"],
  deciders: ["u1"], chatId: "eng", threadId: null, messageId: "m0", status: "active", supersededBy: null, flags: 0, lastFlaggedAt: null, source: "chat", createdAt: "2026-10-30T10:00:00Z",
}];

async function main() {
  const corpus: string[] = JSON.parse(fs.readFileSync("evals/data/chat-corpus.json", "utf8"));
  let positives = 0, caught = 0, skipped = 0;
  const missed: string[] = [];
  const labels = await Promise.all(
    corpus.map(async (text) => {
      const a = await analyze({ chatId: "eng", threadId: null, text, author: "u1", context: [], tickets, decisions });
      return !!(a.decision || a.conflict || a.updates.length || a.commitment);
    }),
  );
  corpus.forEach((text, i) => {
    const pass = mayMatter(text, decisions, "ORB");
    if (!pass) skipped++;
    if (labels[i]) {
      positives++;
      if (pass) caught++;
      else missed.push(text);
    }
  });
  console.log(`corpus ${corpus.length} messages · model says ${positives} matter · prefilter keeps ${caught}/${positives} of those (recall ${Math.round((caught / positives) * 100)}%) · skips ${skipped}/${corpus.length} (${Math.round((skipped / corpus.length) * 100)}%) without a model call`);
  for (const m of missed) console.log("  missed: " + m);
  const kept = corpus.filter((x) => mayMatter(x, decisions, "ORB"));
  console.log(`  kept but model found nothing: ${kept.filter((x) => !labels[corpus.indexOf(x)]).length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
