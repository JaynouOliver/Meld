import {
  BookmarkIcon,
  CheckIcon,
  FlagIcon,
  KeyRoundIcon,
  MapPinIcon,
  MinusIcon,
  RadioIcon,
  ShieldCheckIcon,
  TicketIcon,
  Undo2Icon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/marketing/logo";
import { AgentTag, Face, StatusPill, TicketCard } from "@/components/marketing/product-mock";
import { TryDemo } from "@/components/marketing/try-demo";

/* Landing page sections, top to bottom. Server components; the only client piece is TryDemo. */

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Product" },
  { href: "#compare", label: "Compare" },
  { href: "#security", label: "Security" },
];

const secondaryButton =
  "inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:text-foreground";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="Meld home" className="rounded-sm no-underline">
          <Logo size={24} />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <Link href="/login" className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground no-underline hover:bg-muted hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground no-underline hover:bg-muted hover:text-foreground"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function SectionHead({ id, kicker, title, body }: { id?: string; kicker: string; title: string; body?: string }) {
  return (
    <div className="max-w-[640px]">
      <p className="text-meta font-medium text-brand">{kicker}</p>
      <h2 id={id} className="mt-2 text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance text-foreground sm:text-[34px]">
        {title}
      </h2>
      {body && <p className="mt-3 text-[15px] leading-relaxed text-pretty text-muted-foreground">{body}</p>}
    </div>
  );
}

/* ---------- How it works ---------- */

