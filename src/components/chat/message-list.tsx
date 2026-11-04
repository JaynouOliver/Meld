"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, LoaderCircleIcon, MessageCircleIcon } from "lucide-react";

import { AgentBadge } from "@/components/common/agent-badge";
import { Avatar } from "@/components/common/avatar";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { loadNewer, loadOlder, mayHaveOlder, useHistoryMeta } from "@/hooks/use-chat-history";
import { useFlash } from "@/hooks/use-flash";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { useDirectory } from "@/hooks/use-directory";
import { rootOf } from "@/lib/chat-history";
import { personOf } from "@/lib/directory";
import { countReplies } from "@/lib/text";
import type { ChatId, Message, Person } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { AtlasLive } from "./atlas-live";
import { MessageBody, MessageToolbar, PinnedLabel } from "./message-actions";
import { DeletedAvatar, MessageReactions } from "./reactions";
import { ActionCard } from "./action-card";
import { TicketCard } from "./ticket-card";

export function MessageList({ chatId, messages }: { chatId: ChatId; messages: Message[] | undefined }) {
  const typing = useUiStore((s) => s.typing);
  const typingLabel = typing && typing.chat === chatId && !typing.thread ? typing.label : null;
  const { scrollRef, contentRef, pin, release } = useStickToBottom(chatId);
  // Sending always jumps to your own new message, even if you'd scrolled up.
  const sentTick = useUiStore((s) => s.sentTick);
  useEffect(() => {
    if (sentTick) pin();
  }, [sentTick, pin]);

  const qc = useQueryClient();
  const history = useHistoryMeta(chatId);
  const older = mayHaveOlder(messages, history);
  const gapAfter = history.gapAfter && messages?.some((m) => m.id === history.gapAfter) ? history.gapAfter : null;
  const [busy, setBusy] = useState<"older" | "newer" | null>(null);

  // A jump: stop following new messages, and for a reply bring its conversation into view
  // too (the reply itself flashes in the thread panel).
  const flashId = useUiStore((s) => s.flashId);
  useEffect(() => {
    if (!flashId || !messages) return;
    const root = rootOf(messages, flashId);
    if (!root) return;
    release();
    if (root.id !== flashId) {
      const raf = requestAnimationFrame(() => scrollRef.current?.querySelector(`[data-message-id="${CSS.escape(root.id)}"]`)?.scrollIntoView({ block: "center" }));
      return () => cancelAnimationFrame(raf);
    }
    // Only the flash target matters here, not later list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashId]);

  // "Load older" adds rows above what's on screen: keep the first visible conversation where it was.
  const keep = useRef<{ id: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const k = keep.current;
    const el = scrollRef.current;
    if (!k || !el) return;
    const row = el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(k.id)}"]`);
    if (row && messages?.[0]?.id !== k.id) {
      el.scrollTop += row.getBoundingClientRect().top - k.top;
      keep.current = null;
    }
  }, [messages, scrollRef]);

  const loadEarlier = useCallback(async () => {
    const first = messages?.[0];
    const el = scrollRef.current;
    if (!first || !el || busy) return;
    const row = el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(first.id)}"]`);
    keep.current = row ? { id: first.id, top: row.getBoundingClientRect().top } : null;
    release();
    setBusy("older");
    try {
      await loadOlder(qc, chatId, first.id);
    } finally {
      setBusy(null);
    }
  }, [messages, busy, qc, chatId, release, scrollRef]);

  const loadLater = async () => {
    if (!gapAfter || busy) return;
    setBusy("newer");
    try {
      await loadNewer(qc, chatId, gapAfter);
    } finally {
      setBusy(null);
    }
  };

  // Scrolling to the top loads the page before it (the button stays for keyboards and slow links).
  const topRef = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    const top = topRef.current;
    if (!el || !top || !older) return;
    const onScroll = () => (userScrolled.current = true);
    el.addEventListener("scroll", onScroll, { passive: true, once: true });
    const io = new IntersectionObserver(([e]) => e.isIntersecting && userScrolled.current && void loadEarlier(), { root: el, rootMargin: "200px 0px 0px 0px" });
    io.observe(top);
    return () => {
      el.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [older, loadEarlier, scrollRef]);

  // "Jump to latest" while reading older history (more than a screen up, or above a gap).
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setAway(el.scrollHeight - el.scrollTop - el.clientHeight > Math.max(el.clientHeight * 1.5, 600));
    check();
    el.addEventListener("scroll", check, { passive: true });
    return () => el.removeEventListener("scroll", check);
  }, [scrollRef, chatId]);

  // A jump to a message that no longer exists: say so instead of doing nothing.
  const [missed, setMissed] = useState(false);
  const seenMissed = useRef(history.missed);
  useEffect(() => {
    if (history.missed === seenMissed.current) return;
    seenMissed.current = history.missed;
    setMissed(true);
    const t = setTimeout(() => setMissed(false), 3500);
    return () => clearTimeout(t);
  }, [history.missed]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    <div ref={scrollRef} className="flex-1 overflow-y-auto pt-2 pb-3 [overflow-anchor:none]">
      <div ref={contentRef}>
      {older && (
        <div ref={topRef} className="flex justify-center px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={() => void loadEarlier()}
            disabled={busy === "older"}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-ink-2 hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-70"
          >
            {busy === "older" ? <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" /> : <ArrowUpIcon aria-hidden className="size-3.5" />}
            {busy === "older" ? "Loading older messages…" : "Load older messages"}
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2 sm:px-5">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground">{history.extended ? "Earlier" : "Today"}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {!messages && <MessageSkeleton />}
      {messages?.map((m) => (
        <Fragment key={m.id}>
          <MessageRow chatId={chatId} message={m} />
          {m.id === gapAfter && (
            <div className="flex items-center gap-3 px-3 py-3 sm:px-5">
              <span className="h-px flex-1 bg-border" />
              <button
                type="button"
                onClick={() => void loadLater()}
                disabled={busy === "newer"}
                className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-ink-2 hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-70"
              >
                {busy === "newer" ? <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" /> : <ArrowDownIcon aria-hidden className="size-3.5" />}
                {busy === "newer" ? "Loading…" : "Load newer messages"}
              </button>
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
        </Fragment>
      ))}
      <AtlasLive chatId={chatId} threadId={null} className="px-3 sm:px-5" />
      {typingLabel && <div className="pt-1.5 pr-3 pl-[60px] text-meta sm:pr-5 sm:pl-[68px] text-muted-foreground italic">{typingLabel}</div>}
      </div>
    </div>
      {missed && (
        <p role="status" className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md border bg-popover px-3 py-1.5 text-[13px] text-foreground shadow-md">
          That message isn&apos;t available any more
        </p>
      )}
      {away && (
        <button
          type="button"
          onClick={() => pin()}
          className="absolute right-4 bottom-3 z-10 flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-popover px-3 text-[13px] font-medium text-foreground shadow-md hover:bg-muted"
        >
          <ArrowDownIcon aria-hidden className="size-3.5" />
          Jump to latest
        </button>
      )}
    </div>
  );
}

function MessageRow({ chatId, message: m }: { chatId: ChatId; message: Message }) {
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
  const [editing, setEditing] = useState(false);
  const deleted = !!m.deletedAt;

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
      data-message-id={m.id}
      onClick={onTap}
      className={cn(
        "group relative flex gap-3 px-3 py-1.5 transition-colors duration-700 sm:px-5",
        threadId === m.id ? "bg-selected" : "hover:bg-muted pointer-coarse:hover:bg-transparent pointer-coarse:active:bg-muted",
        flashing && "bg-mention",
        pending && "opacity-60",
      )}
    >
      {deleted ? (
        <DeletedAvatar />
      ) : (
        <button type="button" data-profile={p.id} aria-label={`${p.name}'s profile`} className="h-fit shrink-0 cursor-pointer rounded-[6px]">
          <Avatar person={p} size="xl" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <PinnedLabel node={m} />
        {!deleted && (
          <div className="flex items-baseline gap-2">
            <button type="button" data-profile={p.id} className="cursor-pointer text-body font-semibold hover:underline">{p.name}</button>
            {p.isAgent && <AgentBadge />}
            <span className="text-xs text-muted-foreground">{m.time}</span>
          </div>
        )}
        <MessageBody chatId={chatId} node={m} editing={editing} onDone={() => setEditing(false)} />
        {!deleted && m.ticket && <TicketCard id={m.ticket} />}
        {!deleted && m.action && <ActionCard action={m.action} />}
        <MessageReactions chatId={chatId} node={m} />
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
      {!pending && !editing && (
        <MessageToolbar chatId={chatId} node={m} onEdit={() => setEditing(true)}>
          <button
            type="button"
            onClick={() => openThread(m.id)}
            aria-label="Reply in thread"
            title="Reply in thread"
            className="flex size-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MessageCircleIcon className="size-4" />
          </button>
        </MessageToolbar>
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
