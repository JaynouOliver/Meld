import { HashIcon, MessagesSquareIcon, ShieldCheckIcon, TicketIcon } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/marketing/logo";

/** Public landing page: one screen, no scrolling. */
export default function Landing() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between px-5 py-4 sm:px-10">
        <Logo className="text-lg" />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link href="/login?mode=signup" className="rounded-md bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90">
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-6xl min-h-0 flex-1 items-center gap-10 px-5 sm:px-10 md:grid-cols-[1.05fr_1fr]">
        <section>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-meta text-muted-foreground">
            <span className="size-1.5 rounded-full bg-atlas" /> Team chat with an agent that does the busywork
          </p>
          <h1 className="text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl">
            Talk it through.
            <br />
            <span className="text-brand">Atlas files the tickets.</span>
          </h1>
          <p className="mt-5 max-w-md text-body text-muted-foreground text-pretty">
            Channels, threads and DMs for your company, with tickets built in. Tag @Atlas to create, update or
            close tickets, ask where things stand, or turn a thread into tasks. It acts with your permissions.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login?mode=signup" className="rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
              Create your workspace
            </Link>
            <Link href="/login" className="rounded-lg border px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted">
              Sign in
            </Link>
          </div>
          <ul className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-3 text-meta text-muted-foreground">
            <li className="flex items-center gap-2"><HashIcon className="size-4 text-foreground" /> Channels and threads</li>
            <li className="flex items-center gap-2"><TicketIcon className="size-4 text-foreground" /> Tickets in the chat</li>
            <li className="flex items-center gap-2"><MessagesSquareIcon className="size-4 text-foreground" /> An agent you can tag</li>
            <li className="flex items-center gap-2"><ShieldCheckIcon className="size-4 text-foreground" /> Roles and permissions</li>
          </ul>
        </section>

        <ProductPreview />
      </main>

      <footer className="px-5 py-4 text-meta text-muted-foreground sm:px-10">© {2026} Meld</footer>
    </div>
  );
}

/** A still of the product, drawn in markup so it stays crisp and follows the theme. */
function ProductPreview() {
  return (
    <div aria-hidden className="hidden rounded-2xl border bg-card p-5 shadow-lg md:block">
      <div className="mb-4 flex items-center justify-between border-b pb-3">
        <span className="font-bold"># product-design</span>
        <span className="text-meta text-muted-foreground">3 members</span>
      </div>
      <Bubble initials="AT" color="#C2410C" name="Aiko" time="10:14 AM">
        What if we keep a light invite prompt up front and a stronger one after the first project?
      </Bubble>
      <Bubble initials="SD" color="var(--brand)" name="Suvra" time="10:16 AM">
        <span className="rounded bg-mention px-1 font-semibold text-mention-foreground">@Atlas</span> make tickets from this thread
      </Bubble>
      <Bubble initials="A" color="var(--atlas)" name="Atlas" time="10:16 AM" agent>
        Created NW-150 for Aiko and updated NW-122 with the second-project variant.
        <div className="mt-2.5 rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-meta text-muted-foreground">
            <TicketIcon className="size-3.5" /> NW-150
            <span className="rounded-full bg-[var(--status-todo-bg)] px-2 py-px text-2xs font-semibold text-[var(--status-todo-fg)]">To do</span>
          </div>
          <div className="mt-1 text-sm font-semibold">Prototype both invite placements</div>
          <div className="mt-1 text-meta text-muted-foreground">Assigned to Aiko Tanaka · Design</div>
        </div>
      </Bubble>
    </div>
  );
}

function Bubble(props: { initials: string; color: string; name: string; time: string; agent?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: props.color }}>
        {props.initials}
      </span>
      <div className="min-w-0 text-sm leading-relaxed">
        <div className="flex items-baseline gap-2">
          <span className="font-bold">{props.name}</span>
          {props.agent && <span className="rounded bg-agent px-1.5 text-2xs font-bold text-agent-foreground">AGENT</span>}
          <span className="text-xs text-muted-foreground">{props.time}</span>
        </div>
        <div>{props.children}</div>
      </div>
    </div>
  );
}
