"use client";

import { CatchUpButton } from "@/components/chat/catch-up-button";
import { useQueries } from "@tanstack/react-query";
import { ChevronRightIcon, HashIcon } from "lucide-react";
import Link from "next/link";

import { AgentBadge } from "@/components/common/agent-badge";
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
        <h1 className="text-xl font-semibold md:text-[15px]">{dir.workspace.name}</h1>
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
      <h2 className="px-4 pb-1 text-xs font-medium text-muted-foreground">{title}</h2>
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
        className="flex min-h-[60px] items-center gap-3 border-b border-line-soft px-4 py-2 text-foreground no-underline hover:bg-muted hover:text-foreground active:bg-muted"
      >
        {meta.kind === "channel" ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <HashIcon className="size-[18px]" />
          </span>
        ) : (
          <Avatar person={personOf(dir, meta.who)} className="size-10 rounded-md text-sm" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-[15px]", n > 0 ? "font-semibold" : "font-medium")}>{title}</span>
            <span className={cn("shrink-0 text-xs", n > 0 ? "font-semibold text-brand" : "text-muted-foreground")}>{last?.time}</span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-sm", n > 0 ? "text-foreground" : "text-muted-foreground")}>{preview(dir, last)}</span>
            {n > 0 && (
              <span className="tabular flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-sm bg-unread px-1 text-2xs font-semibold text-white">{n}</span>
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
        className="flex items-center gap-3 rounded-md border bg-card p-3 text-foreground no-underline hover:border-input hover:bg-muted hover:text-foreground active:bg-muted"
      >
        <Avatar person={personOf(dir, ATLAS_ID)} className="size-10 rounded-md text-sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            Ask Atlas
            <AgentBadge />
            {n > 0 && <span className="tabular flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-unread px-1 text-2xs font-semibold text-white">{n}</span>}
          </span>
          <span className="truncate text-sm text-muted-foreground">{last ? preview(dir, last) : "Create, update and look up tickets"}</span>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </Link>
      <CatchUpButton className="mt-2 w-full justify-center" />
    </div>
  );
}
