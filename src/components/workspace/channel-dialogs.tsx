"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { queryKeys } from "@/hooks/query-keys";
import { useDirectory } from "@/hooks/use-directory";
import * as remote from "@/lib/api/remote";
import { ATLAS_ID, atlasDmOf, personOf } from "@/lib/directory";
import { canManage } from "@/lib/rbac";
import type { ChatId } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";

type Open = { open: boolean; onOpenChange: (o: boolean) => void };

/** Run a change, refetch the directory (so the new chat is known), then continue. */
function useDirectoryChange() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>, then: (r: T) => void) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      await qc.refetchQueries({ queryKey: queryKeys.directory });
      then(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** Slack-style channel names, as you type (mirrors the server). */
const asChannelName = (s: string) => s.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_-]+/g, "-").slice(0, 40);

export function CreateChannelDialog({ open, onOpenChange }: Open) {
  const dir = useDirectory();
  const router = useRouter();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [team, setTeam] = useState("");
  const { busy, error, run } = useDirectoryChange();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      () => remote.createChannel({ name, topic, team: team || null }),
      (r) => {
        onOpenChange(false);
        setName("");
        setTopic("");
        router.push(`/chat/${r.id}`);
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Create a channel" description="Channels are where your team talks about a topic. Everyone in the workspace can join.">
        <form onSubmit={submit}>
          <label htmlFor="ch-name" className="text-meta font-semibold">Name</label>
          <div className="mt-1.5 flex h-9 items-center rounded-md border border-input bg-background px-2.5 focus-within:border-ring">
            <span className="text-muted-foreground">#</span>
            <input id="ch-name" autoFocus value={name} onChange={(e) => setName(asChannelName(e.target.value))} placeholder="e.g. launch-plan" className="min-w-0 flex-1 bg-transparent pl-1 text-sm outline-none" />
          </div>
          <label htmlFor="ch-topic" className="mt-4 block text-meta font-semibold">Topic <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="ch-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this channel about?" maxLength={120} className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring" />
          {dir.teams.length > 0 && (
            <>
              <label htmlFor="ch-team" className="mt-4 block text-meta font-semibold">Team <span className="font-normal text-muted-foreground">(Atlas files tickets here to this team)</span></label>
              <select id="ch-team" value={team} onChange={(e) => setTeam(e.target.value)} className="mt-1.5 h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">No team</option>
                {dir.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </>
          )}
          {error && <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-meta text-destructive">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="h-9 cursor-pointer rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={busy || !name.replace(/-/g, "")} className="flex h-9 cursor-pointer items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy && <LoaderCircleIcon className="size-4 animate-spin" />} Create
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Start (or reopen) a DM with a teammate or Atlas. */
export function NewMessageDialog({ open, onOpenChange }: Open) {
  const dir = useDirectory();
  const router = useRouter();
  const [q, setQ] = useState("");
  const { busy, error, run } = useDirectoryChange();
  const people = dir.personOrder.filter((id) => id !== dir.me).filter((id) => personOf(dir, id).name.toLowerCase().includes(q.toLowerCase()));

  const pick = (id: string) => {
    const go = (chat: ChatId) => {
      onOpenChange(false);
      setQ("");
      router.push(`/chat/${chat}`);
    };
    const atlas = atlasDmOf(dir);
    if (id === ATLAS_ID && atlas) return go(atlas);
    void run(() => remote.openDm(id), (r) => go(r.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New message" description="Send a direct message to someone in the workspace.">
        <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 focus-within:border-ring">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input autoFocus aria-label="Find a person" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <ul className="mt-3 max-h-80 overflow-y-auto">
          {people.map((id) => {
            const p = personOf(dir, id);
            return (
              <li key={id}>
                <button type="button" disabled={busy} onClick={() => pick(id)} className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted">
                  <Avatar person={p} size="md" />
                  <span className="flex-1 text-sm font-semibold">{p.name}</span>
                  {p.isAgent && <span className="rounded-sm border border-agent-border bg-agent px-1 text-2xs leading-4 font-medium text-agent-foreground">Agent</span>}
                </button>
              </li>
            );
          })}
          {!people.length && <li className="px-2 py-3 text-meta text-muted-foreground">No one matches. Invite them from the workspace menu.</li>}
        </ul>
        {error && <p role="alert" className="mt-2 text-meta text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

/** Rename a channel, change its topic, or delete it (owners and the creator). */
export function ChannelSettingsDialog({ chatId, open, onOpenChange }: Open & { chatId: ChatId }) {
  const dir = useDirectory();
  const router = useRouter();
  const meta = dir.chats[chatId];
  const [name, setName] = useState(meta?.kind === "channel" ? meta.label : "");
  const [topic, setTopic] = useState(meta?.topic ?? "");
  const { busy, error, run } = useDirectoryChange();
  if (!meta || meta.kind !== "channel") return null;
  const isHome = chatId === dir.home;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run(() => remote.updateChannel({ id: chatId, name, topic }), () => onOpenChange(false));
  };
  const remove = () => {
    if (!window.confirm(`Delete #${meta.label} and all of its messages? This can't be undone.`)) return;
    void run(
      () => remote.deleteChannel(chatId),
      (r) => {
        onOpenChange(false);
        useUiStore.getState().closeThread();
        router.replace(`/chat/${r.home}`);
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`#${meta.label} settings`}>
        <form onSubmit={save}>
          <label htmlFor="cs-name" className="text-meta font-semibold">Name</label>
          <div className="mt-1.5 flex h-9 items-center rounded-md border border-input bg-background px-2.5 focus-within:border-ring">
            <span className="text-muted-foreground">#</span>
            <input id="cs-name" value={name} onChange={(e) => setName(asChannelName(e.target.value))} className="min-w-0 flex-1 bg-transparent pl-1 text-sm outline-none" />
          </div>
          <label htmlFor="cs-topic" className="mt-4 block text-meta font-semibold">Topic</label>
          <input id="cs-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring" />
          {error && <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-meta text-destructive">{error}</p>}
          <div className="mt-6 flex items-center justify-between gap-2">
            {isHome ? (
              <span className="text-meta text-muted-foreground">The default channel can&apos;t be deleted.</span>
            ) : (
              <button type="button" disabled={busy} onClick={remove} className="h-9 cursor-pointer rounded-md px-3 text-sm font-medium text-destructive hover:bg-danger-soft">
                Delete channel
              </button>
            )}
            <button type="submit" disabled={busy} className="flex h-9 cursor-pointer items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy && <LoaderCircleIcon className="size-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Can the signed-in person edit / delete this channel? */
export function useCanEditChannel(chatId: ChatId) {
  const dir = useDirectory();
  const c = dir.chats[chatId];
  return !!c && c.kind === "channel" && (canManage(dir.role) || c.createdBy === dir.me);
}
