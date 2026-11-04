import "server-only";

import { ATLAS_ID } from "@/lib/directory";
import { uid } from "@/lib/format";
import { storeFor } from "@/lib/store";
import type { Mission, PlanTask } from "@/lib/missions";
import type { Priority, Ticket, TicketStatus } from "@/lib/types";
import { registry } from "./workspace";
import { seedScheduled } from "./seeds/scheduled";

/**
 * "Try the live demo": a private copy of a seeded company for one visitor, so anyone can
 * see Meld's agents at work in seconds with no setup. Orbit Labs: a small team building a
 * scheduling app, mid-launch, with real-looking threads, tickets, blockers, and three
 * agents already in their channels (Triage lurking in #engineering).
 */
export const SANDBOX_USER_NAME = "Alex Rivera";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const TEAMS = [
  { id: "engineering", name: "Engineering" },
  { id: "design", name: "Design" },
  { id: "product", name: "Product" },
  { id: "growth", name: "Growth" },
];

// Sample teammates (shared profiles; each sandbox adds them as members).
const PEOPLE = [
  { id: "orb-maya", name: "Maya Chen", team: "design", title: "Design lead" },
  { id: "orb-jonas", name: "Jonas Weber", team: "engineering", title: "Backend engineer" },
  { id: "orb-priya", name: "Priya Raman", team: "engineering", title: "Frontend engineer" },
  { id: "orb-tom", name: "Tom Okafor", team: "growth", title: "Growth lead" },
  { id: "orb-sofia", name: "Sofia Rossi", team: "product", title: "Product manager" },
];

const AGENTS = [
  {
    key: "triage", handle: "tess", name: "Tess", color: "#0EA5E9", tools: ["read", "write"] as ("read" | "write")[],
    description: "Triage: turns bug reports into well-formed tickets with the right owner.",
    instructions:
      "When someone reports a bug, file one ticket with steps to reproduce, impact and the likely owner team (Engineering for code, Design for UI copy). Ask one question if the report is too vague. Ask @rex for rollout risks when a fix is risky.",
  },
  {
    key: "reviewer", handle: "rex", name: "Rex", color: "#059669", tools: ["read"] as ("read" | "write")[],
    description: "Reviewer: checks plans and changes for edge cases and rollout risks.",
    instructions: "Look for missing edge cases, rollout risks and unclear ownership. Be concrete and brief: at most four risks, each with a suggested fix. Tag a person only for product decisions.",
  },
  {
    key: "standup", handle: "sunny", name: "Sunny", color: "#D97706", tools: ["read"] as ("read" | "write")[],
    description: "Standup: what changed, what's blocked and what needs a decision.",
    instructions: "When asked, give five bullets: shipped, in progress, blocked (and by what), needs a decision, next. Use ticket ids.",
  },
];

type Msg = { k: string; who: string; min: number; text: string; ticket?: string; replies?: Msg[] };

