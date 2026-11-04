"use client";

import { CornerDownRightIcon, LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";

import { useDirectory } from "@/hooks/use-directory";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { STATUS_COLORS } from "@/lib/constants";
import { agentsOf, ATLAS_ID, personOf } from "@/lib/directory";
import { isSinglePara, parseMessage, type InlinePart, type ListItem } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

// Chips are short lines of text; this extends their tap area vertically on touch screens.
const HIT = "relative after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']";

/**
 * Message body: highlights @mentions and turns ticket ids (NW-121) into ticket chips.
 * Chips respect RBAC: tickets the role can't see render as "Restricted",
 * deleted tickets render as plain text. Formatting (src/lib/markdown.ts): **bold**,
 * _italic_, `code`, ``` code blocks ```, "- " lists and links. `after` (e.g. "(edited)")
 * ends the last paragraph.
 */
export function RichText({ text, className, after }: { text: string; className?: string; after?: React.ReactNode }) {
  const dir = useDirectory();
  const blocks = parseMessage(text, dir.workspace.ticketPrefix);

  // A plain message stays one <p>, exactly as before.
  if (isSinglePara(blocks)) {
    return (
      <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", className)}>
        <Inline parts={blocks[0].parts} />
        {after}
      </p>
    );
  }
  const lastPara = blocks[blocks.length - 1].kind === "para";
  return (
    <div className={cn("flex flex-col gap-1.5 [overflow-wrap:anywhere]", className)}>
      {blocks.map((b, i) => {
        const end = i === blocks.length - 1 && lastPara ? after : null;
        if (b.kind === "para") {
          return (
            <p key={i} className="whitespace-pre-wrap">
              <Inline parts={b.parts} />
              {end}
            </p>
          );
        }
        if (b.kind === "code") {
          return (
            <pre key={i} className="max-w-full overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-[12.5px] leading-[1.55] whitespace-pre [overflow-wrap:normal]">
              <code>{b.text}</code>
            </pre>
          );
        }
        return <List key={i} items={b.items} />;
      })}
      {!lastPara && after ? <span>{after}</span> : null}
    </div>
  );
}

function List({ items }: { items: ListItem[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5 marker:text-muted-foreground [&_ul]:mt-0.5 [&_ul]:list-[circle]">
      {items.map((it, i) => (
        <li key={i} className="whitespace-pre-wrap">
          <Inline parts={it.parts} />
          {it.children.length > 0 && <List items={it.children} />}
        </li>
      ))}
    </ul>
  );
}

/** Who an @mention names: an agent by handle ("@agent" is Atlas), or a person by first name. */
function mentionTarget(dir: ReturnType<typeof useDirectory>, text: string): string | null {
  const h = text.slice(1).toLowerCase();
  if (h === "agent") return ATLAS_ID;
  const agent = agentsOf(dir).find((a) => a.handle.toLowerCase() === h);
  if (agent) return agent.id;
  const person = Object.values(dir.people).find((p) => !p.isAgent && p.first.toLowerCase() === h);
  return person?.id ?? null;
}

/** One run of formatted text: mentions, ticket chips, citations, code, links, bold and italic. */
function Inline({ parts: input }: { parts: InlinePart[] }) {
  const dir = useDirectory();
  const { lookup } = useVisibleTickets();
  const openTicket = useUiStore((s) => s.openTicket);
  // Copied: trailing punctuation is moved onto the chip below.
  const parts = [...input];

  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const styled = (node: React.ReactNode) => (part.bold || part.italic ? <span key={i} className={cn(part.bold && "font-semibold", part.italic && "italic")}>{node}</span> : node);
    if (part.kind === "code") {
      out.push(
        styled(
          <code key={i} className="rounded-[4px] border bg-muted px-1 py-px font-mono text-[0.86em] text-foreground">
            {part.text}
          </code>,
        ),
      );
      continue;
    }
    if (part.kind === "link") {
      out.push(
        styled(
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="text-link underline-offset-2 hover:underline">
            {part.text}
          </a>,
        ),
      );
      continue;
    }
    if (part.kind === "cite") {
      out.push(<CiteChip key={i} chatId={part.chatId} threadId={part.threadId} id={part.id} />);
      continue;
    }
    if (part.kind === "mention") {
      const who = mentionTarget(dir, part.text);
      out.push(
        styled(
          who ? (
            <button key={i} type="button" data-profile={who} className="no-press cursor-pointer rounded-sm bg-mention px-[3px] font-medium text-mention-foreground hover:underline">
              {part.text}
            </button>
          ) : (
            <span key={i} className="rounded-sm bg-mention px-[3px] font-medium text-mention-foreground">
              {part.text}
            </span>
          ),
        ),
      );
      continue;
    }
    if (part.kind === "ticket") {
      const { ticket, locked } = lookup(part.id);
      let chip: React.ReactNode = null;
      if (locked) chip = <LockedChip id={part.id} />;
      else if (ticket) {
        chip = (
          <button
            type="button"
            onClick={() => openTicket(ticket.id)}
            title={`Open ${ticket.id}`}
            className={cn(
              HIT,
              "mx-px inline-flex max-w-full cursor-pointer items-center gap-[5px] rounded-sm border border-border bg-muted px-1.5 align-baseline text-[13px] leading-[1.6] font-medium text-foreground transition-colors hover:border-input hover:bg-accent",
            )}
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLORS[ticket.status][3] }} />
            <span className="shrink-0 whitespace-nowrap">{ticket.id}</span>
            <span className="max-w-[260px] min-w-0 truncate font-normal text-ink-2">{ticket.title || "Untitled ticket"}</span>
          </button>
        );
      }
      if (chip) {
        // Keep trailing punctuation ("NW-121:") on the chip's line instead of wrapping alone.
        const next: InlinePart | undefined = parts[i + 1];
        const punct = next?.kind === "text" ? next.text.match(/^[:.,;!?)]+/)?.[0] : undefined;
        if (punct && next) {
          parts[i + 1] = { ...next, kind: "text", text: next.text.slice(punct.length) };
          out.push(
            <span key={i} className="inline-flex max-w-full items-baseline whitespace-nowrap">
              {chip}
              {punct}
            </span>,
          );
        } else out.push(<span key={i}>{chip}</span>);
        continue;
      }
    }
    if (part.text) out.push(part.bold || part.italic ? styled(part.text) : <span key={i}>{part.text}</span>);
  }
  return <>{out}</>;
}

