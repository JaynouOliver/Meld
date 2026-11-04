/* eslint-disable @next/next/no-img-element -- small static SVG faces from our own origin */
import { BookmarkIcon, FlagIcon, HashIcon, SendIcon, TicketIcon, UsersIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Stills of the product, drawn in markup so they stay crisp, follow the theme and load
 * with the page. Names, tickets and faces match the "Try the live demo" sandbox
 * (Orbit Labs), so what a visitor sees here is what they get one click later.
 */

/** Faces from public/avatars: agents are circles, people rounded squares (as in the app). */
export const FACES = {
  atlas: "/avatars/agent-atlas.svg",
  tess: "/avatars/agent-tess.svg",
  rex: "/avatars/agent-rex.svg",
  sunny: "/avatars/agent-sunny.svg",
  maya: "/avatars/person-18.svg",
  jonas: "/avatars/person-5.svg",
  priya: "/avatars/person-9.svg",
  tom: "/avatars/person-12.svg",
  sofia: "/avatars/person-20.svg",
  alex: "/avatars/person-3.svg",
} as const;

export function Face({ who, size = 28, agent, className }: { who: keyof typeof FACES; size?: number; agent?: boolean; className?: string }) {
  return (
    <img
      src={FACES[who]}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={cn("shrink-0 bg-muted", agent ? "rounded-full" : "rounded-[6px]", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function AgentTag() {
  return <span className="rounded-sm border border-agent-border bg-agent px-1 text-[10px] leading-[14px] font-medium text-agent-foreground">Agent</span>;
}

export function StatusPill({ status }: { status: "To do" | "In progress" | "In review" | "Done" }) {
  const key = { "To do": "todo", "In progress": "progress", "In review": "review", Done: "done" }[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 text-[11px] leading-[18px] font-medium"
      style={{ background: `var(--status-${key}-bg)`, color: `var(--status-${key}-fg)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: `var(--status-${key}-dot)` }} />
      {status}
    </span>
  );
}

/** A ticket card as Atlas posts it in a message. */
export function TicketCard({ id, title, status, meta, className }: { id: string; title: string; status: "To do" | "In progress" | "In review" | "Done"; meta: string; className?: string }) {
  return (
    <div className={cn("rounded-md border bg-card px-3 py-2.5", className)}>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <TicketIcon className="size-3" />
        <span className="font-mono tracking-tight">{id}</span>
        <StatusPill status={status} />
      </div>
      <div className="mt-1 text-[13px] font-semibold text-foreground">{title}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{meta}</div>
    </div>
  );
}

function Message({ who, name, time, agent, children }: { who: keyof typeof FACES; name: string; time: string; agent?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 py-1.5">
      <Face who={who} agent={agent} size={28} />
      <div className="min-w-0 flex-1 text-[13px] leading-[1.5]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground">{name}</span>
          {agent && <AgentTag />}
          <span className="text-[11px] text-muted-foreground">{time}</span>
        </div>
        <div className="text-ink-2">{children}</div>
      </div>
    </div>
  );
}

function Mention({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm bg-mention px-[3px] font-medium text-mention-foreground">{children}</span>;
}

/** Hero visual: #product in Orbit Labs, with Atlas logging a decision and updating a ticket. */
export function HeroMock() {
  return (
    <div className="relative">
      <div
        role="img"
        aria-label="The Meld app: in #product, Sofia settles the annual plan offer, Maya commits to a date, and Atlas logs the decision and updates her ticket."
        className="overflow-hidden rounded-lg border bg-card shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06),0_12px_32px_-12px_rgb(var(--shadow-color)/0.18)] select-none"
      >
        <div aria-hidden className="flex min-h-0 sm:h-[464px]">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-foreground"># product</div>
                <div className="truncate text-[11px] text-muted-foreground">Pricing, plans and the paid launch</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] text-muted-foreground">
                <span className="flex -space-x-1.5">
                  <Face who="atlas" agent size={16} className="ring-2 ring-card" />
                  <Face who="tess" agent size={16} className="ring-2 ring-card" />
                  <Face who="rex" agent size={16} className="ring-2 ring-card" />
                </span>
                4 agents
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 py-2 max-sm:pt-3">
              <Message who="sofia" name="Sofia Rossi" time="10:12 AM">
                Settled: annual plans get 2 months free. <Mention>@Maya</Mention> can pricing show it by Thursday?
              </Message>
              <Message who="maya" name="Maya Chen" time="10:14 AM">
                Yes, it&apos;ll be in review by Thursday.
              </Message>
              <Message who="atlas" name="Atlas" time="10:14 AM" agent>
                Logged the decision and updated ORB-5 for Maya.
                <div className="mt-1.5 flex max-w-[360px] items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-[12px]">
                  <BookmarkIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-foreground">Decision:</span> annual plans get 2 months free
                  </span>
                </div>
                <TicketCard
                  className="mt-1.5 max-w-[360px]"
                  id="ORB-5"
                  title="Pricing page refresh"
                  status="In progress"
                  meta="Maya Chen · Due Thu, Nov 5 · Launch paid plans"
                />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Changed by Atlas for Sofia · <span className="font-medium text-link">Undo</span>
                </div>
              </Message>
            </div>
            <div className="shrink-0 px-4 pb-3">
              <div className="flex h-9 items-center justify-between rounded-md border border-input px-3 text-[12px] text-muted-foreground">
                Message #product
                <span className="flex size-6 items-center justify-center rounded-[4px] bg-brand text-white">
                  <SendIcon className="size-3" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <MissionOverlay />
    </div>
  );
}

function Sidebar() {
  const item = "flex items-center gap-2 rounded-[4px] px-2 py-[5px]";
  return (
    <div className="hidden w-[176px] shrink-0 flex-col border-r bg-sidebar px-2 py-3 text-[12px] text-sidebar-foreground md:flex lg:hidden xl:flex">
      <div className="mb-3 flex items-center gap-2 px-2 font-semibold text-sidebar-strong">
        <span className="flex size-[18px] items-center justify-center rounded-[4px] bg-sidebar-strong text-[10px] font-bold text-sidebar">O</span>
        Orbit Labs
      </div>
      <div className={item}>
        <FlagIcon className="size-3.5 text-sidebar-muted" />
        <span className="flex-1">Missions</span>
        <span className="rounded-sm border border-[var(--status-review-line)] bg-warning-soft px-1 text-[10px] leading-[14px] text-warning">Needs you</span>
      </div>
      <div className={item}>
        <BookmarkIcon className="size-3.5 text-sidebar-muted" />
        Decisions
      </div>
      <div className={item}>
        <UsersIcon className="size-3.5 text-sidebar-muted" />
        People
      </div>
      <div className="px-2 pt-3 pb-1 text-[11px] text-sidebar-muted">Channels</div>
      {["general", "product", "engineering", "design"].map((c) => (
        <div key={c} className={cn(item, c === "product" && "bg-sidebar-active font-medium text-sidebar-strong")}>
          <HashIcon className="size-3.5 text-sidebar-muted" />
          {c}
        </div>
      ))}
      <div className="px-2 pt-3 pb-1 text-[11px] text-sidebar-muted">Agents</div>
      {(["atlas", "tess", "rex", "sunny"] as const).map((a) => (
        <div key={a} className={item}>
          <Face who={a} agent size={16} />
          <span className="flex-1 capitalize">{a}</span>
        </div>
      ))}
    </div>
  );
}

/** A mission card floating over the frame: the "driven to a date" half of the story. */
function MissionOverlay() {
  return (
    <div
      aria-hidden
      className="absolute -right-5 -bottom-[88px] hidden w-[256px] rounded-lg border bg-popover p-3.5 shadow-lg lg:block"
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <FlagIcon className="size-3.5" />
        Mission
        <span className="ml-auto rounded-sm border border-[var(--status-done-line)] px-1 text-[10px] leading-[14px] text-success">On track</span>
      </div>
      <div className="mt-1.5 text-[13px] font-semibold text-foreground">Launch paid plans</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">Due Fri, Nov 6 · 2 of 6 done · 5 owners</div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-line-soft">
        <div className="h-full w-1/3 rounded-full bg-brand" />
      </div>
    </div>
  );
}
