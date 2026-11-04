import "server-only";

import type { ActionRecord, TicketOp } from "@/lib/agent/actions";
import { ATLAS_ID } from "@/lib/directory";
import { uid } from "@/lib/format";
import type { Store } from "@/lib/store";
import type { Priority, Ticket } from "@/lib/types";

/**
 * Meeting notes to actions, already used once: yesterday's "Pricing sync" was processed
 * in #product. Atlas's notes message is there (summary, decisions, action items with
 * owners and dates, open questions), its three decisions are in the decision log, and
 * the action items are filed tickets (one reused: the pricing page already had ORB-5).
 * The live demo pastes a different meeting (docs/demo/meeting-notes.md).
 */
export async function seedMeetingNotes(
  store: Store,
  x: { me: string; product: string; people: { maya: string; jonas: string; priya: string; tom: string; sofia: string } },
) {
  const { me, product } = x;
  const { maya, jonas, priya, tom, sofia } = x.people;
  if (!product) return;
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const yesterday = new Date(Date.now() - 86400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const title = `Pricing sync, ${yesterday}`;
  // Sofia shared yesterday's notes this morning.
  const postedAt = 35;
  const messageId = `mn${uid()}`;

  // Action items filed from the notes, as Confirm would have filed them.
  const items: { who: string; first: string; team: string; title: string; desc: string; due: number; priority: Priority }[] = [
    { who: jonas, first: "Jonas", team: "engineering", title: "Create Pro and Team prices in Stripe", desc: "Pro $12 and Team $20 per seat per month, plus the annual prices at 20% off. Test mode first.", due: 2, priority: "High" },
    { who: priya, first: "Priya", team: "engineering", title: "Gate team scheduling links behind the Team plan", desc: "Round-robin and collective links need Team; Free keeps one personal link. Show an upgrade prompt instead of an error.", due: 6, priority: "High" },
    { who: sofia, first: "Sofia", team: "product", title: "Email beta users about their locked-in price", desc: "Beta users keep today's price for 12 months. One short email before launch, with the date it ends.", due: 5, priority: "Medium" },
    { who: tom, first: "Tom", team: "growth", title: "Pricing comparison table for the launch post", desc: "Orbit vs Calendly vs Cal.com on the three plans, for the launch blog post and Product Hunt.", due: 4, priority: "Medium" },
  ];
  const ids: string[] = [];
  for (let i = 0; i < items.length; i++) ids.push(await store.nextTicketId());
  const tickets: Ticket[] = items.map((it, i) => ({
    id: ids[i], team: it.team, title: it.title, status: "To do", priority: it.priority, assignee: it.who, reporter: ATLAS_ID,
    description: `${it.desc}\n\nFrom the meeting notes "${title}" shared by Sofia Rossi in #product.`,
    links: [], images: [], updated: "Yesterday", blockedBy: [], due: inDays(it.due), watch: { chat: product, thread: null },
    activity: [
      { who: "Atlas", text: `created this from the meeting notes "${title}" (shared by Sofia Rossi)`, time: ago(postedAt - 3) },
    ],
  }));
  await Promise.all(tickets.map((t) => store.insertTicket(t)));

  const decisions = [
    {
      topic: "Paid plan prices", statement: "Pro is $12 per seat per month and Team is $20; annual plans are 20% off.",
      rationale: "Keeps Pro under Calendly while Team pays for the admin features.", rejected: ["$15 flat per seat"], deciders: [sofia, me, tom],
    },
    {
      topic: "Team links plan gating", statement: "Team scheduling links are on the Team plan only; Free keeps one personal link.",
      rationale: "Team links are the main reason teams upgrade.", rejected: ["Three free links on Free"], deciders: [sofia, priya, me],
    },
    {
      topic: "Beta user pricing", statement: "Beta users keep their current price for 12 months after launch.",
      rationale: "We promised early users a thank-you, and it costs little at our size.", rejected: ["Move everyone to new prices at launch"], deciders: [sofia, me],
    },
  ];
  const names: Record<string, string> = { [me]: "Alex", [maya]: "Maya", [jonas]: "Jonas", [priya]: "Priya", [tom]: "Tom", [sofia]: "Sofia" };

  const text = [
    `**Notes: ${title}**`,
    [
      "Launch pricing is set: Pro $12 and Team $20 per seat, annual plans 20% off.",
      "Team scheduling links are the upgrade hook; beta users keep their price for a year.",
      "Stripe prices, plan gating and the beta email land this week, before the launch on the 18th.",
    ].join("\n"),
    "From notes shared by Sofia Rossi.",
    `**Decisions** (logged to the decision log)\n${decisions.map((d) => `- ${d.statement} Why: ${d.rationale} (${d.deciders.map((p) => names[p]).join(", ")})`).join("\n")}`,
    `**Action items**\n${[
      ...items.map((it, i) => `- @${it.first} ${it.title}, due ${fmtDay(inDays(it.due))} → ${ids[i]}`),
      "- @Maya Pricing page refresh: already tracked in ORB-5",
    ].join("\n")}`,
    "**Open questions**\n- @Jonas Do seat changes prorate mid-cycle, or bill at renewal?\n- @Sofia Do we offer a nonprofit discount at launch?",
    "Confirm below to file all 4 tickets with owners and dates.",
  ].join("\n\n");

  const ops: TicketOp[] = tickets.map((t) => ({ type: "create", after: t }));
  const action: ActionRecord = {
    id: `act${uid()}`, chatId: product, messageId, status: "applied", ops,
    summary: tickets.map((t, i) => `Create ${t.id} “${t.title}”, assigned to ${items[i].first}, due ${fmtDay(t.due!)}`),
    destructive: false, undoUntil: null, createdAt: ago(postedAt),
  };
  await store.insertAction(action);
  await store.appendMessage(product, { id: messageId, who: ATLAS_ID, time: ago(postedAt), text, actionId: action.id });

  for (const d of decisions) {
    await store.saveTeamDecision({
      id: `td${uid()}`, ...d, chatId: product, threadId: null, messageId, status: "active", supersededBy: null,
      flags: 0, lastFlaggedAt: null, source: "chat", createdAt: ago(postedAt),
    });
  }
  // Sofia confirmed the card right after, so the tickets were filed by her click.
  await store.react(messageId, "👍", sofia, true).catch(() => {});
}
