"use client";

import { MessageCircleIcon } from "lucide-react";

import { AgentBadge } from "@/components/common/agent-badge";
import { Avatar } from "@/components/common/avatar";
import { RichText } from "@/components/common/rich-text";
import { useEffect } from "react";

import { useFlash } from "@/hooks/use-flash";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { useDirectory } from "@/hooks/use-directory";
import { personOf } from "@/lib/directory";
import { countReplies } from "@/lib/text";
import type { ChatId, Message, Person } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { AtlasLive } from "./atlas-live";
import { Reactions } from "./reactions";
import { ActionCard } from "./action-card";
import { TicketCard } from "./ticket-card";

export function MessageList({ chatId, messages }: { chatId: ChatId; messages: Message[] | undefined }) {
  const typing = useUiStore((s) => s.typing);
  const typingLabel = typing && typing.chat === chatId && !typing.thread ? typing.label : null;
  const { scrollRef, contentRef, pin } = useStickToBottom(chatId);
  // Sending always jumps to your own new message, even if you'd scrolled up.
  const sentTick = useUiStore((s) => s.sentTick);
  useEffect(() => {
    if (sentTick) pin();
  }, [sentTick, pin]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto pt-2 pb-3 [overflow-anchor:none]">
      <div ref={contentRef}>
      <div className="flex items-center gap-3 px-3 pt-3 pb-2 sm:px-5">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground">Today</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {!messages && <MessageSkeleton />}
      {messages?.map((m) => <MessageRow key={m.id} message={m} />)}
      <AtlasLive chatId={chatId} threadId={null} className="px-3 sm:px-5" />
      {typingLabel && <div className="pt-1.5 pr-3 pl-[60px] text-meta sm:pr-5 sm:pl-[68px] text-muted-foreground italic">{typingLabel}</div>}
      </div>
    </div>
  );
}

function MessageRow({ message: m }: { message: Message }) {
  const threadId = useUiStore((s) => s.threadId);
  const openThread = useUiStore((s) => s.openThread);
  const dir = useDirectory();
  const p = personOf(dir, m.who);
  const n = countReplies(m.replies);
  const participants: Person[] = [];
  m.replies.forEach((r) => {
    if (!participants.some((x) => x.id === r.who)) participants.push(personOf(dir, r.who));
  });
  const pending = m.id.startsWith("pending-");
  const { ref, flashing } = useFlash<HTMLDivElement>(m.id);

  // Touch screens have no hover toolbar: tapping a message opens its thread,
  // unless the tap was on a link, chip or button inside it.
  const onTap = (e: React.MouseEvent) => {
    if (pending || !window.matchMedia("(pointer: coarse)").matches) return;
    if ((e.target as HTMLElement).closest("button, a, input, [data-chip]")) return;
    openThread(m.id);
  };

  return (
    <div
      ref={ref}
      onClick={onTap}
      className={cn(
        "group relative flex gap-3 px-3 py-1.5 transition-colors duration-700 sm:px-5",
        threadId === m.id ? "bg-selected" : "hover:bg-muted pointer-coarse:hover:bg-transparent pointer-coarse:active:bg-muted",
        flashing && "bg-mention",
        pending && "opacity-60",
      )}
    >
      <Avatar person={p} size="xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-body font-semibold">{p.name}</span>
          {p.isAgent && <AgentBadge />}
          <span className="text-xs text-muted-foreground">{m.time}</span>
        </div>
        <RichText text={m.text} className="text-body" />
        {m.ticket && <TicketCard id={m.ticket} />}
        {m.action && <ActionCard action={m.action} />}
        <Reactions reactions={m.reactions} />
        {n > 0 && (
          <button
            type="button"
            onClick={() => openThread(m.id)}
            className="mt-1 inline-flex min-h-10 max-w-full cursor-pointer items-center gap-2 rounded-md border border-transparent py-1 pr-2 pl-1 text-meta sm:min-h-8 transition-colors hover:border-border hover:bg-card"
          >
            <span aria-hidden className="flex gap-0.5">
              {participants.map((pp) => (
                <Avatar key={pp.id} person={pp} size="sm" />
              ))}
            </span>
            <span className="font-semibold text-link">{n === 1 ? "1 reply" : `${n} replies`}</span>
            <span className="truncate text-muted-foreground">Last reply {m.replies[m.replies.length - 1].time}</span>
          </button>
        )}
      </div>
      {!pending && (
        <div className="absolute -top-3.5 right-5 flex pointer-coarse:hidden rounded-md border bg-card p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => openThread(m.id)}
            aria-label="Reply in thread"
            className="flex size-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MessageCircleIcon className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 py-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse gap-3">
          <div className="size-8 rounded-md bg-accent" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3.5 w-40 rounded bg-accent" />
            <div className="h-3.5 w-3/4 rounded bg-accent" />
          </div>
        </div>
      ))}
    </div>
  );
}