/** Build a sandbox for `me` (already a profile). Returns the workspace and where to land. */
export async function createSandbox(me: { id: string; first: string }) {
  const reg = await registry();
  const wsId = `ws${uid()}`;
  const ws = { id: wsId, name: "Orbit Labs", slug: `orbit-${wsId.slice(2, 12).toLowerCase()}`, ticketPrefix: "ORB", repo: "orbit-labs/app", teams: TEAMS };
  await reg.createWorkspace(ws, me.id);
  // Independent writes run in parallel: the visitor is waiting.
  await Promise.all([
    reg.updateMember(wsId, me.id, { team: "product", title: "Founder & CEO" }),
    ...PEOPLE.map(async (p) => {
      await reg.upsertProfile({ id: p.id, name: p.name, email: null, avatarUrl: null });
      await reg.addMember(wsId, p.id, "member");
      await reg.updateMember(wsId, p.id, { team: p.team, title: p.title });
    }),
  ]);
  const [maya, jonas, priya, tom, sofia] = PEOPLE.map((p) => p.id);
  const at = (i: number) => new Date(Date.now() - 4000 * 60_000 + i * 1000).toISOString();

  // Channels (ids are global, so each sandbox gets its own).
  const ch: Record<string, string> = {};
  const channels = [
    ["general", "Company-wide announcements", null],
    ["product", "Roadmap, specs and launch planning", "product"],
    ["engineering", "Backend, frontend and infra", "engineering"],
    ["design", "Design reviews and decisions", "design"],
    ["growth", "Launches, campaigns and funnel", "growth"],
    ["random", "Anything goes", null],
  ] as const;
  for (const [name] of channels) ch[name] = `ch${uid()}`;
  const dm: Record<string, string> = { [maya]: `dm${uid()}`, [jonas]: `dm${uid()}` };
  await Promise.all([
    ...channels.map(([name, topic, team], i) =>
      reg.createChannel({ id: ch[name], workspaceId: wsId, kind: "channel", name, topic, team, members: null, createdBy: me.id, createdAt: at(i) }),
    ),
    ...[maya, jonas].map((who, i) =>
      reg.createChannel({ id: dm[who], workspaceId: wsId, kind: "dm", name: null, topic: "", team: null, members: [me.id, who], createdBy: who, createdAt: at(10 + i) }),
    ),
  ]);

  // Agents, already at work in their channels.
  const ag: Record<string, string> = {};
  for (const a of AGENTS) ag[a.key] = `ag${uid()}`;
  await Promise.all([
    ...AGENTS.map((a, i) =>
      reg.createAgent({
        id: ag[a.key], workspaceId: wsId, handle: a.handle, name: a.name, description: a.description, instructions: a.instructions,
        tools: a.tools, kind: "custom", color: a.color, tokenHash: null, createdBy: me.id, createdAt: at(20 + i),
      }),
    ),
    ...([
      ["engineering", "triage", "lurk"], ["product", "triage", "mention"], ["engineering", "reviewer", "mention"],
      ["product", "reviewer", "mention"], ["general", "standup", "mention"], ["product", "standup", "mention"],
    ] as const).map(([chat, key, mode]) => reg.setChannelAgent(wsId, ch[chat], ag[key], mode, me.id)),
  ]);

  // Tickets ORB-1..12, some blocking others.
  const store = await storeFor(ws);
  type Extra = {
    pr?: string; issue?: string; blocked?: number[]; watch?: string; desc?: string;
    /** Labels, due in days from today, story points, checklist ([text, done]), comments ([who, minutes ago, text]). */
    labels?: string[]; due?: number; pts?: number; check?: [string, boolean][]; talk?: [string, number, string][];
  };
  type T = [string, string, TicketStatus, Priority, string, string, Extra?];
  const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const tickets: T[] = [
    ["engineering", "Google Calendar two-way sync", "In progress", "High", jonas, sofia, {
      pr: "214", watch: "engineering", desc: "Sync events both ways; handle recurring events and deletions.", labels: ["integrations", "launch"], due: 3, pts: 8,
      check: [["OAuth consent screen approved", true], ["Push changes to Google", true], ["Pull changes with sync tokens", false], ["Recurring events and exceptions", false], ["Deletions both ways", false]],
    }],
    ["design", "Onboarding checklist redesign", "In review", "Medium", maya, me.id, { pr: "220", watch: "design", desc: "Checklist moves to a sidebar card that stays until all 4 steps are done (decided in #design).", labels: ["design", "onboarding"], due: -2, pts: 3 }],
    ["engineering", "Team scheduling links", "To do", "High", priya, sofia, { desc: "Round-robin and collective links for teams.", labels: ["launch"], due: 9, pts: 13 }],
    ["engineering", "Stripe webhooks for plan upgrades", "In progress", "High", jonas, ATLAS_ID, {
      issue: "198", watch: "engineering", desc: "Handle checkout.session.completed and customer.subscription.updated; idempotent.", labels: ["billing", "launch"], pts: 5,
      talk: [
        [jonas, 520, "checkout.session.completed is handled and idempotent on the event id. Working on subscription.updated next."],
        [priya, 300, "@Jonas I need the plan field on the customer record for ORB-7. Will it be there after this lands?"],
        [jonas, 240, "Yes, the webhook writes plan and seats. I'll ping you when it's on staging, should be tomorrow morning."],
      ],
    }],
    ["design", "Pricing page refresh", "To do", "Medium", maya, tom, {
      desc: "Annual toggle default on, show monthly equivalent.", labels: ["design", "billing", "launch"], pts: 3,
      talk: [
        [tom, 900, "The launch emails (ORB-6) quote prices, so I need the final numbers before I can schedule them."],
        [maya, 610, "Mocks are done, waiting on Sofia to confirm the annual discount. 20% is the current proposal."],
        [sofia, 180, "@Maya 20% is fine for launch. Let's ship it and revisit after a month of data."],
      ],
    }],
    ["growth", "Launch email sequence", "To do", "Medium", tom, tom, { blocked: [5], desc: "3 emails: announce, how-to, last call. Needs final pricing.", labels: ["launch", "marketing"], pts: 3 }],
    ["engineering", "In-app upgrade flow in Settings", "To do", "High", priya, sofia, { blocked: [4], labels: ["billing", "launch"], pts: 5 }],
    ["engineering", "Timezone bug in weekly view", "Done", "High", priya, maya, { pr: "209", watch: "engineering", labels: ["bug"], pts: 2 }],
    ["growth", "Product Hunt launch kit", "In progress", "Medium", tom, tom, {
      labels: ["launch", "marketing"], pts: 2,
      check: [["Tagline", true], ["Gallery images", true], ["Maker comment", true], ["Hunter lined up", false]],
    }],
    ["product", "Analytics events for the onboarding funnel", "To do", "Low", sofia, sofia, { labels: ["onboarding", "analytics"], due: 12, pts: 3 }],
    ["design", "Dark mode polish", "Backburner", "Low", maya, maya, { labels: ["design"] }],
    ["product", "Q4 roadmap doc", "In review", "Medium", me.id, sofia, { desc: "One page: themes, bets, what we're not doing.", labels: ["planning"], due: 2 }],
  ];
  const ids: string[] = [];
  const nameOf = (id: string) => (id === me.id ? "Alex Rivera" : id === ATLAS_ID ? "Atlas" : (PEOPLE.find((p) => p.id === id)?.name ?? "Someone"));
  for (let i = 0; i < tickets.length; i++) ids.push(await store.nextTicketId());
  await Promise.all(tickets.map(async ([team, title, status, priority, assignee, reporter, x = {}], i) => {
    const id = ids[i];
    const t: Ticket = {
      id, team, title, status, priority, assignee, reporter, description: x.desc ?? "", images: [], updated: "Today",
      links: [
        ...(x.pr ? [{ id: `PR${x.pr}`, kind: "PR" as const, num: x.pr, repo: ws.repo }] : []),
        ...(x.issue ? [{ id: `Issue${x.issue}`, kind: "Issue" as const, num: x.issue, repo: ws.repo }] : []),
      ],
      watch: x.watch ? { chat: ch[x.watch], thread: null } : null,
      blockedBy: (x.blocked ?? []).map((n) => `ORB-${n}`),
      labels: x.labels ?? [],
      due: x.due === undefined ? null : inDays(x.due),
      estimate: x.pts ?? null,
      checklist: (x.check ?? []).map(([text, done], j) => ({ id: `ck${i}-${j}`, text, done })),
      comments: (x.talk ?? []).map(([who, min, text], j) => ({ id: `cm${i}-${j}`, who, text, time: ago(min) })),
      activity: [{ who: nameOf(reporter), text: "created this ticket", time: ago(3100) }],
    };
    await store.insertTicket(t);
  }));

  const you = `@${me.first}`;
  const conversations: [string, Msg[]][] = [
    ["general", [
      { k: "g1", who: me.id, min: 1600, text: "Welcome to Orbit Labs on Meld 👋 Tickets live next to the conversation, and our agents can file, update and chase them. Tag @atlas, or our agents @tess (triage), @rex (reviews) and @sunny (standups)." },
      { k: "g2", who: ATLAS_ID, min: 1599, text: "Hi all! Tag @atlas anywhere to create, update or find tickets (they start with ORB-), ask where things stand, or turn a thread into tasks. I act with the permissions of whoever asks." },
      { k: "g3", who: sofia, min: 300, text: `Reminder: the Q4 launch is two weeks out. Planning thread is in #product. ${you} can you sign off on the roadmap doc (ORB-12) by Friday?` },
      { k: "g4", who: tom, min: 95, text: "We crossed 1,000 waitlist signups this morning 🎉" },
    ]],
    ["product", [
      { k: "p1", who: sofia, min: 1400, text: "Draft Q4 roadmap is up for review in ORB-12. Big bets: team scheduling (ORB-3) and paid plans (ORB-4, ORB-7)." },
      { k: "p2", who: me.id, min: 1380, text: "Looks right. Let's keep dark mode (ORB-11) on the backburner until after launch." },
      {
        k: "p3", who: sofia, min: 140, text: "Q4 launch plan: who owns what for the release on the 18th?",
        replies: [
          { k: "p3a", who: maya, min: 135, text: "I'll finalize the pricing page design by Wednesday." },
          { k: "p3b", who: tom, min: 130, text: "I'll draft the launch email sequence and put together the Product Hunt post." },
          { k: "p3c", who: priya, min: 125, text: "I'll build the in-app upgrade banner once Jonas's webhooks land." },
          { k: "p3d", who: jonas, min: 120, text: "Webhooks will be done Thursday. I'll also set up alerts for failed payments so we hear about them before customers do." },
          { k: "p3e", who: sofia, min: 110, text: `And I'll write the release notes and the changelog page. ${you} can you record the 2-minute demo video?` },
        ],
      },
    ]],
    ["engineering", [
      { k: "e1", who: jonas, min: 2900, text: "@atlas create a ticket for Stripe webhooks for plan upgrades, assign me, high priority" },
      { k: "e2", who: ATLAS_ID, min: 2899, text: "Created ORB-4 in Engineering and assigned it to Jonas Weber, high priority.", ticket: "ORB-4" },
      { k: "e3", who: priya, min: 920, text: "Fixed the timezone bug in the weekly view, PR #209 merged." },
      { k: "e4", who: ATLAS_ID, min: 900, text: "Update on ORB-8: Priya Raman moved it to Done." },
      { k: "e5", who: priya, min: 240, text: "Heads up: I can't start the upgrade flow (ORB-7) until the Stripe webhooks (ORB-4) are in. Marked it as blocked." },
      { k: "e6", who: jonas, min: 200, text: "Webhook signature verification is done. Remaining: idempotency keys and the subscription.updated handler. Should land Thursday." },
      { k: "e7", who: jonas, min: 60, text: `Calendar sync (ORB-1) is in PR #214. ${you} could you test it with your Google account? Recurring events are the tricky part.` },
    ]],
    ["design", [
      {
        k: "d1", who: maya, min: 1500, text: "Where should the onboarding checklist live? Option A: modal on first login. Option B: a sidebar card that stays until done.",
        replies: [
          { k: "d1a", who: priya, min: 1490, text: "Modals get dismissed and forgotten. B gets my vote." },
          { k: "d1b", who: sofia, min: 1480, text: "B, and let's keep it to 4 steps max." },
          { k: "d1c", who: me.id, min: 1470, text: "Agreed: sidebar card, 4 steps, disappears when done. Maya, go ahead." },
          { k: "d1d", who: maya, min: 1460, text: "Decision: sidebar card with 4 steps, hidden once complete. Updating ORB-2." },
        ],
      },
      { k: "d2", who: maya, min: 45, text: "Pricing page v2 mocks are in Figma. Annual toggle on by default, monthly equivalent under the price. Feedback welcome." },
    ]],
    ["growth", [
      { k: "gr1", who: tom, min: 400, text: "Product Hunt launch kit (ORB-9) is half done: tagline, gallery and maker comment drafted." },
      { k: "gr2", who: tom, min: 80, text: "The email sequence (ORB-6) is waiting on final pricing from ORB-5. Maya, any ETA?" },
    ]],
    ["random", [
      { k: "r1", who: priya, min: 700, text: "Who's in for lunch at the ramen place on Friday? 🍜" },
      { k: "r2", who: jonas, min: 690, text: "In." },
    ]],
  ];
  // Channels fill in parallel; each one in order (so threads follow their roots).
  const posted: Record<string, { id: string; root: string | null }> = {};
  await Promise.all([
    ...conversations.map(async ([channel, msgs]) => {
      for (const m of msgs) {
        const root = await store.appendMessage(ch[channel], { id: uid(), who: m.who, time: ago(m.min), text: m.text, ticket: m.ticket ?? null });
        posted[m.k] = { id: root.id, root: null };
        for (const r of m.replies ?? []) {
          const reply = await store.appendMessage(ch[channel], { id: uid(), who: r.who, time: ago(r.min), text: r.text }, root.id);
          posted[r.k] = { id: reply.id, root: root.id };
        }
      }
    }),
    store.appendMessage(dm[maya], { id: uid(), who: maya, time: ago(70), text: "Hey! Could you look at the pricing page mocks before Wednesday? Tom's emails (ORB-6) are waiting on them." }),
    store.appendMessage(dm[jonas], { id: uid(), who: jonas, time: ago(30), text: "Stripe test-mode keys expire on Friday and I don't have dashboard access. Can you rotate them?" }),
  ]);

  // Decision memory: the #design thread settled where the onboarding checklist lives.
  // Proposing a modal again gets pointed back to it (and why).
  await store.saveTeamDecision({
    id: `td${uid()}`, topic: "Onboarding checklist placement", statement: "The onboarding checklist is a sidebar card with 4 steps that disappears when done, not a modal.",
    rationale: "Modals get dismissed and forgotten; a persistent card keeps setup visible until it's finished.", rejected: ["Modal on first login"],
    deciders: [maya, priya, sofia, me.id], chatId: ch.design, threadId: posted.d1.id, messageId: posted.d1d.id, status: "active", supersededBy: null,
    flags: 0, lastFlaggedAt: null, source: "chat", createdAt: ago(1460),
  });
  await store.react(posted.d1d.id, "📌", ATLAS_ID, true).catch(() => {});
  // Pinned in #design, as a team would: the "Pinned" list then has something to show.
  await store.updateMessage(posted.d1d.id, { pinnedAt: ago(1455), pinnedBy: maya }).catch(() => {});
  await seedMission(store, { me: me.id, chat: ch.product, ids, people: { maya, jonas, priya, tom } });
  await seedAgentSkills(store, { me: me.id, ch, ag, people: { jonas } });
  await seedScheduled(store, { me, ch, ag, ids, posted, people: { maya, jonas, priya, sofia, tom } });
  return { workspaceId: wsId, home: ch.engineering, ticketIds: ids };
}

