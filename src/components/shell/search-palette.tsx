"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HashIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";

import { Avatar } from "@/components/common/avatar";
import * as api from "@/lib/api";
import { openDm } from "@/lib/api/remote";
import { useDirectory } from "@/hooks/use-directory";
import { queryKeys } from "@/hooks/query-keys";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { STATUS_COLORS } from "@/lib/constants";
import { agentDmOf, personOf } from "@/lib/directory";
import { plainSnippet } from "@/lib/markdown";
import { searchTerms } from "@/lib/message-ops";
import type { ChatId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

interface Item {
  key: string;
  section: "Channels and people" | "Tickets" | "Messages";
  icon: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  run: () => void;
}

/** Waits `ms` after the last change (server search shouldn't fire on every keystroke). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Bold the searched words inside a snippet (plain text, no HTML). */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-[2px] bg-mention px-px font-semibold text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Cmd/Ctrl+K: jump to a channel or person, a ticket, or any message you can see.
 * Channels, people and tickets match in the browser; messages come from the server.
 */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const dir = useDirectory();
  const router = useRouter();
  const qc = useQueryClient();
  const { visible } = useVisibleTickets();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const query = q.trim();
  const debounced = useDebounced(query, 200);
  const terms = useMemo(() => searchTerms(query), [query]);

  const messages = useQuery({
    queryKey: ["search", dir.workspace.id, debounced],
    queryFn: () => api.searchMessages(debounced),
    enabled: open && searchTerms(debounced).length > 0,
    staleTime: 15_000,
  });

  const close = () => {
    onOpenChange(false);
    setQ("");
    setSel(0);
  };

  const goChat = (chatId: ChatId) => {
    close();
    useUiStore.setState({ threadId: null });
    router.push(`/chat/${chatId}`);
  };

  const items: Item[] = useMemo(() => {
    const lq = query.toLowerCase();
    const out: Item[] = [];
    const channels = dir.channels
      .map((id) => dir.chats[id])
      .filter((c): c is Extract<typeof c, { kind: "channel" }> => c?.kind === "channel" && (!lq || c.label.toLowerCase().includes(lq)));
    for (const c of channels.slice(0, lq ? 5 : 6)) {
      out.push({
        key: `c:${c.id}`, section: "Channels and people", icon: <HashIcon className="size-4 text-muted-foreground" />,
        title: c.label, sub: c.topic || undefined, run: () => goChat(c.id),
      });
    }
    if (lq) {
      const people = dir.personOrder
        .filter((id) => id !== dir.me)
        .map((id) => personOf(dir, id))
        .filter((p) => p.name.toLowerCase().includes(lq) || p.first.toLowerCase().startsWith(lq))
        .slice(0, 5);
      for (const p of people) {
        out.push({
          key: `p:${p.id}`, section: "Channels and people", icon: <Avatar person={p} size="sm" />,
          title: p.name, sub: p.isAgent ? "Agent" : p.title || undefined,
          run: () => {
            const dm = agentDmOf(dir, p.id);
            if (dm) return goChat(dm);
            void openDm(p.id).then(async (r) => {
              await qc.invalidateQueries({ queryKey: queryKeys.directory });
              goChat(r.id);
            });
          },
        });
      }
      const up = lq.toUpperCase();
      const tickets = visible.filter((t) => t.id.includes(up) || t.title.toLowerCase().includes(lq)).slice(0, 5);
      for (const t of tickets) {
        out.push({
          key: `t:${t.id}`, section: "Tickets",
          icon: <span aria-hidden className="size-2 rounded-full" style={{ background: STATUS_COLORS[t.status][3] }} />,
          title: (
            <>
              <span className="mr-1.5 text-muted-foreground">{t.id}</span>
              {t.title || "Untitled ticket"}
            </>
          ),
          sub: t.status,
          run: () => {
            close();
            useUiStore.getState().openTicket(t.id);
          },
        });
      }
    }
    // Only show server results for what's typed now (not a stale, slower query).
    if (lq && debounced === query) {
      for (const h of messages.data ?? []) {
        const meta = dir.chats[h.chatId];
        if (!meta) continue;
        const where = meta.kind === "channel" ? `#${meta.label}` : `your DM with ${personOf(dir, meta.who).name}`;
        const p = personOf(dir, h.who);
        out.push({
          key: `m:${h.id}`, section: "Messages", icon: <Avatar person={p} size="sm" />,
          title: <Highlight text={plainSnippet(h.text, 140)} terms={terms} />,
          sub: `${p.name} in ${where}${h.threadId ? " · thread" : ""} · ${h.time}`,
          run: () => {
            close();
            useUiStore.setState({ focus: { chatId: h.chatId, threadId: h.threadId, id: h.id }, ticketId: null });
            router.push(`/chat/${h.chatId}`);
          },
        });
      }
    }
    return out;
    // goChat/close only close over stable setters and the router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, debounced, dir, visible, messages.data, terms]);

  const active = Math.min(sel, Math.max(items.length - 1, 0));
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const searching = !!query && searchTerms(query).length > 0 && (debounced !== query || messages.isFetching);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      setSel((active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  let lastSection = "";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          // Phones: a full-screen sheet (the keyboard takes the bottom half; results scroll above it).
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[min(560px,76dvh)] w-[calc(100vw-32px)] max-w-[620px] -translate-x-1/2 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl outline-none max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:rounded-none max-sm:border-0 max-sm:pt-safe max-sm:pb-safe max-sm:shadow-none"
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Find channels, people, tickets and messages</DialogPrimitive.Description>
          <div className="flex items-center gap-2.5 border-b px-4">
            <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSel(0);
              }}
              placeholder="Search channels, people, tickets and messages"
              aria-label="Search"
              role="combobox"
              aria-expanded
              aria-controls="search-results"
              aria-activedescendant={items[active] ? `search-item-${active}` : undefined}
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-[14px]"
            />
            {searching && <span className="text-[12px] text-muted-foreground">Searching…</span>}
            <DialogPrimitive.Close className="-mr-2 h-11 shrink-0 cursor-pointer px-2 text-[15px] font-medium text-brand sm:hidden">Cancel</DialogPrimitive.Close>
          </div>
          <div ref={listRef} id="search-results" role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {items.map((it, i) => {
              const header = it.section !== lastSection ? it.section : null;
              lastSection = it.section;
              return (
                <div key={it.key}>
                  {header && <div className="px-2 pt-2.5 pb-1 text-[12px] font-medium text-muted-foreground">{header}</div>}
                  <button
                    type="button"
                    id={`search-item-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => i !== active && setSel(i)}
                    onClick={it.run}
                    className={cn("flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-left", i === active && "bg-accent")}
                  >
                    <span className="flex w-[22px] shrink-0 justify-center">{it.icon}</span>
                    <span className="flex min-w-0 flex-1 flex-col leading-[1.35]">
                      <span className="truncate text-[13.5px] text-foreground">{it.title}</span>
                      {it.sub && <span className="truncate text-[12px] text-muted-foreground">{it.sub}</span>}
                    </span>
                  </button>
                </div>
              );
            })}
            {!!query && !items.length && !searching && <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>}
            {!!query && !searching && searchTerms(query).length > 0 && !messages.data?.length && !!items.length && (
              <p className="px-2 pt-2.5 pb-1.5 text-[12px] text-muted-foreground">No messages match</p>
            )}
          </div>
          <div className="flex items-center gap-3 border-t px-4 py-2 text-[12px] text-muted-foreground max-sm:hidden">
            <span>↑↓ to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Opens the palette on Cmd+K / Ctrl+K, anywhere in the app. */
export function useSearchShortcut(setOpen: (fn: (v: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

const useSearchStore = create<{ open: boolean }>(() => ({ open: false }));

/** Open the search palette (sidebar button, phone header button). */
export const openSearch = () => useSearchStore.setState({ open: true });

/**
 * The app's one search palette, mounted in the shell so phones (no sidebar) reach it too.
 * Opened by Cmd/Ctrl+K, the sidebar's search button, or SearchButton in phone headers.
 */
export function GlobalSearch() {
  const open = useSearchStore((s) => s.open);
  const setOpen = useCallback((v: boolean | ((v: boolean) => boolean)) => {
    useSearchStore.setState((s) => ({ open: typeof v === "function" ? v(s.open) : v }));
  }, []);
  useSearchShortcut(setOpen);
  return <SearchPalette open={open} onOpenChange={setOpen} />;
}

/** Phone-only search entry for screen headers (desktop has the sidebar button and Cmd/Ctrl+K). */
export function SearchButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Search"
      onClick={openSearch}
      className={cn("flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-muted hover:text-foreground md:hidden", className)}
    >
      <SearchIcon className="size-[22px]" strokeWidth={1.9} />
    </button>
  );
}
