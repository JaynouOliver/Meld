import "server-only";

import { playbookRunId, stepHeader, stepRunId, type Playbook } from "@/lib/automation";
import { mentionNotice } from "@/lib/agent/comment-mentions";
import { ATLAS_ID, type Directory } from "@/lib/directory";
import { uid } from "@/lib/format";
import type { Store } from "@/lib/store";
import type { Ticket } from "@/lib/types";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/**
 * Comment @mentions and the keyword playbook, already at work in the sandbox:
 * - ORB-4 (Stripe webhooks): Jonas asks @Alex in a comment (Atlas's notice is in Alex's
 *   Atlas DM), and Alex asked @rex on the ticket, with Rex's answer as a comment.
 * - "Incident" playbook: #engineering, keyword "outage" → Tess opens an incident ticket,
 *   Rex lists checks and the rollback, Atlas drafts a #general update. One finished run
 *   from a short calendar-sync outage earlier today.
 * Live: comment "@rex …" on a ticket; type "We have an outage: login is failing for some
 * users" in #engineering.
 */
export async function seedAgentGaps(
  store: Store,
  x: { me: string; ch: Record<string, string>; ag: Record<string, string>; ids: string[]; atlasDm: string; people: Record<"jonas" | "priya", string> },
) {
  const tess = x.ag.triage;
  const rex = x.ag.reviewer;
  const eng = x.ch.engineering;
  if (!tess || !rex || !eng) return;
  const { jonas, priya } = x.people;

  // ---------------------------------------------------------------- comment mentions
  const webhooks = await store.getTicket(x.ids[3] ?? "ORB-4");
  if (webhooks) {
    const people = { [jonas]: { name: "Jonas Weber" } } as unknown as Directory["people"];
    const ask = "@Alex retries are in: we back off 1, 5 and 25 minutes and give up after the third try. Is that window OK for billing support?";
    webhooks.comments = [
      ...(webhooks.comments ?? []),
      { id: `cm${uid()}`, who: jonas, time: ago(70), text: ask },
      { id: `cm${uid()}`, who: x.me, time: ago(52), text: "@rex is three retries enough, or could a retry charge someone twice?" },
      {
        id: `cm${uid()}`, who: rex, time: ago(51),
        text: `@Alex No double charge: checkout.session.completed is idempotent on the event id, so a retried event can't apply twice.
• The real gap: three tries over 31 minutes means a longer Stripe incident drops upgrades silently.
• Add a nightly reconcile against Stripe subscriptions, and alert #engineering when an event exhausts its retries.`,
      },
    ];
    await store.saveTicket(webhooks);
    await store.appendMessage(x.atlasDm, { id: uid(), who: ATLAS_ID, time: ago(70), text: mentionNotice({ people }, jonas, webhooks, ask) });
  }

  // ---------------------------------------------------------------- keyword playbook
  const pb: Playbook = {
    id: `pbk${uid()}`, name: "Incident", trigger: { kind: "keyword", chatId: eng, keyword: "outage" }, enabled: true, chatId: eng,
    createdBy: x.me, createdAt: ago(2800), updatedAt: ago(2800),
    steps: [
      { agentId: tess, instruction: "Open an incident ticket with severity and owner" },
      { agentId: rex, instruction: "List the first 3 checks and the rollback plan" },
      { agentId: ATLAS_ID, instruction: "Post a status update for #general" },
    ],
  };
  await store.savePlaybook(pb);

  // Earlier today: a short calendar-sync outage, handled and closed (seeds post in time order, so it's the latest in #engineering).
  const text = "Calendar sync outage: Google push notifications started failing with 401s a few minutes ago, so new events aren't syncing.";
  const root = await store.appendMessage(eng, { id: uid(), who: jonas, time: ago(17), text });
  const incId = await store.nextTicketId();
  const incident: Ticket = {
    id: incId, team: "engineering", title: "Incident: Google Calendar push notifications failing (401)", status: "Done", priority: "High", assignee: jonas, reporter: tess,
    description: "Severity: High (SEV-2). New events stop syncing to Google for every connected calendar. Started by Jonas's report in #engineering.",
    links: [], images: [], updated: "Today", watch: { chat: eng, thread: root.id }, blockedBy: [], labels: ["incident", "integrations"], due: null, estimate: null,
    activity: [
      { who: "Tess", text: "created this ticket", time: ago(16) },
      { who: "Jonas Weber", text: "moved it to Done", time: ago(6) },
    ],
  };
  await store.insertTicket(incident);
  const runId = playbookRunId(`${pb.id}|msg|${root.id}`);
  const posts: [string, string, number][] = [
    [tess, `Opened ${incId} for this.
• Severity: High (SEV-2). Every connected Google calendar stops receiving new events.
• Owner: Jonas, who owns calendar sync (ORB-1).
• Started a few minutes ago; no customer reports yet.`, 16],
    [rex, `First checks, in order:
• Did the OAuth client secret or the push channel token just rotate? Sudden 401s point there.
• Are the watch channels expired? They last 7 days; renewals run nightly.
• Is only push failing, or the pull with sync tokens too? If pull works, users only see a delay.
Rollback: revert today's sync worker deploy (PR 214), then re-register the watch channels.`, 14],
    [ATLAS_ID, `Status update for #general:
• Calendar sync is delayed: new events aren't reaching Google Calendar right now.
• Existing bookings are safe, and nothing needs to be re-entered.
• Jonas is on it (${incId}). Next update within 30 minutes.`, 12],
  ];
  const runIds: string[] = [];
  for (const [i, [who, body, min]] of posts.entries()) {
    const id = stepRunId(runId, i);
    runIds.push(id);
    await store.appendMessage(eng, { id: `${id}h`, who, time: ago(min + 1), text: `**${stepHeader(pb.name, i, posts.length)}** · ${pb.steps[i].instruction}` }, root.id);
    await store.appendMessage(eng, { id: `${id}r`, who, time: ago(min), text: body, ticket: i === 0 ? incId : null }, root.id);
  }
  await store.appendMessage(eng, { id: uid(), who: jonas, time: ago(9), text: "Found it: the client secret rotated this morning and the worker still had the old one. Updated it and re-registered the channels; sync is catching up." }, root.id);
  await store.appendMessage(eng, { id: uid(), who: priya, time: ago(6), text: "Confirmed on my calendar, events are flowing again. Closing it." }, root.id);
  await store.claimPlaybookRun({
    id: runId, playbookId: pb.id, playbookName: pb.name, ticketId: "", chatId: eng, threadId: root.id, step: 3, total: 3, status: "done", error: null,
    runIds, requester: jonas, createdAt: ago(17), updatedAt: ago(12), finishedAt: ago(12),
    messageId: root.id, messageText: text, messageAuthor: jonas,
  });
}