/**
 * A mission already in flight: "Launch paid plans", launched yesterday, with the pricing
 * page already a day late. Running a check-in shows the agents re-plan the chain behind
 * it, find the date at risk and ask the visitor to choose date or scope.
 */
async function seedMission(
  store: Awaited<ReturnType<typeof storeFor>>,
  x: { me: string; chat: string; ids: string[]; people: Record<"maya" | "jonas" | "priya" | "tom", string> },
) {
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const orb = (n: number) => x.ids[n - 1];
  const fmt = (d: string | null) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const id = `ms${uid()}`;
  const video = await store.nextTicketId();
  const { maya, jonas, priya, tom } = x.people;
  const tasks: PlanTask[] = [
    { key: "t1", ticketId: orb(4), existing: orb(4), title: "Stripe webhooks for plan upgrades", description: "", owner: jonas, team: "engineering", priority: "High", due: day(1), dependsOn: [] },
    { key: "t2", ticketId: orb(5), existing: orb(5), title: "Pricing page refresh", description: "", owner: maya, team: "design", priority: "Medium", due: day(-1), dependsOn: [] },
    { key: "t3", ticketId: orb(7), existing: orb(7), title: "In-app upgrade flow in Settings", description: "", owner: priya, team: "engineering", priority: "High", due: day(2), dependsOn: ["t1"] },
    { key: "t4", ticketId: orb(6), existing: orb(6), title: "Launch email sequence", description: "", owner: tom, team: "growth", priority: "Medium", due: day(1), dependsOn: ["t2"] },
    { key: "t5", ticketId: orb(9), existing: orb(9), title: "Product Hunt launch kit", description: "", owner: tom, team: "growth", priority: "Low", due: day(2), dependsOn: ["t4"] },
    { key: "t6", ticketId: video, title: "Record the 2-minute demo video", description: "Walk through booking, team links and upgrading.", owner: x.me, team: "product", priority: "Medium", due: day(2), dependsOn: [] },
  ];
  const root = await store.appendMessage(x.chat, {
    id: uid(), who: ATLAS_ID, time: ago(1500),
    text: `Mission started by ${PEOPLE.find((p) => p.name.startsWith("Sofia"))?.name ?? "Sofia"}: launch paid plans (by ${fmt(day(2))}). I'm drafting the plan in this thread.`,
  });
  const m: Mission = {
    id, title: "Launch paid plans", goal: "Launch paid plans: checkout, upgrade flow, pricing page and launch comms", chatId: x.chat, threadId: root.id,
    status: "active", deadline: day(2), plan: { tasks, risks: ["Webhooks slipping blocks the upgrade flow", "Pricing not final holds up the launch emails"] },
    summary: "Customers can upgrade in-app and the launch is announced by email and on Product Hunt.", health: "On track: just launched",
    createdBy: x.me, createdAt: ago(1500), launchedAt: ago(1400), lastCheckinAt: null,
  };
  await store.saveMission(m);
  for (const t of tasks) {
    if (t.ticketId === video) {
      await store.insertTicket({
        id: video, team: "product", title: t.title, description: t.description, status: "To do", priority: "Medium", assignee: x.me, reporter: ATLAS_ID,
        links: [], images: [], updated: "Yesterday", watch: { chat: x.chat, thread: root.id }, blockedBy: [], missionId: id, due: t.due,
        activity: [{ who: "Atlas", text: 'created this ticket for the mission "Launch paid plans"', time: ago(1400) }],
      });
      continue;
    }
    const cur = await store.getTicket(t.ticketId!);
    if (cur) {
      await store.saveTicket({
        ...cur, missionId: id, due: t.due, blockedBy: [...new Set([...(cur.blockedBy ?? []), ...t.dependsOn.map((k) => tasks.find((y) => y.key === k)!.ticketId!)])],
        activity: [...cur.activity, { who: "Atlas", text: 'added it to the mission "Launch paid plans"', time: ago(1400) }],
      });
    }
  }
  await store.appendMessage(x.chat, { id: uid(), who: ATLAS_ID, time: ago(1499), text: `Draft plan for "Launch paid plans": 6 tasks across Jonas, Maya, Priya, Tom and you. Critical path: Pricing page refresh → Launch email sequence → Product Hunt launch kit.` }, root.id);
  await store.appendMessage(x.chat, {
    id: uid(), who: ATLAS_ID, time: ago(1400),
    text: `Mission launched: "Launch paid plans".\n${tasks.map((t) => `• ${t.ticketId} ${t.title}, due ${fmt(t.due)}`).join("\n")}\nI'll check in on progress and flag anything that puts the date at risk.`,
  }, root.id);
  await store.saveDecision({
    id: `dc${uid()}`, missionId: id, question: "Launch discount for annual plans?", options: ["2 months free", "20% off the first year"],
    context: "Tom's launch emails and Maya's pricing page both need the final offer.", status: "open", answer: null, answeredBy: null, answeredAt: null, createdAt: ago(1499),
  });
  for (const [kind, text, at] of [["planned", "Drafted 6 tasks for 5 owners.", 1499], ["launched", "Launched with 6 tickets.", 1400]] as const) {
    await store.addMissionEvent({ missionId: id, kind, actor: kind === "launched" ? x.me : ATLAS_ID, text, at: ago(at) });
  }
}

