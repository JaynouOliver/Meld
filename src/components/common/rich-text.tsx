"use client";

import { LockIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { STATUS_COLORS } from "@/lib/constants";
import { splitText } from "@/lib/text";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/**
 * Message body: highlights @mentions and turns NW- ids into ticket chips.
 * Chips respect RBAC: tickets the role can't see render as "Restricted",
 * deleted tickets render as plain text.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const { lookup } = useVisibleTickets();
  const openTicket = useUiStore((s) => s.openTicket);

  return (
    <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", className)}>
      {splitText(text).map((part, i) => {
        if (part.kind === "mention") {
          return (
            <span key={i} className="rounded bg-mention px-[3px] font-semibold text-mention-foreground">
              {part.text}
            </span>
          );
        }
        if (part.kind === "ticket") {
          const { ticket, locked } = lookup(part.id);
          if (locked) {
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="mx-px inline-flex items-center gap-1 rounded-md border border-dashed border-[#B8BEC8] bg-white px-1.5 align-baseline text-[13px] leading-[1.6] font-semibold text-muted-foreground"
                  >
                    <LockIcon className="size-3" strokeWidth={2.4} />
                    {part.id} · Restricted
                  </span>
                </TooltipTrigger>
                <TooltipContent>Your role can’t see this ticket</TooltipContent>
              </Tooltip>
            );
          }
          if (ticket) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => openTicket(ticket.id)}
                title={`Open ${ticket.id}`}
                className="mx-px inline-flex max-w-full cursor-pointer items-center gap-[5px] rounded-md border border-[#D5D9E0] bg-muted px-1.5 align-baseline text-[13px] leading-[1.6] font-semibold text-foreground transition-colors hover:border-[#9DB6F0] hover:bg-selected"
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLORS[ticket.status][3] }} />
                <span className="shrink-0 whitespace-nowrap">{ticket.id}</span>
                <span className="min-w-0 max-w-[260px] truncate font-normal text-ink-2">{ticket.title || "Untitled ticket"}</span>
              </button>
            );
          }
        }
        return <span key={i}>{part.text}</span>;
      })}
    </p>
  );
}
