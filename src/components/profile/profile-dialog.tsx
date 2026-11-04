"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { HashIcon, LoaderCircleIcon, MessageSquareIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { StatusPill } from "@/components/common/status-pill";
import { DigestNow } from "@/components/scheduled/digest-now";
import { useDirectory } from "@/hooks/use-directory";
import { useVisibleTickets } from "@/hooks/use-tickets";
import * as remote from "@/lib/api/remote";
import { agentById, agentDmOf, ATLAS_ID, personOf, teamName } from "@/lib/directory";
import { useUiStore } from "@/stores/ui-store";

const SKILLS: Record<string, string> = {
  read: "Reads tickets and conversations",
  write: "Files and updates tickets",
  delete: "Can delete tickets (with confirmation)",
};
const MODE: Record<string, string> = { mention: "When mentioned", lurk: "Watches for bugs and questions", active: "Joins in" };

/**
 * Profile card for a person or an agent: opens instantly from any avatar or name
 * (data-profile, see useProfileClicks), everything comes from data already on the page.
 */
export function ProfileDialog() {
  const id = useUiStore((s) => s.profileId);
  const close = () => useUiStore.getState().openProfile(null);
  return (
    <DialogPrimitive.Root open={!!id} onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]">
          {id && <Profile id={id} onClose={close} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Profile({ id, onClose }: { id: string; onClose: () => void }) {
  const dir = useDirectory();
  const router = useRouter();
  const { visible } = useVisibleTickets();
  const [opening, setOpening] = useState(false);
  const p = personOf(dir, id);
  const agent = agentById(dir, id);
  const isAgent = !!agent || id === ATLAS_ID;
  const isMe = id === dir.me;
  const open = visible.filter((t) => t.assignee === id && t.status !== "Done" && t.status !== "Backburner");
  const channels = dir.channels.filter((c) => {
    const m = dir.chats[c];
    return m?.kind === "channel" && (isAgent ? m.agents?.some((a) => a.id === id) : true);
  });

  const message = async () => {
    const existing = isAgent ? agentDmOf(dir, id) : Object.values(dir.chats).find((c) => c.kind === "dm" && c.who === id)?.id;
    setOpening(true);
    try {
      const chat = existing ?? (await remote.openDm(id)).id;
      onClose();
      router.push(`/chat/${chat}`);
    } finally {
      setOpening(false);
    }
  };
  // Prefetch the DM route so "Message" feels instant.
  useEffect(() => {
    const dm = isAgent ? agentDmOf(dir, id) : null;
    if (dm) router.prefetch(`/chat/${dm}`);
  }, [dir, id, isAgent, router]);

  return (
    <div>
      <div className="relative h-20 bg-[linear-gradient(180deg,var(--muted),var(--card))]">
        <DialogPrimitive.Close aria-label="Close" className="absolute top-2.5 right-2.5 flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95">
          <XIcon className="size-4" />
        </DialogPrimitive.Close>
      </div>
      <div className="-mt-10 px-5 pb-5">
        <Avatar person={p} size="2xl" className="size-20 border-4 border-card text-[22px] shadow-sm" />
        <div className="mt-3 flex items-center gap-2">
          <DialogPrimitive.Title className="text-[18px] font-semibold tracking-tight">{p.name}</DialogPrimitive.Title>
          {isAgent && <span className="rounded-sm border px-1.5 text-[11px] font-medium text-muted-foreground">Agent</span>}
          {isMe && <span className="rounded-sm border px-1.5 text-[11px] font-medium text-muted-foreground">You</span>}
        </div>
        <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted-foreground">
          {isAgent
            ? agent?.handle
              ? `@${agent.handle} · ${agent.description || "Agent"}`
              : p.title || "Agent"
            : [p.title, teamName(dir, p.team)].filter(Boolean).join(" · ")}
        </DialogPrimitive.Description>

        {!isMe && (
          <button
            type="button"
            onClick={() => void message()}
            disabled={opening}
            className="mt-4 flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-brand text-[13px] font-semibold text-white transition-[transform,opacity] hover:opacity-95 active:scale-[0.98] disabled:opacity-70"
          >
            {opening ? <LoaderCircleIcon className="size-4 animate-spin" /> : <MessageSquareIcon className="size-4" />}
            Message {p.first}
          </button>
        )}

        <DigestNow agentId={id} onPosted={(chat) => { onClose(); router.push(`/chat/${chat}`); }} />

        {isAgent && (
          <Section title="What it can do">
            <ul className="space-y-1 text-[13px] text-ink-2">
              {(agent?.tools ?? ["read", "write", "delete"]).map((t) => (
                <li key={t} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {SKILLS[t] ?? t}
                </li>
              ))}
              <li className="flex gap-2">
                <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" />
                Acts with the permissions of whoever asks
              </li>
            </ul>
          </Section>
        )}

        {isAgent && channels.length > 0 && (
          <Section title="Channels">
            <div className="flex flex-wrap gap-1.5">
              {channels.slice(0, 8).map((c) => {
                const m = dir.chats[c];
                const mode = m?.kind === "channel" ? m.agents?.find((a) => a.id === id)?.mode : undefined;
                return (
                  <button
                    key={c}
                    type="button"
                    title={mode ? MODE[mode] : undefined}
                    onClick={() => {
                      onClose();
                      router.push(`/chat/${c}`);
                    }}
                    className="flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[12px] font-medium text-ink-2 transition-colors hover:border-subtle hover:text-foreground active:scale-[0.97]"
                  >
                    <HashIcon className="size-3 text-muted-foreground" />
                    {m?.kind === "channel" ? m.label : c}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <Section title={open.length ? `Working on · ${open.length}` : "Working on"}>
          {!open.length && <p className="text-[13px] text-muted-foreground">No open tickets.</p>}
          <ul className="-mx-2">
            {open.slice(0, 5).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    useUiStore.getState().openTicket(t.id);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                >
                  <span className="w-[54px] shrink-0 font-mono text-[11px] text-muted-foreground">{t.id}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                  <StatusPill status={t.status} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-[12px] font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

/** Any element with data-profile="<person id>" opens that profile (one listener for the app). */
export function useProfileClicks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-profile]");
      if (!el?.dataset.profile) return;
      e.preventDefault();
      e.stopPropagation();
      useUiStore.getState().openProfile(el.dataset.profile);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}