/**
 * Agent skills, already in use: a ticket assigned to the Reviewer agent with its finished
 * review in #engineering (On it → findings → moved to In review), and a few remembered
 * facts. Agents are looked up by key, so renaming them doesn't break this.
 */
async function seedAgentSkills(
  store: Awaited<ReturnType<typeof storeFor>>,
  x: { me: string; ch: Record<string, string>; ag: Record<string, string>; people: Record<"jonas", string> },
) {
  const reviewer = x.ag.reviewer;
  const { jonas } = x.people;
  if (!reviewer || !x.ch.engineering) return;
  const id = await store.nextTicketId();
  const ack = `as${uid()}`;
  await store.insertTicket({
    id, team: "engineering", title: "Failed-payment alerts: rollout plan", status: "In review", priority: "High", assignee: reviewer, reporter: jonas,
    description: "Alert #engineering when 3 charges fail within 10 minutes; page on-call if it isn't acknowledged in 30. Ships with the Stripe webhooks (ORB-4).",
    links: [], images: [], updated: "Today", watch: { chat: x.ch.engineering, thread: null }, blockedBy: [],
    activity: [
      { who: "Jonas Weber", text: "created this ticket", time: ago(56) },
      { who: "Jonas Weber", text: "assigned it to Rex", time: ago(55) },
      { who: "Rex", text: "moved it to In review after working on it", time: ago(53) },
    ],
  });
  const root = await store.appendMessage(x.ch.engineering, {
    id: ack, who: reviewer, time: ago(55), ticket: id,
    text: `On it: ${id}, assigned by Jonas Weber. I'll post what I find here and move it to In review when I'm done.`,
  });
  await store.appendMessage(x.ch.engineering, {
    id: `${ack}r`, who: reviewer, time: ago(53),
    text: `Review of ${id}, from the plan and the webhook thread:
• Retries can count one card three times: count distinct charge ids, or a single customer pages on-call. Fix: dedupe on charge id.
• No owner for the alert channel: name who acknowledges during the day, and route pages to the on-call rotation, not Jonas.
• Test mode will fire alerts too: filter on livemode before ORB-4 ships.
• No way to silence a known Stripe incident: add a 1-hour mute.
Moving ${id} to In review.`,
  }, root.id);
  await store.appendMessage(x.ch.engineering, { id: uid(), who: jonas, time: ago(40), text: "Good catches. Adding the charge-id dedupe and the livemode filter today." }, root.id);
  // Remembered facts: one for the whole team, one only the Reviewer uses.
  await store.addAgentMemory({ id: `mem${uid()}`, agentId: "team", text: "Maya Chen is out on Fridays.", createdBy: x.me, createdAt: ago(1300) });
  await store.addAgentMemory({ id: `mem${uid()}`, agentId: reviewer, text: "Jonas wants risks ranked by customer impact, worst first.", createdBy: jonas, createdAt: ago(900) });
}