export function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Talk",
      body: "Plan in channels, threads and DMs, the way your team already works. Nobody fills in a form.",
      visual: (
        <div className="flex gap-2.5">
          <Face who="jonas" size={24} />
          <div className="min-w-0 text-[12px] leading-[1.5]">
            <div className="font-semibold text-foreground">Jonas Weber</div>
            <div className="text-ink-2">Webhook verification is done. Idempotency keys left; should land Thursday.</div>
          </div>
        </div>
      ),
    },
    {
      n: "2",
      title: "Agents turn it into owned work",
      body: "Agents file and update tickets with an owner and a date, log the decisions you settle, and link it all back to the thread.",
      visual: <TicketCard id="ORB-4" title="Stripe webhooks for plan upgrades" status="In progress" meta="Jonas Weber · Due Thu, Nov 5" />,
    },
    {
      n: "3",
      title: "Agents drive it to done",
      body: "They follow up with owners, keep status true from what people say, and run missions to the date, flagging what needs you.",
      visual: (
        <div className="flex gap-2.5">
          <Face who="atlas" agent size={24} />
          <div className="min-w-0 text-[12px] leading-[1.5]">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              Atlas <AgentTag />
            </div>
            <div className="text-ink-2">
              ORB-4 moved to <StatusPill status="Done" />. Priya, ORB-7 is unblocked.
            </div>
          </div>
        </div>
      ),
    },
  ];
  return (
    <section aria-labelledby="how-title" id="how" className="scroll-mt-14 border-t bg-canvas">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-24">
        <SectionHead id="how-title" kicker="How it works" title="From conversation to done, without the copy and paste." />
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="flex flex-col rounded-lg border bg-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 items-center justify-center rounded-full border text-[12px] font-semibold text-foreground tabular">{s.n}</span>
                <h3 className="text-[15px] font-semibold text-foreground">{s.title}</h3>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              <div className="mt-auto pt-5" aria-hidden>
                <div className="rounded-md border bg-background p-3">{s.visual}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Features ---------- */

const AGENTS = [
  { who: "atlas", name: "Atlas", role: "Files and updates tickets, answers questions, logs decisions" },
  { who: "tess", name: "Tess", role: "Triage: turns bug reports into tickets with the right owner" },
  { who: "rex", name: "Rex", role: "Reviewer: checks plans and changes for edge cases and rollout risks" },
  { who: "sunny", name: "Sunny", role: "Standups: what changed, what's blocked and what needs a decision" },
] as const;

export function Features() {
  return (
    <section aria-labelledby="features-title" id="features" className="scroll-mt-14 border-t">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-24">
        <SectionHead
          id="features-title"
          kicker="Product"
          title="Chat and tickets in one workspace, with agents on the team."
          body="Everything a team needs to agree on work and see it through, in the place where the work is discussed."
        />

        {/* Spotlight: agents */}
        <div className="mt-12 grid items-center gap-8 rounded-lg border p-5 sm:p-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">Agents are teammates, not a sidebar</h3>
            <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
              Each agent has a name, a face and a job. Tag them in a channel, DM them, assign them a ticket or add them to a channel. They post as
              themselves, so everyone can see what they did and why.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-2">
              <Bullet>Assign a ticket to an agent and it does the work and reports back</Bullet>
              <Bullet>Agents remember what your team told them</Bullet>
              <Bullet>Build your own agents with instructions and tools</Bullet>
            </ul>
          </div>
          <ul aria-label="Agents in the demo workspace" className="divide-y rounded-md border bg-card">
            {AGENTS.map((a) => (
              <li key={a.who} className="flex items-center gap-3 px-4 py-3">
                <Face who={a.who} agent size={36} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {a.name} <AgentTag />
                  </div>
                  <div className="text-[13px] text-muted-foreground">{a.role}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Spotlight: missions */}
        <div className="mt-4 grid items-center gap-8 rounded-lg border p-5 sm:p-8 lg:grid-cols-2 lg:gap-12">
          <div className="lg:order-2">
            <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">Missions: a goal, a date, and an agent to drive it</h3>
            <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
              Describe the outcome and the deadline. The agent drafts the plan as tickets with owners and dependencies, shows the critical path, checks in,
              and asks you only for the decisions it can&apos;t make.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-2">
              <Bullet>Plan in steps, with what waits on what</Bullet>
              <Bullet>Risks and open questions surface on their own</Bullet>
              <Bullet>Check-ins post to the mission thread</Bullet>
            </ul>
          </div>
          <MissionVisual />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FeatureCard
            icon={<TicketIcon className="size-4" />}
            title="Tickets in the conversation"
            body="Ask in plain words and the ticket appears in the thread: owner, priority, due date. Type ORB- to link one; everyone sees its live status."
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
              Blocked until
              <span className="inline-flex items-center gap-1 rounded-sm border bg-card px-1.5 py-0.5">
                <span className="size-1.5 rounded-full" style={{ background: "var(--status-progress-dot)" }} />
                <span className="font-medium">ORB-4</span> Stripe webhooks for plan upgrades
              </span>
              is in.
            </div>
          </FeatureCard>
          <FeatureCard
            icon={<BookmarkIcon className="size-4" />}
            title="Decision memory"
            body="When a conversation settles something, the agent logs it with the why and what was ruled out. When it comes up again, it points people back."
          >
            <div className="text-[12px] leading-[1.5]">
              <div className="font-semibold text-foreground">The onboarding checklist is a sidebar card, not a modal.</div>
              <div className="mt-1 text-muted-foreground">
                <span className="font-medium text-ink-2">Why:</span> modals get dismissed and forgotten.
              </div>
            </div>
          </FeatureCard>
          <FeatureCard
            icon={<RadioIcon className="size-4" />}
            title="Live tickets"
            body={`Say "fixed it, PR merged" or "I'll have it by Friday" and the ticket follows: status, dates and new tickets, applied as the speaker, with Undo.`}
          >
            <div className="flex items-center gap-2 text-[12px] text-ink-2">
              <Face who="atlas" agent size={18} />
              <span>
                <span className="font-medium">ORB-8</span> Timezone bug in weekly view moved to
              </span>
              <StatusPill status="Done" />
            </div>
          </FeatureCard>
          <FeatureCard
            icon={<UsersIcon className="size-4" />}
            title="People and roles"
            body="A directory of everyone, people and agents, with titles and teams. Owners, members and guests each see and do what their role allows."
          >
            <div className="flex items-center gap-3 text-[12px]">
              <span className="flex -space-x-1.5">
                {(["maya", "jonas", "priya", "tom", "sofia"] as const).map((p) => (
                  <Face key={p} who={p} size={22} className="ring-2 ring-background" />
                ))}
              </span>
              <span className="text-muted-foreground">6 people · 4 agents · 3 roles</span>
            </div>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <CheckIcon className="mt-[3px] size-3.5 shrink-0 text-brand" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function FeatureCard({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg border p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-md border bg-muted text-foreground" aria-hidden>
          {icon}
        </span>
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-auto pt-5" aria-hidden>
        <div className="rounded-md border bg-canvas p-3">{children}</div>
      </div>
    </div>
  );
}

function MissionVisual() {
  const col = (label: string, cards: { id: string; title: string; who: "jonas" | "maya" | "priya" | "tom"; status: "To do" | "In progress" | "Done"; crit?: boolean }[]) => (
    <div className="min-w-0 flex-1">
      <div className="mb-2 text-[11px] text-muted-foreground">{label}</div>
      <div className="space-y-2">
        {cards.map((c) => (
          <div key={c.id} className={c.crit ? "rounded-md border border-l-2 border-l-brand bg-card p-2.5" : "rounded-md border bg-card p-2.5"}>
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">{c.id}</span>
              <StatusPill status={c.status} />
            </div>
            <div className="mt-1 text-[12px] leading-snug font-medium text-foreground">{c.title}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Face who={c.who} size={14} />
              {{ jonas: "Jonas", maya: "Maya", priya: "Priya", tom: "Tom" }[c.who]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div aria-hidden className="rounded-md border bg-canvas p-3 sm:p-4 lg:order-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FlagIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[13px] font-semibold text-foreground">Launch paid plans</span>
        <span className="rounded-sm border border-[var(--status-done-line)] px-1 text-[10px] leading-[14px] whitespace-nowrap text-success">On track</span>
        <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">Due Fri, Nov 6</span>
      </div>
      <div className="mt-2 mb-4 h-1 overflow-hidden rounded-full bg-line-soft">
        <div className="h-full w-1/3 rounded-full bg-brand" />
      </div>
      <div className="flex gap-2.5">
        {col("Start now", [
          { id: "ORB-4", title: "Stripe webhooks for plan upgrades", who: "jonas", status: "In progress" },
          { id: "ORB-5", title: "Pricing page refresh", who: "maya", status: "In progress", crit: true },
        ])}
        {col("Then", [
          { id: "ORB-7", title: "In-app upgrade flow in Settings", who: "priya", status: "To do" },
          { id: "ORB-6", title: "Launch email sequence", who: "tom", status: "To do", crit: true },
        ])}
        <div className="hidden min-w-0 flex-1 sm:block">
          {col("Then", [{ id: "ORB-9", title: "Product Hunt launch kit", who: "tom", status: "To do", crit: true }])}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-0.5 w-4 rounded-full bg-brand" /> Critical path: the chain that sets the finish date
      </div>
    </div>
  );
}

/* ---------- Comparison ---------- */

const ROWS: [string, string, string][] = [
  ["Where work lives", "Talk in one tool, track in another", "One workspace: channels, threads, DMs and tickets"],
  ["Thread to tickets", "Someone copies it over and re-explains", "Ask an agent; it files them with owners and dates"],
  ["Ticket status", "Updated when someone remembers", "Kept true from what people say, with Undo"],
  ["Decisions", "Lost in scrollback", "Logged with the why, surfaced when it comes up again"],
  ["Follow-ups", "A manager chases people", "Agents chase owners and post check-ins"],
  ["Deadlines", "A plan in a separate doc", "Missions: plan, owners, critical path, driven to the date"],
  ["AI", "Bots and add-ons, one per tool", "Agents as members, with names, roles and permissions"],
];

export function Compare() {
  return (
    <section aria-labelledby="compare-title" id="compare" className="scroll-mt-14 border-t bg-canvas">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-24">
        <SectionHead
          id="compare-title"
          kicker="Compare"
          title="Slack + Jira vs Meld"
          body="Slack is where work gets talked about. Jira is where it gets tracked. The gap between them is where follow-through gets lost."
        />
        <p aria-hidden className="mt-8 flex items-center gap-4 text-meta text-muted-foreground md:hidden">
          <span className="flex items-center gap-1.5">
            <MinusIcon className="size-3.5 text-subtle" /> Slack + Jira
          </span>
          <span className="flex items-center gap-1.5 text-foreground">
            <CheckIcon className="size-3.5 text-brand" /> Meld
          </span>
        </p>
        <div className="mt-3 overflow-hidden rounded-lg border bg-card md:mt-10">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">How Meld compares with using Slack and Jira together</caption>
            <thead>
              <tr className="border-b bg-muted/60">
                <th scope="col" className="w-[22%] px-5 py-3 font-medium text-muted-foreground max-md:hidden">
                  <span className="sr-only">Area</span>
                </th>
                <th scope="col" className="px-5 py-3 font-medium text-muted-foreground max-md:hidden">
                  Slack + Jira
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-foreground max-md:hidden">
                  <span className="inline-flex items-center gap-2">
                    <Logo markOnly size={16} /> Meld
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([area, old, meld]) => (
                <tr key={area} className="border-b last:border-b-0 max-md:block max-md:px-5 max-md:py-4">
                  <th scope="row" className="px-5 py-3.5 align-top font-medium text-foreground max-md:block max-md:p-0">
                    {area}
                  </th>
                  <td className="px-5 py-3.5 align-top text-muted-foreground max-md:mt-2 max-md:flex max-md:gap-2 max-md:p-0">
                    <MinusIcon className="mt-[3px] size-3.5 shrink-0 text-subtle md:hidden" aria-hidden />
                    <span>
                      <span className="sr-only md:hidden">Slack + Jira: </span>
                      {old}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 align-top text-foreground max-md:mt-1.5 max-md:flex max-md:gap-2 max-md:p-0">
                    <span className="flex gap-2">
                      <CheckIcon className="mt-[3px] size-3.5 shrink-0 text-brand" aria-hidden />
                      <span>
                        <span className="sr-only md:hidden">Meld: </span>
                        {meld}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- Trust ---------- */

const TRUST = [
  {
    icon: <UsersIcon className="size-4" />,
    title: "Roles and permissions",
    body: "Owners, members and guests. Guests see only the tickets assigned to them; only owners can delete tickets.",
  },
  {
    icon: <KeyRoundIcon className="size-4" />,
    title: "Agents act with your access",
    body: "An agent works with the role of the person who asked, never more, and the check runs again when a change is applied.",
  },
  {
    icon: <Undo2Icon className="size-4" />,
    title: "Confirm and undo",
    body: "Deletes and bulk changes wait for your confirmation. Every agent change can be undone for 10 minutes.",
  },
  {
    icon: <MapPinIcon className="size-4" />,
    title: "EU data residency",
    body: "Your workspace data is stored and served in the EU, in Ireland.",
  },
];

export function Trust() {
  return (
    <section aria-labelledby="security-title" id="security" className="scroll-mt-14 border-t">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <SectionHead
              id="security-title"
              kicker="Security and control"
              title="Agents with the same rules as everyone else."
              body="Meld gives agents real work, so they get real guardrails: the permissions of the person they act for, a confirmation step for anything big, and an undo for everything."
            />
            <p className="mt-5 flex items-center gap-2 text-meta text-muted-foreground">
              <ShieldCheckIcon className="size-4 text-success" aria-hidden />
              Permissions are checked on the server for every request.
            </p>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
            {TRUST.map((t) => (
              <li key={t.title} className="bg-background p-6">
                <span className="flex size-7 items-center justify-center rounded-md border bg-muted text-foreground" aria-hidden>
                  {t.icon}
                </span>
                <h3 className="mt-3 text-[15px] font-semibold text-foreground">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- Closing CTA and footer ---------- */

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="border-t bg-canvas">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-8 px-5 py-20 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-[560px]">
          <h2 id="cta-title" className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance text-foreground sm:text-[34px]">
            See a team where the work gets done.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Open a private copy of Orbit Labs: six people, four agents, a mission due Friday. No sign-up.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2.5">
          {/* A different label from the hero button, so "Try the live demo" stays unique on the page. */}
          <TryDemo label="Open the live demo" />
          <Link href="/login?mode=signup" className={secondaryButton}>
            Create your workspace
          </Link>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const col = "flex flex-col gap-2 text-sm";
  const link = "text-muted-foreground no-underline hover:text-foreground";
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo size={24} />
          <p className="mt-3 max-w-[320px] text-sm leading-relaxed text-muted-foreground">
            Team chat and tickets, with AI agents as teammates. Slack is where work gets talked about. Meld is where it gets done.
          </p>
        </div>
        <nav aria-label="Product" className={col}>
          <span className="font-medium text-foreground">Product</span>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={link}>
              {n.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Account" className={col}>
          <span className="font-medium text-foreground">Account</span>
          <Link href="/login" className={link}>
            Sign in
          </Link>
          <Link href="/login?mode=signup" className={link}>
            Create your workspace
          </Link>
        </nav>
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 border-t px-5 py-5 text-meta text-muted-foreground sm:px-8">
        <span>© 2026 Meld</span>
        <span className="flex items-center gap-1.5">
          <MapPinIcon className="size-3.5" aria-hidden /> Data stored in the EU (Ireland)
        </span>
      </div>
    </footer>
  );
}

