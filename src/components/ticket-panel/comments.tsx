"use client";

import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { AgentBadge } from "@/components/common/agent-badge";
import { Avatar } from "@/components/common/avatar";
import { RichText } from "@/components/common/rich-text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useUpdateTicket } from "@/hooks/use-tickets";
import { clock } from "@/lib/format";
import { personOf } from "@/lib/directory";
import { MAX_COMMENT_LENGTH } from "@/lib/ticket-fields";
import type { Ticket } from "@/lib/types";

const sectionLabel = "text-xs font-medium text-muted-foreground";

/** "10:31 AM" today, "Nov 3, 10:31 AM" before; display labels pass through. */
function when(t: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(t)) return t;
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  return today ? clock(d) : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${clock(d)}`;
}

/** Ticket discussion. Mentions and ticket ids render as chips; you can delete your own comments. */
export function Comments({ ticket: t }: { ticket: Ticket }) {
  const dir = useDirectory();
  const role = useRole();
  const update = useUpdateTicket();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const comments = t.comments ?? [];

  const submit = () => {
    const text = draft.trim();
    if (!text || update.isPending) return;
    setError(null);
    update.mutate({ id: t.id, addComment: text }, { onSuccess: () => setDraft(""), onError: (e) => setError(e.message) });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className={sectionLabel}>Comments · {comments.length}</span>
      {comments.map((c) => {
        const p = personOf(dir, c.who);
        const mine = c.who === dir.me;
        return (
          <div key={c.id} className="group flex gap-2.5">
            <Avatar person={p} size="sm" className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-foreground">{mine ? `${p.name} (you)` : p.name}</span>
                {p.isAgent && <AgentBadge />}
                <span className="text-[12px] text-muted-foreground">{when(c.time)}</span>
                {(mine || role === "owner") && (
                  <button
                    type="button"
                    aria-label={`Delete comment by ${p.name}`}
                    onClick={() => update.mutate({ id: t.id, removeCommentId: c.id }, { onError: (e) => setError(e.message) })}
                    className="ml-auto flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive md:size-6 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
              </div>
              <RichText text={c.text} className="text-sm leading-[1.5] break-words whitespace-pre-wrap text-foreground" />
            </div>
          </div>
        );
      })}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`tk-comment-${t.id}`} className="sr-only">
          Add a comment
        </label>
        <Textarea
          id={`tk-comment-${t.id}`}
          rows={2}
          value={draft}
          maxLength={MAX_COMMENT_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Add a comment. @name mentions, ${dir.workspace.ticketPrefix}-12 links a ticket.`}
        />
        <div className="flex items-center gap-2">
          {error && (
            <span role="alert" className="text-[12px] text-destructive">
              {error}
            </span>
          )}
          <Button size="sm" className="ml-auto" onClick={submit} disabled={!draft.trim() || update.isPending}>
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
