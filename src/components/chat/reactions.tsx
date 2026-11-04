"use client";

import { Trash2Icon } from "lucide-react";

import { useDirectory } from "@/hooks/use-directory";
import { useToggleReaction } from "@/hooks/use-messages";
import { personOf } from "@/lib/directory";
import type { ChatId, Message, PersonId, ReplyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Reactions under a message. Agents use 👀 to show they've picked a message up (it's
 * replaced by their reply), so the chip names who's looking. With `onToggle`, each chip
 * is a button that adds or removes your reaction.
 */
export function Reactions({
  reactions,
  me,
  onToggle,
}: {
  reactions?: Record<string, PersonId[]>;
  me?: PersonId;
  onToggle?: (emoji: string, on: boolean) => void;
}) {
  const dir = useDirectory();
  const entries = Object.entries(reactions ?? {}).filter(([, who]) => who.length);
  if (!entries.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {entries.map(([emoji, who]) => {
        const names = who.map((id) => personOf(dir, id).name);
        const label = emoji === "👀" ? `${names.join(", ")} ${who.length === 1 ? "is" : "are"} looking at this` : names.join(", ");
        const mine = !!me && who.includes(me);
        const body = (
          <>
            <span aria-hidden>{emoji}</span>
            <span className={cn("tabular", mine ? "text-brand" : "text-ink-2")}>{emoji === "👀" ? names.join(", ") : who.length}</span>
            <span className="sr-only">{label}</span>
          </>
        );
        const chip = cn(
          "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-px text-xs",
          mine ? "border-brand/50 bg-selected" : "bg-muted",
        );
        if (!onToggle) {
          return (
            <span key={emoji} title={label} className={chip}>
              {body}
            </span>
          );
        }
        return (
          <button
            key={emoji}
            type="button"
            title={label}
            aria-pressed={mine}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(emoji, !mine);
            }}
            className={cn(chip, "cursor-pointer transition-colors hover:border-subtle pointer-coarse:min-h-8")}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/** A message's reactions as toggle buttons (yours highlighted). */
export function MessageReactions({ chatId, node }: { chatId: ChatId; node: Message | ReplyNode }) {
  const me = useDirectory().me;
  const react = useToggleReaction();
  if (node.deletedAt) return null;
  const live = !node.id.startsWith("pending-");
  return (
    <Reactions
      reactions={node.reactions}
      me={me}
      onToggle={live ? (emoji, on) => react.mutate({ chatId, id: node.id, emoji, on }) : undefined}
    />
  );
}

/** Stands in for the author's avatar on a deleted thread root. */
export function DeletedAvatar() {
  return (
    <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted text-muted-foreground">
      <Trash2Icon className="size-3.5" />
    </span>
  );
}
