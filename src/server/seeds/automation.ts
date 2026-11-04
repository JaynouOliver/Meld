import "server-only";

import { UNDO_WINDOW_MS } from "@/lib/agent/actions";
import { playbookRunId, stepHeader, stepRunId, type Playbook } from "@/lib/automation";
import { ATLAS_ID } from "@/lib/directory";
import { uid } from "@/lib/format";
import type { Store } from "@/lib/store";
import type { Ticket } from "@/lib/types";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/**
 * Workflow automation, already at work in the sandbox:
 * - "Bug intake" (ticket labeled bug → Tess, Rex, Atlas), enabled, with one completed run
 *   in #engineering on a booking bug that Tess auto-triaged first (labels, priority, owner).
 * - A feature request Tess auto-triaged (the "Triaged by Tess" note on the ticket).
 * The live demo: New ticket → "Checkout fails for EU cards with 3DS" → Tess fills it in,
 * labels it bug, and Bug intake starts.
 */
export async function seedAutomation(
  store: Store,
  x: { me: string; ch: Record<string, string>; ag: Record<string, string>; ids: string[]; people: Record<"jonas" | "priya" | "sofia", string> },
) {
  const tess = x.ag.triage;
  const rex = x.ag.reviewer;
  const eng = x.ch.engineering;
  if (!tess || !rex || !eng) return;
  const { jonas, priya, sofia } = x.people;
  const weekly = x.ids[7] ?? "ORB-8"; // "Timezone bug in weekly view", fixed last week

  const pb: Playbook = {
    id: `pbk${uid()}`, name: "Bug intake", trigger: { kind: "label", label: "bug" }, enabled: true, chatId: eng, createdBy: x.me, createdAt: ago(2900), updatedAt: ago(2900),
    steps: [
      { agentId: tess, instruction: "Confirm steps to reproduce and set severity" },
      { agentId: rex, instruction: "Assess rollout risk of the fix" },
      { agentId: ATLAS_ID, instruction: "Assign the right owner and post a summary" },
    ],
  };
  await store.savePlaybook(pb);

  // 1. A feature request, auto-triaged (no playbook: it isn't a bug).
  const featId = await store.nextTicketId();
  const feat: Ticket = {
    id: featId, team: "engineering", title: "Outlook calendar sync", status: "To do", priority: "Medium", assignee: jonas, reporter: sofia,
    description: "Three enterprise trials asked for Outlook / Microsoft 365 alongside Google Calendar.", links: [], images: [], updated: "Today", watch: null,
    blockedBy: [], labels: ["integrations"], due: null, estimate: null,
    activity: [
      { who: "Sofia Rossi", text: "created this ticket", time: ago(240) },
      { who: "Tess", text: "triaged it: labels integrations · owner Jonas (owns calendar sync)", time: ago(240) },
    ],
  };
  await store.insertTicket(feat);
  await seedTriage(store, feat, tess, sofia, "labels integrations · owner Jonas (owns calendar sync)", "Same integration work as the Google sync Jonas is finishing; not launch-blocking.", eng, 240);

  // 2. A bug: auto-triaged (labeled bug), which started Bug intake; all three steps done.
  const bugId = await store.nextTicketId();
  const root = await store.appendMessage(eng, {
    id: uid(), who: priya, time: ago(36),
    text: `Invitees in Berlin see booking times an hour off since the DST change. Filed ${bugId} so we don't lose it.`,
  });
  const bug: Ticket = {
    id: bugId, team: "engineering", title: "Booking page shows wrong time for invitees after DST", status: "In progress", priority: "High", assignee: priya, reporter: priya,
    description: "Invitees in Europe see slots one hour off since Oct 27. Reported by two customers.", links: [], images: [], updated: "Today",
    watch: { chat: eng, thread: root.id }, blockedBy: [], labels: ["bug"], due: null, estimate: 2,
    activity: [
      { who: "Priya Raman", text: "created this ticket", time: ago(36) },
      { who: "Tess", text: "triaged it: labels bug · priority High", time: ago(36) },
      { who: "Tess", text: "added a checklist: steps to reproduce", time: ago(34) },
      { who: "Atlas", text: "kept Priya as owner (owns the booking page) and posted a summary", time: ago(29) },
      { who: "Priya Raman", text: "moved it to In progress", time: ago(18) },
    ],
    checklist: [
      { id: "rp1", text: "Set an event type to Europe/Berlin, availability 9:00-17:00", done: true },
      { id: "rp2", text: "Open the booking page as an invitee in Europe/Berlin", done: true },
      { id: "rp3", text: "First slot shows 10:00 instead of 9:00 (after Oct 27)", done: false },
    ],
  };
  await store.insertTicket(bug);
  await seedTriage(store, bug, tess, priya, "labels bug · priority High", "Customers are booking the wrong slot; owner already set.", eng, 36, root.id);

  const key = `${pb.id}|${bugId}|label`;
  const runId = playbookRunId(key);
  const posts: [string, string, number][] = [
    [tess, `Steps to reproduce, confirmed from Priya's report and ${weekly} (the weekly view had the same cause):
• Event type in Europe/Berlin, availability 9:00-17:00
• Open the booking page as an invitee in Europe/Berlin, pick any date after Oct 27
• First slot shows 10:00; expected 9:00
Severity: High. Customers book the wrong time and miss meetings. Added the steps as a checklist on ${bugId}.`, 34],
    [rex, `Rollout risks for the fix:
• Existing bookings made after Oct 27 are already stored an hour off: the fix needs a one-off migration, or they move silently.
• Recurring events that cross the DST boundary: test one weekly series spanning Oct 27.
• Ship behind a flag for one day and compare booked vs. shown times before turning it on for everyone.`, 31],
    [ATLAS_ID, `Summary of ${bugId}: invitee slots shift by an hour after DST (High). Priya owns it: she fixed the same cause in the weekly view (${weekly}) and owns the booking page. Rex's migration and flag notes are the plan. Nothing else is blocked by it.`, 29],
  ];
  const runIds: string[] = [];
  for (const [i, [who, text, min]] of posts.entries()) {
    const id = stepRunId(runId, i);
    runIds.push(id);
    await store.appendMessage(eng, { id: `${id}h`, who, time: ago(min + 1), text: `**${stepHeader(pb.name, i, posts.length)}** · ${pb.steps[i].instruction}`, ticket: i === 0 ? bugId : null }, root.id);
    await store.appendMessage(eng, { id: `${id}r`, who, time: ago(min), text }, root.id);
  }
  await store.appendMessage(eng, { id: uid(), who: priya, time: ago(20), text: "Thanks, taking it. I'll do the migration in the same PR." }, root.id);
  await store.claimPlaybookRun({
    id: runId, playbookId: pb.id, playbookName: pb.name, ticketId: bugId, chatId: eng, threadId: root.id, step: 3, total: 3, status: "done", error: null,
    runIds, requester: priya, createdAt: ago(36), updatedAt: ago(29), finishedAt: ago(29),
  });
}

/** The triage record behind the ticket's "Triaged by Tess" note (past its undo window). */
async function seedTriage(store: Store, t: Ticket, agent: string, by: string, summary: string, reason: string, chat: string, min: number, thread?: string) {
  const actionId = `act${uid()}`;
  const before: Ticket = { ...t, labels: [], priority: "Medium", assignee: by };
  await store.insertAction({
    id: actionId, chatId: chat, messageId: thread ? `${actionId}m` : null, status: "applied", destructive: false,
    ops: [{ type: "update", before, after: t, changes: summary.split(" · ") }], summary: [`${t.id}: ${summary}`],
    undoUntil: new Date(Date.parse(ago(min)) + UNDO_WINDOW_MS).toISOString(), createdAt: ago(min),
  });
  if (thread) {
    await store.appendMessage(chat, { id: `${actionId}m`, who: agent, time: ago(min), text: `Triaged ${t.id}: ${summary}. ${reason}`, actionId }, thread);
  }
  await store.saveTriage({ ticketId: t.id, agentId: agent, actionId, status: "applied", summary, reason, by, createdAt: ago(min) });
}
