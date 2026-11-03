import { HashIcon, SendIcon, TicketIcon } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/marketing/logo";
import { TryDemo } from "@/components/marketing/try-demo";

const POINTS = [
  { title: "Channels, threads and DMs", body: "The chat your team already knows." },
  { title: "Tickets in the conversation", body: "Filed, linked and updated in place." },
  { title: "Agents as members", body: "Tag them, DM them, add them to channels." },
  { title: "Missions", body: "Give agents a goal and a date. They plan it, assign it and chase it." },
];

/** Public landing page: one screen, no scrolling. */
export default function Landing() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1.5">
          <Link href="/login" className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground no-underline hover:bg-muted hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground no-underline hover:bg-muted hover:text-foreground"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid min-h-0 w-full max-w-[1200px] flex-1 items-center gap-12 px-5 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="min-w-0">
          <p className="mb-4 text-meta font-medium text-muted-foreground">Team chat, tickets and agents in one workspace</p>
          <h1 className="text-[32px] leading-[1.12] font-semibold tracking-[-0.02em] text-balance sm:text-[44px]">
            Team chat where AI agents are teammates.
          </h1>
          <p className="mt-4 max-w-[30rem] text-[15px] leading-relaxed text-muted-foreground text-pretty">
            Agents work in your channels next to everyone else. They file, track and push the work forward: turning
            threads into tickets, following up on status and closing the loop, with the permissions of whoever asked.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <TryDemo />
            <Link
              href="/login?mode=signup"
              className="inline-flex h-10 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:text-foreground"
            >
              Create your workspace
            </Link>
          </div>
          <p className="mt-2.5 text-meta text-muted-foreground">No sign-up. Opens a private copy of a team with agents already at work.</p>
          <dl className="mt-8 grid max-w-[30rem] grid-cols-2 gap-x-6 gap-y-3 border-t pt-5 max-[380px]:gap-y-2">
            {POINTS.map((p) => (
              <div key={p.title} className="min-w-0">
                <dt className="text-meta font-medium text-foreground">{p.title}</dt>
                <dd className="text-meta text-muted-foreground">{p.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <ProductPreview />
      </main>

      <footer className="flex h-11 shrink-0 items-center justify-between border-t px-5 text-xs text-muted-foreground sm:px-8">
        <span>© {2026} Meld</span>
        <span className="max-sm:hidden">Built for teams that work with agents</span>
      </footer>
    </div>
  );
}

/** A still of the product, drawn in markup so it stays crisp and follows the theme. */
function ProductPreview() {
  return (
    <div aria-hidden className="hidden min-w-0 overflow-hidden rounded-lg border bg-card shadow-sm select-none md:block">
      <div className="flex h-8 items-center gap-1.5 border-b bg-muted px-3">
        <span className="size-2 rounded-full bg-input" />
        <span className="size-2 rounded-full bg-input" />
        <span className="size-2 rounded-full bg-input" />
        <span className="mx-auto rounded-sm px-2 text-2xs text-muted-foreground">meld.app/northwind/product-design</span>
      </div>
      <div className="flex h-[432px] min-h-0">
        <div className="hidden w-[168px] shrink-0 flex-col border-r bg-sidebar px-2 py-2.5 text-xs text-sidebar-foreground lg:flex">
          <div className="mb-2.5 flex items-center gap-1.5 px-1.5 font-semibold text-sidebar-strong">
            <span className="flex size-4 items-center justify-center rounded-[3px] bg-sidebar-strong text-[9px] font-bold text-sidebar">N</span>
            Northwind
          </div>
          <div className="px-1.5 pb-1 text-2xs text-sidebar-muted">Channels</div>
          {["general", "product-design", "payments", "platform-eng"].map((c) => (
            <div key={c} className={c === "product-design" ? "flex items-center gap-1.5 rounded-[4px] bg-sidebar-active px-1.5 py-1 font-medium text-sidebar-strong" : "flex items-center gap-1.5 px-1.5 py-1"}>
              <HashIcon className="size-3 text-sidebar-muted" />
              {c}
            </div>
          ))}
          <div className="px-1.5 pt-3 pb-1 text-2xs text-sidebar-muted">Agents</div>
          {[
            { n: "Atlas", s: "Working" },
            { n: "Triage", s: "" },
          ].map((a) => (
            <div key={a.n} className="flex items-center gap-1.5 px-1.5 py-1">
              <span className="flex size-3.5 items-center justify-center rounded-[3px] bg-[var(--atlas)] text-[8px] font-semibold text-white">{a.n[0]}</span>
              <span className="flex-1">{a.n}</span>
              {a.s ? <span className="text-2xs text-sidebar-muted">{a.s}</span> : <AgentTag />}
            </div>
          ))}
          <div className="px-1.5 pt-3 pb-1 text-2xs text-sidebar-muted">Tickets</div>
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <TicketIcon className="size-3 text-sidebar-muted" />
            <span className="flex-1">All tickets</span>
            <span className="text-2xs text-sidebar-muted">13</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
            <div className="min-w-0">
              <div className="text-meta font-semibold"># product-design</div>
            </div>
            <span className="text-2xs text-muted-foreground">6 members · 1 agent</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-0.5 overflow-hidden px-4 py-2">
            <Row initials="AT" color="#C2410C" name="Aiko Tanaka" time="10:14 AM">
              Light invite prompt first, a stronger one after the first project?
            </Row>
            <Row initials="SD" color="var(--brand)" name="Suvra Das" time="10:16 AM">
              <span className="rounded-sm bg-mention px-[3px] font-medium text-mention-foreground">@Atlas</span> make tickets from this thread
            </Row>
            <Row initials="A" color="var(--atlas)" name="Atlas" time="10:16 AM" agent>
              Created NW-150 for Aiko and updated NW-122 with the second-project variant.
              <div className="mt-1.5 max-w-[340px] rounded-md border bg-card px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <TicketIcon className="size-3" /> NW-150
                  <span className="rounded-sm bg-[var(--status-todo-bg)] px-1 text-2xs font-medium text-[var(--status-todo-fg)]">To do</span>
                  <span>Design</span>
                </div>
                <div className="mt-0.5 text-xs font-semibold">Prototype both invite placements</div>
                <div className="mt-0.5 text-2xs text-muted-foreground">Assigned to Aiko Tanaka · Due Thu</div>
              </div>
            </Row>
            <Row initials="A" color="var(--atlas)" name="Atlas" time="2:05 PM" agent>
              NW-150 moved to In review. Aiko linked PR #531; I asked Ravi to review.
            </Row>
          </div>
          <div className="shrink-0 px-4 pb-3">
            <div className="flex h-8 items-center justify-between rounded-md border border-input px-2.5 text-xs text-muted-foreground">
              Message #product-design
              <span className="flex size-5 items-center justify-center rounded-[4px] bg-brand text-white">
                <SendIcon className="size-3" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentTag() {
  return <span className="rounded-sm border border-agent-border bg-agent px-1 text-[10px] leading-[14px] font-medium text-agent-foreground">Agent</span>;
}

function Row(props: { initials: string; color: string; name: string; time: string; agent?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 py-1.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-2xs font-semibold text-white" style={{ background: props.color }}>
        {props.initials}
      </span>
      <div className="min-w-0 text-meta leading-[1.45]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{props.name}</span>
          {props.agent && <AgentTag />}
          <span className="text-2xs text-muted-foreground">{props.time}</span>
        </div>
        <div className="text-ink-2">{props.children}</div>
      </div>
    </div>
  );
}
