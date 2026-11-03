import "server-only";

import { ATLAS_ID } from "@/lib/directory";
import { uid } from "@/lib/format";
import { storeFor } from "@/lib/store";
import type { Priority, Ticket, TicketStatus } from "@/lib/types";
import { registry } from "./workspace";

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
    key: "triage", name: "Triage", color: "#0EA5E9", tools: ["read", "write"] as ("read" | "write")[],
    description: "Turns bug reports into well-formed tickets with the right owner.",
    instructions:
      "When someone reports a bug, file one ticket with steps to reproduce, impact and the likely owner team (Engineering for code, Design for UI copy). Ask one question if the report is too vague. Ask @reviewer for rollout risks when a fix is risky.",
  },
  {
    key: "reviewer", name: "Reviewer", color: "#059669", tools: ["read"] as ("read" | "write")[],
    description: "Reviews plans and changes for edge cases and rollout risks.",
    instructions: "Look for missing edge cases, rollout risks and unclear ownership. Be concrete and brief: at most four risks, each with a suggested fix. Tag a person only for product decisions.",
  },
  {
    key: "standup", name: "Standup", color: "#D97706", tools: ["read"] as ("read" | "write")[],
    description: "Summarizes what changed, what's blocked and what needs a decision.",
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
        id: ag[a.key], workspaceId: wsId, handle: a.key, name: a.name, description: a.description, instructions: a.instructions,
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
  type T = [string, string, TicketStatus, Priority, string, string, { pr?: string; issue?: string; blocked?: number[]; watch?: string; desc?: string }?];
  const tickets: T[] = [
    ["engineering", "Google Calendar two-way sync", "In progress", "High", jonas, sofia, { pr: "214", watch: "engineering", desc: "Sync events both ways; handle recurring events and deletions." }],
    ["design", "Onboarding checklist redesign", "In review", "Medium", maya, me.id, { pr: "220", watch: "design", desc: "Checklist moves to a sidebar card that stays until all 4 steps are done (decided in #design)." }],
    ["engineering", "Team scheduling links", "To do", "High", priya, sofia, { desc: "Round-robin and collective links for teams." }],
    ["engineering", "Stripe webhooks for plan upgrades", "In progress", "High", jonas, ATLAS_ID, { issue: "198", watch: "engineering", desc: "Handle checkout.session.completed and customer.subscription.updated; idempotent." }],
    ["design", "Pricing page refresh", "To do", "Medium", maya, tom, { desc: "Annual toggle default on, show monthly equivalent." }],
    ["growth", "Launch email sequence", "To do", "Medium", tom, tom, { blocked: [5], desc: "3 emails: announce, how-to, last call. Needs final pricing." }],
    ["engineering", "In-app upgrade flow in Settings", "To do", "High", priya, sofia, { blocked: [4] }],
    ["engineering", "Timezone bug in weekly view", "Done", "High", priya, maya, { pr: "209", watch: "engineering" }],
    ["growth", "Product Hunt launch kit", "In progress", "Medium", tom, tom],
    ["product", "Analytics events for the onboarding funnel", "To do", "Low", sofia, sofia],
    ["design", "Dark mode polish", "Backburner", "Low", maya, maya],
    ["product", "Q4 roadmap doc", "In review", "Medium", me.id, sofia, { desc: "One page: themes, bets, what we're not doing." }],
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
      activity: [{ who: nameOf(reporter), text: "created this ticket", time: ago(3100) }],
    };
    await store.insertTicket(t);
  }));

  const you = `@${me.first}`;
  const conversations: [string, Msg[]][] = [
    ["general", [
      { k: "g1", who: me.id, min: 1600, text: "Welcome to Orbit Labs on Meld 👋 Tickets live next to the conversation, and our agents can file, update and chase them. Tag @atlas, @triage, @reviewer or @standup." },
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
  await Promise.all([
    ...conversations.map(async ([channel, msgs]) => {
      for (const m of msgs) {
        const root = await store.appendMessage(ch[channel], { id: uid(), who: m.who, time: ago(m.min), text: m.text, ticket: m.ticket ?? null });
        for (const r of m.replies ?? []) await store.appendMessage(ch[channel], { id: uid(), who: r.who, time: ago(r.min), text: r.text }, root.id);
      }
    }),
    store.appendMessage(dm[maya], { id: uid(), who: maya, time: ago(70), text: "Hey! Could you look at the pricing page mocks before Wednesday? Tom's emails (ORB-6) are waiting on them." }),
    store.appendMessage(dm[jonas], { id: uid(), who: jonas, time: ago(30), text: "Stripe test-mode keys expire on Friday and I don't have dashboard access. Can you rotate them?" }),
  ]);

  return { workspaceId: wsId, home: ch.engineering, ticketIds: ids };
}
