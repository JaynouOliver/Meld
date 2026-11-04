import "server-only";

import type { ActionRecord, TicketOp } from "@/lib/agent/actions";
import { ATLAS_ID } from "@/lib/directory";
import { uid } from "@/lib/format";
import { FOLLOW_UP_AFTER_MS, linkKey, type OpenQuestion } from "@/lib/proactive";
import type { Store } from "@/lib/store";
import type { Ticket } from "@/lib/types";
import { suggestionId } from "../proactive/workload";

/**
 * Proactive Atlas in the Orbit Labs sandbox (docs/demo/proactive.md), already at work:
 * - Follow-ups: in the #design checklist thread, Maya asked Priya a question a day ago and
 *   Atlas followed up once. Tom's "Maya, any ETA?" in #growth is open and due, so the next
 *   sweep (any message) or "Check follow-ups now" posts its follow-up live.
 * - Linked threads: Maya's pricing mocks in #design are linked to Tom's pricing thread in #growth.
 * - Workload: Priya holds 5 open tickets and the team memory says she's out on Monday.
 *   Atlas suggested moving ORB-17 to Jonas (a pending confirm card in #engineering), and
 *   ORB-18 (due Monday, assigned to the visitor) is ready to be assigned to Priya live.
 */
export async function seedProactive(
  store: Store,
  x: {
    me: string;
    workspaceId: string;
    ch: Record<string, string>;
    posted: Record<string, { id: string; root: string | null }>;
    people: Record<"maya" | "jonas" | "priya" | "tom" | "sofia", string>;
  },
) {
  const { maya, jonas, priya, tom, sofia } = x.people;
  const { ch, posted } = x;
  if (!ch.engineering || !ch.design || !ch.growth || !posted.d1 || !posted.d2 || !posted.gr2) return;
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

  // 1. Follow-ups. One already posted (asked ~24h ago in the #design thread, never answered).
  const asked = await store.appendMessage(ch.design, {
    id: uid(), who: maya, time: ago(1458), text: "@Priya can you check the sidebar card still fits at 1280px wide before I hand it to engineering?",
  }, posted.d1.id);
  const followUpId = `fu${uid()}`;
  await store.appendMessage(ch.design, { id: followUpId, who: ATLAS_ID, time: ago(4), text: "@Priya, Maya's question about the sidebar card at 1280px is still open." }, posted.d1.id);
  const question = (q: Partial<OpenQuestion> & Pick<OpenQuestion, "chatId" | "threadId" | "messageId" | "asker" | "addressee" | "summary" | "askedAt">): OpenQuestion => ({
    id: `oq${q.messageId}`, status: "open", dueAt: new Date(Date.parse(q.askedAt) + FOLLOW_UP_AFTER_MS).toISOString(),
    followUpId: null, resolvedAt: null, resolvedBy: null, ...q,
  });
  await store.saveOpenQuestion(question({
    chatId: ch.design, threadId: posted.d1.id, messageId: asked.id, asker: maya, addressee: priya, summary: "the sidebar card at 1280px",
    askedAt: ago(1458), status: "followed_up", followUpId, resolvedAt: ago(4),
  }));
  // One open and due: Tom asked Maya for the pricing ETA in #growth. Due now so the demo
  // doesn't wait a day; the next sweep or "Check follow-ups now" posts it.
  await store.saveOpenQuestion(question({
    chatId: ch.growth, threadId: null, messageId: posted.gr2.id, asker: tom, addressee: maya, summary: "the ETA for final pricing (ORB-5)",
    askedAt: ago(80), dueAt: ago(1),
  }));

  // 2. Linked threads: Maya's pricing mocks (#design) and Tom's pricing-blocked emails (#growth).
  const linkReply = uid();
  await store.appendMessage(ch.design, {
    id: linkReply, who: ATLAS_ID, time: ago(44),
    text: `Related: this is also being discussed in #growth. Tom: "The email sequence (ORB-6) is waiting on final pricing from ORB-5." [[cite:${ch.growth}:-:${posted.gr2.id}]]`,
  }, posted.d2.id);
  await store.addThreadLink({
    key: linkKey(ch.design, posted.gr2.id), chatId: ch.design, messageId: posted.d2.id, toChatId: ch.growth, toMessageId: posted.gr2.id, replyId: linkReply, createdAt: ago(44),
  });

  // 3. Workload: Priya is busy (5 open) and out on Monday.
  const monday = nextMonday();
  const ids = [await store.nextTicketId(), await store.nextTicketId(), await store.nextTicketId(), await store.nextTicketId()];
  const base = (id: string, title: string, assignee: string, reporter: string, extra: Partial<Ticket>): Ticket => ({
    id, team: "engineering", title, description: "", status: "To do", priority: "Medium", assignee, reporter, links: [], images: [], updated: "Today",
    watch: null, blockedBy: [], labels: [], due: null, estimate: null, checklist: [], comments: [],
    activity: [{ who: "Someone", text: "created this ticket", time: ago(600) }], ...extra,
  });
  const [a11y, perf, mobile, email] = [
    base(ids[0], "Booking page accessibility fixes", priya, maya, {
      status: "In progress", description: "Focus order, labels on time slots, and contrast on the selected day.", labels: ["accessibility"], estimate: 3,
      activity: [{ who: "Maya Chen", text: "created this ticket", time: ago(2400) }],
    }),
    base(ids[1], "Settings page takes over 2 seconds to load", priya, jonas, {
      description: "Calendars list is fetched three times on mount.", labels: ["performance"], estimate: 2,
      activity: [{ who: "Jonas Weber", text: "created this ticket", time: ago(1800) }],
    }),
    base(ids[2], "Mobile layout for the weekly view", priya, sofia, {
      description: "The weekly view overflows under 400px; switch to a 3-day view on phones.", labels: ["mobile", "launch"], estimate: 5,
      watch: { chat: ch.engineering, thread: null },
      activity: [{ who: "Sofia Rossi", text: "created this ticket", time: ago(40) }, { who: "Sofia Rossi", text: "assigned it to Priya Raman", time: ago(26) }],
    }),
    base(ids[3], "Booking confirmation email template", x.me, x.me, {
      description: "HTML confirmation email with an .ics attachment. Needs an engineer before the beta invite goes out on Monday.",
      priority: "High", labels: ["launch"], due: monday, estimate: 2, watch: { chat: ch.engineering, thread: null },
      activity: [{ who: "Alex Rivera", text: "created this ticket", time: ago(30) }],
    }),
  ];
  for (const t of [a11y, perf, mobile, email]) await store.insertTicket(t);
  await store.addAgentMemory({ id: `mem${uid()}`, agentId: "team", text: "Priya Raman is out on Monday.", createdBy: priya, createdAt: ago(200) });

  // The pending suggestion for ORB-17, as balanceAssignment posts it.
  const id = suggestionId(x.workspaceId, mobile.id, priya);
  const op: TicketOp = { type: "update", before: structuredClone(mobile), after: { ...structuredClone(mobile), assignee: jonas }, changes: ["assignee → Jonas Weber"] };
  const action: ActionRecord = {
    id, chatId: ch.engineering, messageId: `${id}m`, status: "pending", ops: [op], destructive: false, undoUntil: null, createdAt: ago(25),
    // summarize() names people through the request's directory, which a seed doesn't have.
    summary: [`${mobile.id} “${mobile.title}”: assignee → Jonas Weber`],
  };
  await store.insertAction(action);
  await store.appendMessage(ch.engineering, {
    id: `${id}m`, who: ATLAS_ID, time: ago(25), ticket: mobile.id, actionId: id,
    text: `Priya now has 5 open tickets. Jonas has 2 open on Engineering. Reassign ${mobile.id} to Jonas?`,
  });
}

/** The next Monday after today (YYYY-MM-DD). */
function nextMonday(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== 1);
  return d.toISOString().slice(0, 10);
}
