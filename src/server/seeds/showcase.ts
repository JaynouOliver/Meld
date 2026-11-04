import "server-only";

import type { ActionRecord } from "@/lib/agent/actions";
import { ATLAS_ID } from "@/lib/directory";
import { uid } from "@/lib/format";
import type { Store } from "@/lib/store/types";
import type { Message, Ticket } from "@/lib/types";

/**
 * The demo shows every feature in a real conversation, and #tour indexes them: one card
 * per feature with a chip that jumps to where it happens and what to type to try it.
 * Runs last in createSandbox, so it can point at what the other seeds posted.
 */
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
/** The coming Friday (or next week's, on a Friday). */
function friday() {
  const d = new Date();
  const add = ((5 - d.getUTCDay() + 7) % 7) || 7;
  return day(add);
}

type Ref = { chat: string; thread: string | null; id: string };
const cite = (r: Ref | null) => (r ? `[[cite:${r.chat}:${r.thread ?? "-"}:${r.id}]]` : "");

export async function seedShowcase(
  store: Store,
  x: {
    me: string;
    ch: Record<string, string>;
    ag: Record<string, string>;
    ids: string[];
    posted: Record<string, { id: string; root: string | null }>;
    people: Record<"maya" | "jonas" | "priya" | "tom" | "sofia", string>;
    tour: string;
    atlasDm: string;
  },
) {
  const { maya, jonas, priya, tom, sofia } = x.people;
  const { ch, ag, ids, posted, me } = x;
  const orb = (n: number) => ids[n - 1];
  // Tickets other seeds made: found by title (their numbers depend on seed order).
  const existing = await store.listTickets();
  const byTitle = (re: RegExp) => existing.find((t) => re.test(t.title))?.id;
  const demoVideo = byTitle(/2-minute demo video/) ?? "the demo video";
  const alerts = byTitle(/Failed-payment alerts/) ?? "the failed-payment alerts";
  const tess = ag.triage;
  const ticket = (t: Partial<Ticket> & Pick<Ticket, "id" | "title" | "team" | "assignee">): Ticket => ({
    description: "", status: "To do", priority: "Medium", reporter: ATLAS_ID, links: [], images: [], updated: "Today", watch: null, blockedBy: [], activity: [], ...t,
  });
  const applied = async (chatId: string, messageId: string, ops: ActionRecord["ops"], summary: string[]) => {
    const a: ActionRecord = { id: `act${uid()}`, chatId, messageId, status: "applied", ops, summary, destructive: false, undoUntil: null, createdAt: ago(1) };
    await store.insertAction(a);
    return a.id;
  };
  const say = (chat: string, who: string, min: number, text: string, thread: string | null = null, extra: Partial<Message> = {}) =>
    store.appendMessage(chat, { id: uid(), who, time: ago(min), text, ...extra }, thread);

  // ── #engineering: ask Atlas, and Tess filing a bug nobody tagged her on ──────────────
  const ask = await say(ch.engineering, me, 48, "@atlas what's blocking the paid plans launch, and who owns it?");
  const answer = await say(
    ch.engineering, ATLAS_ID, 47.8,
    `Two chains hold the launch:\n- ${orb(7)} (in-app upgrade flow, Priya) is blocked by ${orb(4)} (Stripe webhooks, Jonas). Jonas expects webhooks Thursday ${cite({ chat: ch.engineering, thread: null, id: posted.e6.id })}\n- ${orb(6)} (launch emails, Tom) waits on ${orb(5)} (pricing page, Maya), which is past its date ${cite({ chat: ch.growth, thread: null, id: posted.gr2.id })}\nUnblocking ${orb(5)} first frees the most work.`,
  );
  const safari = await say(ch.engineering, jonas, 30, "Checkout is broken on Safari: the Pay button does nothing after the card form loads");
  await store.react(safari.id, "👀", tess, true).catch(() => {});
  const bugId = await store.nextTicketId();
  await store.insertTicket(ticket({
    id: bugId, title: "Safari checkout: Pay button does nothing after the card form loads", team: "engineering", assignee: priya, priority: "High", reporter: tess,
    labels: ["bug", "billing"], watch: { chat: ch.engineering, thread: safari.id },
    description: "Steps: Safari 17 on macOS, pick Pro, enter a test card, click Pay: nothing happens, no network request. Chrome and Firefox work.\nImpact: Safari is about a third of checkout traffic.",
    activity: [{ who: "Tess", text: "created this ticket from Jonas's report in #engineering", time: ago(29) }],
  }));
  const tessReply = await say(
    ch.engineering, tess, 29,
    `Filed ${bugId} for Engineering, High, assigned to Priya (frontend owns checkout). Steps: Safari 17, pick Pro, test card, Pay: no request fires. Chrome and Firefox are fine. @Jonas, does it happen with Apple Pay too?`,
    safari.id, { ticket: bugId },
  );
  const formatted = await say(
    ch.engineering, jonas, 26,
    `**Rollout checklist** for ${orb(4)}:\n- signature verification ✅\n- idempotency keys on \`checkout.session.completed\`\n- _then_ the \`customer.subscription.updated\` handler`,
  );
  await store.react(formatted.id, "🙌", priya, true).catch(() => {});

  // ── #product: thread → tickets, a thread summary, and a status said in chat ─────────
  const p3 = posted.p3.id;
  const toTickets = await say(ch.product, me, 44, "@atlas turn this thread into tickets and assign everyone", p3);
  const notesId = await store.nextTicketId();
  const releaseNotes = ticket({
    id: notesId, title: "Release notes and changelog page", team: "product", assignee: sofia, due: friday(), watch: { chat: ch.product, thread: p3 },
    description: "From the Q4 launch plan thread: Sofia writes the release notes and the changelog page.",
    activity: [{ who: "Atlas", text: "created this ticket from the Q4 launch plan thread", time: ago(43) }],
  });
  await store.insertTicket(releaseNotes);
  const filedId = uid();
  const filedAction = await applied(ch.product, filedId, [{ type: "create", after: releaseNotes }], [`Create ${notesId} “Release notes and changelog page”, assigned to Sofia Rossi`]);
  const filed = await store.appendMessage(ch.product, {
    id: filedId, who: ATLAS_ID, time: ago(43), actionId: filedAction,
    text: `Everyone in this thread has a ticket:\n- Maya: ${orb(5)} pricing page (already tracked)\n- Tom: ${orb(6)} launch emails and ${orb(9)} Product Hunt kit (already tracked)\n- Priya: ${orb(7)} upgrade banner (already tracked)\n- Jonas: ${orb(4)} webhooks and ${alerts} (already tracked)\n- Sofia: ${notesId} release notes and changelog page (new, due ${fmt(friday())})\n- Alex: ${demoVideo} (already tracked)`,
  }, p3);
  const summary = await say(
    ch.product, ATLAS_ID, 40,
    `**Thread summary**\n**TL;DR** Everyone owns a piece of the Q4 launch on the 18th; pricing (${orb(5)}) gates the emails, webhooks (${orb(4)}) gate the upgrade flow.\n**Decisions** None new here; pricing was settled in the pricing sync.\n**Owners and next steps**\n- Maya: pricing page, Wednesday\n- Jonas: webhooks Thursday, then failed-payment alerts\n- Priya: upgrade banner after webhooks\n- Tom: launch emails and Product Hunt post\n- Sofia: release notes and changelog (${notesId})\n- Alex: 2-minute demo video\n**Open questions** Who signs off the launch emails before they go out?`,
    p3,
  );
  const started = await say(ch.product, sofia, 25, "Started on the onboarding funnel events today, the first ones are in staging");
  const t10 = await store.getTicket(orb(10));
  let liveUpdate: Message | null = null;
  if (t10) {
    const after = { ...t10, status: "In progress" as const, updated: "Just now", activity: [...t10.activity, { who: "Atlas", text: "To do → In progress (from Sofia's message)", time: ago(24.9) }] };
    await store.saveTicket(after);
    const upId = uid();
    const upAction = await applied(ch.product, upId, [{ type: "update", before: t10, after, changes: ["To do → In progress"] }], [`${t10.id} “${t10.title}”: To do → In progress`]);
    liveUpdate = (await store.appendMessage(ch.product, { id: upId, who: ATLAS_ID, time: ago(24.8), text: `Updated ${t10.id} from your message: To do → In progress.`, ticket: t10.id, actionId: upAction }, started.id)) as Message;
  }

  // ── #growth: a promise becomes a ticket ─────────────────────────────────────────────
  const promise = await say(ch.growth, tom, 20, `I'll write the referral program FAQ by Friday`);
  const faqId = await store.nextTicketId();
  const faq = ticket({
    id: faqId, title: "Write the referral program FAQ", team: "growth", assignee: tom, due: friday(), reporter: ATLAS_ID, watch: { chat: ch.growth, thread: promise.id },
    description: `Tom committed to this in chat: "I'll write the referral program FAQ by Friday"`,
    activity: [{ who: "Atlas", text: "created this from Tom's message", time: ago(19.9) }],
  });
  await store.insertTicket(faq);
  const trackId = uid();
  const trackAction = await applied(ch.growth, trackId, [{ type: "create", after: faq }], [`Create ${faqId} “Write the referral program FAQ”, assigned to Tom Okafor`]);
  const tracked = await store.appendMessage(ch.growth, { id: trackId, who: ATLAS_ID, time: ago(19.8), text: `Tracking it: ${faqId} "Write the referral program FAQ" for Tom, due ${fmt(friday())}.`, ticket: faqId, actionId: trackAction }, promise.id);

  // ── #design: the decision is logged, and someone proposes the opposite ──────────────
  const d1 = posted.d1.id;
  const decided = await say(ch.design, ATLAS_ID, 1459, "📌 Logged as a decision: the onboarding checklist is a sidebar card with 4 steps that disappears when done, not a modal. I'll point people back to it if it comes up again.", d1);
  const proposal = await say(ch.design, tom, 18, "What if we make the onboarding checklist a modal on first login instead? Feels cleaner");
  const guard = await say(
    ch.design, ATLAS_ID, 17.9,
    `Heads-up: the team already decided this on ${fmt(ago(1460).slice(0, 10))} (Maya, Priya, Sofia, Alex): the onboarding checklist is a sidebar card with 4 steps, not a modal. Why: modals get dismissed and forgotten; a persistent card keeps setup visible until it's finished. ${cite({ chat: ch.design, thread: d1, id: posted.d1d.id })}\nIf that's changed, say what you're deciding now and I'll log the new decision.`,
    proposal.id,
  );
  for (const d of await store.listTeamDecisions()) {
    if (/sidebar card/i.test(d.statement)) await store.saveTeamDecision({ ...d, flags: d.flags + 1, lastFlaggedAt: ago(17.9) });
  }

  // ── #general: an edit, reactions ────────────────────────────────────────────────────
  await store.updateMessage(posted.g3.id, { editedAt: ago(250) }).catch(() => {});
  for (const [who, e] of [[maya, "🎉"], [jonas, "🎉"], [sofia, "🎉"], [priya, "🚀"]] as const) await store.react(posted.g4.id, e, who, true).catch(() => {});

  // ── Atlas DM: catch-up, memory, a reminder ──────────────────────────────────────────
  const dm = x.atlasDm;
  await say(dm, me, 14, "What did I miss?");
  const catchUp = await say(
    dm, ATLAS_ID, 13.9,
    `Since yesterday:\n- **#engineering** Tess filed ${bugId} (Safari checkout) for Priya ${cite({ chat: ch.engineering, thread: safari.id, id: tessReply.id })}. Rex reviewed the failed-payment alerts plan.\n- **#product** Pricing is set (Pro $12, Team $20, annual 20% off); 4 tickets came out of the pricing sync. Sofia started ${orb(10)}.\n- **#design** Tom proposed a modal for onboarding; I pointed him to the sidebar-card decision ${cite({ chat: ch.design, thread: proposal.id, id: guard.id })}.\n- **For you** Sofia needs your sign-off on ${orb(12)} by Friday, and Jonas asked you to test ${orb(1)}.`,
  );
  await say(dm, me, 11, "remember that Maya is out on Fridays");
  await say(dm, ATLAS_ID, 10.9, "Got it. I'll remember that for the whole team: Maya Chen is out on Fridays.");
  await say(dm, me, 10, "who can review the pricing page this Friday?");
  const memoryAnswer = await say(dm, ATLAS_ID, 9.9, `Not Maya: she's out on Fridays. Sofia is the best fit: she owns pricing decisions and ran the pricing sync. Tom can check the copy, since his launch emails (${orb(6)}) depend on it.`);
  await say(dm, me, 8, "remind me tomorrow at 9 to send the investor deck");
  const tomorrow9 = new Date(`${day(1)}T09:00:00Z`).toISOString();
  await store.addReminder({
    id: `rm${uid()}`, createdBy: me, target: { kind: "person", id: me }, text: "send the investor deck", dueAt: tomorrow9, timeZone: "UTC",
    status: "pending", attempts: 0, source: null, createdAt: ago(8), sentAt: null,
  }).catch(() => {});
  const reminderSet = await say(dm, ATLAS_ID, 7.9, `Reminder set for ${fmt(day(1))}, 9:00 AM UTC: send the investor deck. I'll post it here. You can cancel it on your page (click your name, bottom-left).`);

  // ── #tour: every feature, with a jump to where it happens ───────────────────────────
  const find = async (chat: string, test: (m: { who: string; text: string }) => boolean): Promise<Ref | null> => {
    for (const m of await store.listMessages(chat, { limit: 200 })) {
      if (test(m)) return { chat, thread: null, id: m.id };
      for (const r of m.replies) if (test(r)) return { chat, thread: m.id, id: r.id };
    }
    return null;
  };
  const r = {
    ask: { chat: ch.engineering, thread: null, id: answer.id },
    tess: { chat: ch.engineering, thread: safari.id, id: tessReply.id },
    toTickets: { chat: ch.product, thread: p3, id: filed.id },
    summary: { chat: ch.product, thread: p3, id: summary.id },
    rex: await find(ch.engineering, (m) => m.who === ag.reviewer && /^On it:/.test(m.text)),
    decided: { chat: ch.design, thread: d1, id: decided.id },
    guard: { chat: ch.design, thread: proposal.id, id: guard.id },
    live: liveUpdate ? { chat: ch.product, thread: started.id, id: liveUpdate.id } : null,
    promise: { chat: ch.growth, thread: promise.id, id: tracked.id },
    mission: await find(ch.product, (m) => m.who === ATLAS_ID && /^Mission started/.test(m.text)),
    notes: await find(ch.product, (m) => m.who === ATLAS_ID && /^\*\*Notes:/.test(m.text)),
    followUp: await find(ch.design, (m) => m.who === ATLAS_ID && /still open/.test(m.text)),
    link: await find(ch.design, (m) => m.who === ATLAS_ID && /^Related:/.test(m.text)),
    balancer: await find(ch.engineering, (m) => m.who === ATLAS_ID && /Reassign ORB-\d+/.test(m.text)),
    triage: await find(ch.engineering, (m) => m.who === tess && /^Triaged/.test(m.text)),
    playbook: await find(ch.engineering, (m) => /Playbook: Bug intake · step 1/.test(m.text)),
    digest: await find(ch.product, (m) => m.who === ag.standup && /Daily digest/.test(m.text)),
    reminder: await find(ch.engineering, (m) => m.who === ATLAS_ID && /^⏰ Reminder/.test(m.text)),
    catchUp: { chat: dm, thread: null, id: catchUp.id },
    memory: { chat: dm, thread: null, id: memoryAnswer.id },
    reminderSet: { chat: dm, thread: null, id: reminderSet.id },
    pinned: { chat: ch.design, thread: d1, id: posted.d1d.id },
    formatted: { chat: ch.engineering, thread: null, id: formatted.id },
    ask0: { chat: ch.engineering, thread: null, id: ask.id },
    toTickets0: { chat: ch.product, thread: p3, id: toTickets.id },
  };

  const cards: [number, string][] = [
    [30, `**Welcome to Meld.** Orbit Labs is two weeks from launching paid plans. Its people work here with four agents: me (Atlas, the lead), @tess (triage), @rex (reviews) and @sunny (standups).\nEach message below is one feature. Click the chip to jump to where it happened, then try it yourself. Every reply here is real: this is your private copy.`],
    [29, `**Ask about the work.** I answer from tickets and conversations, with sources. ${cite(r.ask)}\nTry in #engineering: \`@atlas what's blocking the paid plans launch, and who owns it?\``],
    [28, `**A thread becomes owned tickets.** Everyone who said "I'll do it" gets a ticket; existing ones aren't duplicated. ${cite(r.toTickets)}\nTry in #product, in a thread: \`@atlas turn this thread into tickets and assign everyone\` and click Confirm.`],
    [27, `**Thread summaries.** One click: TL;DR, decisions, owners and open questions. ${cite(r.summary)}\nTry: open any thread and click **Summarize**.`],
    [26, `**Agents act on their own.** Nobody tagged Tess: she saw a bug report, reacted 👀 and filed it. ${cite(r.tess)}\nTry in #engineering: \`Checkout fails on Firefox when the coupon field is empty\``],
    [25, `**Agents do assigned work.** Assign a ticket to Rex and he reviews it and moves it to In review. ${cite(r.rex)}\nTry: open any ticket and set the assignee to **Rex**.`],
    [24, `**Decision memory.** Decisions are logged with the why ${cite(r.decided)}, and I speak up when someone proposes the opposite ${cite(r.guard)}. See them all under **Decisions**.\nTry in #design: \`What if we make the onboarding checklist a modal on first login instead?\``],
    [23, `**Tickets keep themselves up to date.** Say it in chat and the ticket follows, with Undo. ${cite(r.live)}\nTry in #product: \`Recorded the 2-minute demo video, it's up for review now\``],
    [22, `**Promises become tickets.** "I'll do X by Friday" gets an owner and a date. ${cite(r.promise)}\nTry: \`I'll write the investor update and send it out by Friday\``],
    [21, `**Missions.** A goal and a date become a plan with owners, dependencies and check-ins; when work slips, I re-plan and ask you to decide. ${cite(r.mission)}\nTry: **Missions** → Launch paid plans → **Run check-in**.`],
    [20, `**Meeting notes to actions.** Paste notes: decisions get logged, action items become tickets, open questions get @mentions. ${cite(r.notes)}\nTry: the notebook button in the message box.`],
    [19, `**Follow-ups.** When someone asks a teammate something and nobody answers, I nudge once. ${cite(r.followUp)}\nTry: click my face, then **Check follow-ups now**.`],
    [18, `**Linked threads.** When the same topic is discussed in two channels, I connect them. ${cite(r.link)}\nTry in #product: \`Has anyone tested the Google Calendar sync with recurring events yet?\``],
    [17, `**Workload balancer.** Assign work to someone overloaded or out, and I suggest a better owner. ${cite(r.balancer)}\nTry: assign a ticket to **Priya Raman**.`],
    [16, `**Auto-triage and playbooks.** New tickets get labels, priority and an owner from Tess ${cite(r.triage)}; bugs then run the "Bug intake" playbook: Tess, Rex, then me ${cite(r.playbook)}.\nTry: **All tickets** → **New ticket** → \`Checkout fails for EU cards with 3DS\`.`],
    [15, `**Sunny's daily digest.** Shipped, blocked, overdue, overloaded, every morning. ${cite(r.digest)}\nTry: click Sunny → **Post digest now**.`],
    [14, `**Reminders.** For you, a teammate or a channel. ${cite(r.reminder)} ${cite(r.reminderSet)}\nTry: \`@atlas remind me in 1 minute to check the board\`.`],
    [13, `**Catch-up and memory.** "What did I miss?" ${cite(r.catchUp)}, and I remember what you tell me ${cite(r.memory)}.\nTry in my DM: \`remember that Jonas is out next Monday\`, then ask who can review on Monday.`],
    [12, `**Slack-style chat.** Threads, reactions, edits, pins ${cite(r.pinned)}, formatting ${cite(r.formatted)}, and search with **Cmd/Ctrl+K**.`],
    [11, `**Jira-style tickets.** **All tickets** → **Board** to drag cards; open ${orb(4)} for comments, labels, due date, points and a checklist; type \`label:billing\` or \`due:overdue\` to filter.`],
    [10, `**People and roles.** Click any face for a profile; **People** lists everyone. "View as role" (bottom-left) shows what a guest sees: agents act with the asker's permissions.`],
  ];
  const posts: Message[] = [];
  for (const [min, text] of cards) posts.push((await say(x.tour, ATLAS_ID, min, text)) as Message);
  // The welcome is pinned (the header's "Pinned" opens it), and the newest message says where to start.
  await store.updateMessage(posts[0].id, { pinnedAt: ago(9), pinnedBy: ATLAS_ID }).catch(() => {});
  await say(x.tour, ATLAS_ID, 9, "That's the tour: 20 features above, newest at the bottom. Scroll up to start from the welcome (it's also under **Pinned**), click any chip to jump there, then try the line under it. Everything you do here is real and private to you.");
  void r.ask0;
  void r.toTickets0;
}
