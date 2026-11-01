"use client";

import { LockIcon } from "lucide-react";
import { Popover } from "radix-ui";

import { useVisibleTickets } from "@/hooks/use-tickets";
import { STATUS_COLORS } from "@/lib/constants";
import { splitText, type TextPart } from "@/lib/text";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

// Chips are short lines of text; this extends their tap area vertically on touch screens.
const HIT = "relative after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']";

/**
 * Message body: highlights @mentions and turns NW- ids into ticket chips.
 * Chips respect RBAC: tickets the role can't see render as "Restricted",
 * deleted tickets render as plain text.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const { lookup } = useVisibleTickets();
  const openTicket = useUiStore((s) => s.openTicket);
  const parts = splitText(text);

  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.kind === "mention") {
      out.push(
        <span key={i} className="rounded bg-mention px-[3px] font-semibold text-mention-foreground">
          {part.text}
        </span>,
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
              "mx-px inline-flex max-w-full cursor-pointer items-center gap-[5px] rounded-md border border-[#D5D9E0] bg-muted px-1.5 align-baseline text-[13px] leading-[1.6] font-semibold text-foreground transition-colors hover:border-[#9DB6F0] hover:bg-selected",
            )}
          >
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLORS[ticket.status][3] }} />
            <span className="shrink-0 whitespace-nowrap">{ticket.id}</span>
            <span className="max-w-[260px] min-w-0 truncate font-normal text-ink-2">{ticket.title || "Untitled ticket"}</span>
          </button>
        );
      }
      if (chip) {
        // Keep trailing punctuation ("NW-121:") on the chip's line instead of wrapping alone.
        const next: TextPart | undefined = parts[i + 1];
        const punct = next?.kind === "text" ? next.text.match(/^[:.,;!?)]+/)?.[0] : undefined;
        if (punct && next) {
          parts[i + 1] = { kind: "text", text: next.text.slice(punct.length) };
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
    if (part.text) out.push(<span key={i}>{part.text}</span>);
  }

  return <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", className)}>{out}</p>;
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
            "mx-px inline-flex cursor-help items-center gap-1 rounded-md border border-dashed border-[#B8BEC8] bg-white px-1.5 align-baseline text-[13px] leading-[1.6] font-semibold text-muted-foreground",
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
          className="z-50 max-w-64 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-md animate-in fade-in-0 zoom-in-95"
        >
          Your role can’t see this ticket. Ask an org owner or someone on its team.
          <Popover.Arrow className="fill-foreground" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
