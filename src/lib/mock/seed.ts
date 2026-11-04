import { DEMO_PEOPLE } from "./demo";

const DEFAULT_REPO = "northwind/web";
import type { ChatId, GitHubLink, Message, PersonId, Ticket, WeekDay } from "../types";

const L = (kind: GitHubLink["kind"], num: number): GitHubLink => ({ id: kind + num, kind, num: String(num), repo: DEFAULT_REPO });

function T(
  id: string,
  team: Ticket["team"],
  title: string,
  status: Ticket["status"],
  assignee: PersonId,
  priority: Ticket["priority"],
  reporter: PersonId,
  links: GitHubLink[] = [],
  extra: Partial<Ticket> = {},
): Ticket {
  return {
    id, team, title, status, assignee, priority, reporter, links,
    images: [], updated: "Today", description: "", watch: null,
    activity: [{ who: DEMO_PEOPLE[reporter].name, text: "created this ticket", time: "Oct 28" }],
    ...extra,
  };
}

export const SEED_NEXT_NUM = 150;

export const SEED_WEEK: WeekDay[] = [
  { d: "Mon", p: 6, a: 3 }, { d: "Tue", p: 8, a: 4 }, { d: "Wed", p: 5, a: 6 }, { d: "Thu", p: 9, a: 5 },
  { d: "Fri", p: 7, a: 8 }, { d: "Sat", p: 2, a: 1 }, { d: "Sun", p: 4, a: 5 },
];

export const SEED_UNREAD: Partial<Record<ChatId, number>> = { payments: 2, aiko: 1 };

/** A date `n` days from today, YYYY-MM-DD (seed due dates stay relative to the demo). */
const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

export const SEED_TICKETS: Ticket[] = [
  T("NW-121", "design", "Invite email links expire too early", "In progress", "aiko", "High", "me", [L("Issue", 412)], { description: "Invite links stop working after about 2 hours. They should last 7 days.", watch: { chat: "design", thread: null }, labels: ["bug", "onboarding"], due: day(2), estimate: 3 }),
  T("NW-122", "design", "Two-step invite prompt in onboarding", "To do", "aiko", "Medium", "me", [], { description: "Light invite prompt up front, stronger one after the first project is created.", labels: ["design", "onboarding"], estimate: 5 }),
  T("NW-123", "design", "Copy pass on workspace setup screen", "Done", "me", "Low", "aiko", [L("PR", 488)], { watch: { chat: "design", thread: null } }),
  T("NW-125", "design", "Onboarding invite A/B test", "To do", "me", "Medium", "atlas", [], { description: "Requested by Suvra Das in #product-design.", watch: { chat: "design", thread: null }, labels: ["experiment"] }),
  T("NW-126", "design", "Dark mode for settings", "Backburner", "aiko", "Low", "aiko"),
  T("NW-130", "payments", "Apple Pay on the payments page", "In review", "ravi", "High", "ravi", [L("PR", 512)], {
    description: "Apple Pay sheet behind the payments_apple_pay flag.", watch: { chat: "payments", thread: null }, labels: ["billing", "launch"], due: day(1), estimate: 5,
    checklist: [
      { id: "ck130a", text: "Domain verification file on staging", done: true },
      { id: "ck130b", text: "Sheet copy reviewed", done: false },
      { id: "ck130c", text: "Flag rollout plan", done: false },
    ],
    comments: [
      { id: "cm130a", who: "ravi", text: "Staging is ready behind the flag. Copy on the sheet still needs a look.", time: "9:14 AM" },
      { id: "cm130b", who: "lena", text: "@Ravi reviewing after standup. NW-131 has to land before we flip it for everyone.", time: "9:26 AM" },
    ],
  }),
  T("NW-131", "payments", "Replace SetupIntent with PaymentIntent", "To do", "lena", "High", "lena", [L("Issue", 498)], { labels: ["billing", "bug"], due: day(-1), estimate: 3 }),
  T("NW-132", "payments", "Team billing in the creator plan", "To do", "ravi", "Medium", "ravi", [], { labels: ["billing"], estimate: 8 }),
  T("NW-133", "payments", "Refund webhook reconciliation", "Done", "lena", "Medium", "lena", [L("PR", 505)], { watch: { chat: "payments", thread: null } }),
  T("NW-140", "platform", "Rate-limit webhook retries", "Done", "me", "High", "me", [L("PR", 475), L("Issue", 401)]),
  T("NW-141", "platform", "Redeploy cron jobs on code changes", "In progress", "diego", "Medium", "diego", [L("PR", 530)], { watch: { chat: "platform", thread: null }, labels: ["infra"], estimate: 2 }),
  T("NW-142", "platform", "Rotate API signing keys", "To do", "diego", "High", "atlas", [], { description: "Requested by Suvra Das in a DM with Atlas.", labels: ["security", "infra"], due: day(6) }),
  T("NW-143", "platform", "Golden benchmark set for evals", "To do", "me", "Medium", "me"),
];

const m = (id: string, who: PersonId, time: string, text: string, extra: Partial<Message> = {}): Message => ({ id, who, time, text, replies: [], ...extra });