/**
 * A ticket the viewer's role can't see. Tapping (or clicking) explains why.
 * A Popover, not a Tooltip: tooltips don't open on touch and close on pointerdown.
 */
function LockedChip({ id }: { id: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-chip
          className={cn(
            HIT,
            "mx-px inline-flex cursor-help items-center gap-1 rounded-sm border border-dashed border-subtle bg-card px-1.5 align-baseline text-[13px] leading-[1.6] font-medium text-muted-foreground",
          )}
        >
          <LockIcon className="size-3" strokeWidth={2.4} />
          {id} · Restricted
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={8}
          // Portaled content still bubbles React events to the message row; don't open the thread.
          onClick={(e) => e.stopPropagation()}
          className="z-50 max-w-64 rounded-sm bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md animate-in fade-in-0 zoom-in-95"
        >
          Your role can’t see this ticket. Ask an org owner or someone on its team.
          <Popover.Arrow className="fill-foreground" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A verified source Atlas cited. Tapping jumps to the message (opening its thread). */
function CiteChip({ chatId, threadId, id }: { chatId: string; threadId: string | null; id: string }) {
  const router = useRouter();
  const dir = useDirectory();
  const meta = dir.chats[chatId];
  if (!meta) return null;
  const label = meta.kind === "channel" ? `#${meta.label}` : personOf(dir, meta.who).first;
  return (
    <button
      type="button"
      data-chip
      title="Jump to the message"
      onClick={(e) => {
        e.stopPropagation();
        useUiStore.setState({ focus: { chatId, threadId, id }, ticketId: null });
        router.push(`/chat/${chatId}`);
      }}
      className={cn(
        HIT,
        "mx-px inline-flex cursor-pointer items-center gap-0.5 rounded-sm border border-border bg-muted px-1 align-baseline text-[11px] leading-[1.6] font-medium text-muted-foreground transition-colors hover:border-input hover:text-foreground",
      )}
    >
      <CornerDownRightIcon aria-hidden className="size-3" />
      {label}
      {threadId && <span className="font-normal">· thread</span>}
      <span className="sr-only"> (source message)</span>
    </button>
  );
}
