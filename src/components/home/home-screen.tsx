"use client";

import { useQueries } from "@tanstack/react-query";
import { ChevronRightIcon, HashIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/common/avatar";
import { ScreenHeader } from "@/components/shell/screen-header";
import { queryKeys } from "@/hooks/query-keys";
import { useDirectory } from "@/hooks/use-directory";
import { useHydrated } from "@/hooks/use-hydrated";
import * as api from "@/lib/api";
import { ATLAS_ID, atlasDmOf, personOf, type Directory } from "@/lib/directory";
import type { ChatId, Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/** Phone home: every conversation with its latest message, like a native inbox. */
export function HomeScreen() {
  const dir = useDirectory();
  const atlasDm = atlasDmOf(dir);
  const dms = dir.dms.filter((d) => d !== atlasDm);
  const all: ChatId[] = [...dir.channels, ...dms, ...(atlasDm ? [atlasDm] : [])];
  const results = useQueries({
    queries: all.map((id) => ({ queryKey: queryKeys.messages(id), queryFn: () => api.getMessages(id) })),
  });
  const hydrated = useHydrated(); // match the server HTML during hydration; see use-hydrated.ts
  const last = (id: ChatId) => {
    if (!hydrated) return undefined;
    const list = results[all.indexOf(id)]?.data;
    return list?.[list.length - 1];
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ScreenHeader
        actions={
          <Link href="/me" className="-mr-1.5 flex size-11 items-center justify-center md:hidden">
            <Avatar person={personOf(dir, dir.me)} size="lg" />
            <span className="sr-only">Your profile</span>
          </Link>
        }
      >
        <h1 className="text-2xl font-bold tracking-[-0.01em] md:text-base">{dir.workspace.name}</h1>
      </ScreenHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl">
          {atlasDm && <AtlasCard id={atlasDm} last={last(atlasDm)} />}
          <Section title="Channels">
            {dir.channels.map((id) => (
              <ChatRow key={id} id={id} last={last(id)} />
            ))}
          </Section>
          <Section title="Direct messages">
            {dms.map((id) => (
              <ChatRow key={id} id={id} last={last(id)} />
            ))}
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-4">
      <h2 className="px-4 pb-1 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{title}</h2>
      <ul>{children}</ul>
    </section>
  );
}

function preview(dir: Directory, m: Message | undefined) {
  if (!m) return "";
  const who = m.who === dir.me ? "You" : personOf(dir, m.who).first;
  return `${who}: ${m.text.replace(/\s+/g, " ")}`;
}

function enter(id: ChatId) {
  useUiStore.getState().markRead(id);
  useUiStore.setState({ threadId: null });
}

function ChatRow({ id, last }: { id: ChatId; last: Message | undefined }) {
  const n = useUiStore((s) => s.unread[id] ?? 0);
  const dir = useDirectory();
  const meta = dir.chats[id];
  if (!meta) return null;
  const title = meta.kind === "channel" ? meta.label : personOf(dir, meta.who).name;
  return (
    <li>
      <Link
        href={`/chat/${id}`}
        onClick={() => enter(id)}
        className="flex min-h-[68px] items-center gap-3 px-4 py-2.5 text-foreground no-underline hover:bg-muted hover:text-foreground active:bg-muted"
      >
        {meta.kind === "channel" ? (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-ink-2">
            <HashIcon className="size-5" />
          </span>
        ) : (
          <Avatar person={personOf(dir, meta.who)} className="size-11 rounded-xl text-sm" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-base", n > 0 ? "font-bold" : "font-semibold")}>{title}</span>
            <span className={cn("shrink-0 text-xs", n > 0 ? "font-semibold text-brand" : "text-muted-foreground")}>{last?.time}</span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-sm", n > 0 ? "text-foreground" : "text-muted-foreground")}>{preview(dir, last)}</span>
            {n > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-unread px-1.5 text-xs font-bold text-white">{n}</span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

function AtlasCard({ id, last }: { id: ChatId; last: Message | undefined }) {
  const n = useUiStore((s) => s.unread[id] ?? 0);
  const dir = useDirectory();
  return (
    <div className="px-4 pt-4">
      <Link
        href={`/chat/${id}`}
        onClick={() => enter(id)}
        className="flex items-center gap-3 rounded-2xl bg-sidebar p-4 text-white no-underline hover:text-white active:opacity-90"
      >
        <Avatar person={personOf(dir, ATLAS_ID)} className="size-11 rounded-xl text-sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-base font-bold">
            Ask Atlas
            <SparklesIcon className="size-4 text-sidebar-agent" />
            {n > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-unread px-1.5 text-xs font-bold">{n}</span>}
          </span>
          <span className="truncate text-sm text-sidebar-foreground">{last ? preview(dir, last) : "Create, update and look up tickets"}</span>
        </span>
        <ChevronRightIcon className="size-5 shrink-0 text-sidebar-muted" />
      </Link>
    </div>
  );
}