export const SEED_CHATS: Record<ChatId, Message[]> = {
  general: [
    m("g1", "lena", "9:02 AM", "Welcome @Diego to the platform team!"),
    m("g2", "diego", "9:05 AM", "Thanks all, happy to be here."),
    m("g3", "me", "9:10 AM", "Reminder: anyone can tag @Atlas to create or update tickets, or mention a ticket like NW-122. Both respect your role, so you only see what you have access to."),
  ],
  design: [
    m("m1", "aiko", "10:02 AM", "Pushed the new onboarding flow to staging. The welcome screen now skips straight to workspace setup."),
    m("m2", "me", "10:06 AM", "Nice. Before we lock it, I want to rethink where the invite step lives. Starting a thread so we keep this in one place.", {
      replies: [
        { id: "r1", who: "aiko", time: "10:09 AM", text: "My take: move invites to after the first project is created. People invite more when there is something to show." },
        { id: "s1", who: "me", time: "10:12 AM", text: "Worried that hurts team signups. Solo users may never come back to invite anyone." },
        { id: "s2", who: "aiko", time: "10:14 AM", text: "Fair. What if we keep a light invite prompt up front and a stronger one after the first project? That is basically NW-122." },
        { id: "s3", who: "me", time: "10:15 AM", text: "Love it. Can the stronger prompt wait for the second project instead of the first?" },
        { id: "s4", who: "aiko", time: "10:16 AM", text: "Sure. I'll add that as a variant on NW-122." },
        { id: "r2", who: "me", time: "10:18 AM", text: "Let's prototype both and compare on Thursday." },
        { id: "r3", who: "aiko", time: "10:21 AM", text: "On it. I'll mock the two-step version first." },
      ],
    }),
    m("m3", "aiko", "10:25 AM", "Also: tomorrow’s standup moved to 11:30."),
    m("m4", "me", "10:31 AM", "@Atlas create a ticket for the onboarding invite A/B test"),
    m("m5", "atlas", "10:31 AM", "Created NW-125 in Design and assigned it to you.", { ticket: "NW-125" }),
    m("m6", "atlas", "10:40 AM", "Update on NW-121: Aiko Tanaka moved it to In progress. Posting here because I was tagged when it was filed."),
    m("m7", "atlas", "10:52 AM", "Update on NW-123: Suvra Das moved it to Done (requested in a DM with Atlas)."),
  ],
  payments: [
    m("p1", "ravi", "9:12 AM", "Apple Pay sheet is behind a flag on staging. NW-130 is ready for a look."),
    m("p2", "lena", "9:20 AM", "@Atlas move NW-130 to In review and link PR #512"),
    m("p3", "atlas", "9:20 AM", "Updated NW-130: status In progress → In review, linked PR #512. Ravi Menon is still the assignee.", { ticket: "NW-130" }),
    m("p4", "ravi", "9:31 AM", "Heads up: NW-131 blocks the rollout. The old flow still creates SetupIntents."),
    m("p5", "atlas", "9:48 AM", "Update on NW-133: Lena Park marked it Done. Closing the loop since I was tagged on it yesterday."),
  ],
  platform: [
    m("f1", "diego", "10:40 AM", "Cron redeploy on code changes is live on staging. Tracking it in NW-141."),
    m("f2", "me", "10:44 AM", "@Atlas what's the status of NW-141?"),
    m("f3", "atlas", "10:44 AM", "NW-141 is In progress, assigned to Diego Alvarez, priority Medium. Linked: PR #530.", { ticket: "NW-141" }),
  ],
  aiko: [
    m("d1", "aiko", "9:40 AM", "Morning! Are you joining the Thursday review in person or remote?"),
    m("d2", "me", "9:44 AM", "Remote this time, I'll be traveling."),
    m("d3", "aiko", "9:45 AM", "Got it, I'll send you the call link."),
  ],
  ravi: [
    m("v1", "ravi", "8:55 AM", "Can you review the Apple Pay copy on NW-130 before lunch?"),
    m("v2", "me", "9:01 AM", "Yes, send it over."),
  ],
  atlas: [
    m("a1", "me", "10:50 AM", "What's on my plate today?"),
    m("a2", "atlas", "10:50 AM", "You have 3 open tickets:\n• NW-123 (In review)\n• NW-125 (To do)\n• NW-143 (To do)"),
    m("a3", "me", "10:52 AM", "Move NW-123 to Done"),
    m("a4", "atlas", "10:52 AM", "Updated NW-123: status In review → Done. I posted the update in #product-design.", { ticket: "NW-123" }),
    m("a5", "me", "10:55 AM", "Create a ticket for rotating API signing keys and assign it to Diego"),
    m("a6", "atlas", "10:55 AM", "Created NW-142 in Platform and assigned it to Diego Alvarez.", { ticket: "NW-142" }),
    m("a7", "me", "10:58 AM", "Delete NW-127"),
    m("a8", "atlas", "10:58 AM", "Deleted NW-127 (“Duplicate: invite links expire”). Mentions of it now show as plain text."),
  ],
};
