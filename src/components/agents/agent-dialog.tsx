"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { queryKeys } from "@/hooks/query-keys";
import { useDirectory } from "@/hooks/use-directory";
import * as remote from "@/lib/api/remote";
import { agentById, agentDmOf, agentModeIn, personOf, type AgentInfo, type AgentTool } from "@/lib/directory";
import { canManage } from "@/lib/rbac";
import type { AgentMode } from "@/lib/types";
import { MODE_OPTIONS } from "./agent-modes";

type Open = { open: boolean; onOpenChange: (o: boolean) => void };

const TEMPLATES: { name: string; handle: string; description: string; instructions: string; tools: AgentTool[] }[] = [
  {
    name: "Triage", handle: "triage", tools: ["read", "write"],
    description: "Turns bug reports into well-formed tickets with the right owner.",
    instructions: "When someone reports a bug, file one ticket with steps to reproduce, impact and the likely owner team. Ask one question if the report is too vague. Hand code review questions to @reviewer if that agent exists.",
  },
  {
    name: "Reviewer", handle: "reviewer", tools: ["read"],
    description: "Reviews plans and changes for edge cases and risks.",
    instructions: "Look for missing edge cases, rollout risks and unclear ownership. Be concrete and brief: a short list of risks, each with a suggested fix. Tag a person only for product decisions.",
  },
  {
    name: "Standup", handle: "standup", tools: ["read"],
    description: "Summarizes what changed and what's blocked.",
    instructions: "When asked, summarize recent progress, what's blocked (and by what), and what needs a decision, with ticket ids. Keep it to five bullets.",
  },
];

/** Create an agent, or edit one (name, role, instructions, permissions, channels). */
export function AgentDialog({ agentId, open, onOpenChange }: Open & { agentId?: string | null }) {
  const dir = useDirectory();
  const existing = agentId ? agentById(dir, agentId) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={existing ? existing.name : "Add an agent"}
        description={existing ? `@${existing.handle} · agent member of ${dir.workspace.name}` : "Agents are members: they have a profile, a DM inbox, and read only the channels you add them to."}
        className="max-w-xl"
      >
        {open && <AgentForm key={agentId ?? "new"} existing={existing} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AgentForm({ existing, onDone }: { existing: AgentInfo | null; onDone: () => void }) {
  const dir = useDirectory();
  const qc = useQueryClient();
  const router = useRouter();
  const builtin = existing?.kind === "builtin";
  const editable = !existing || (!builtin && (canManage(dir.role) || existing.createdBy === dir.me));
  const [name, setName] = useState(existing?.name ?? "");
  const [handle, setHandle] = useState(existing?.handle ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const [tools, setTools] = useState<AgentTool[]>(existing?.tools ?? ["read"]);
  const [modes, setModes] = useState<Record<string, AgentMode | "off">>(() =>
    Object.fromEntries(dir.channels.map((c) => [c, (existing ? agentModeIn(dir, c, existing.id) : null) ?? "off"])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canJoin = dir.role !== "guest";

  const apply = (t: (typeof TEMPLATES)[number]) => {
    setName(t.name);
    setHandle(t.handle);
    setDescription(t.description);
    setInstructions(t.instructions);
    setTools(t.tools);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let id = existing?.id;
      if (editable && !builtin) {
        const input = { name, handle: handle || undefined, description, instructions, tools };
        if (id) await remote.updateAgent({ id, ...input });
        else id = (await remote.createAgent(input)).id;
      }
      if (canJoin && id) {
        for (const c of dir.channels) {
          const before = existing ? (agentModeIn(dir, c, existing.id) ?? "off") : "off";
          if (modes[c] !== before) await remote.setChannelAgent({ chatId: c, agentId: id, mode: modes[c] });
        }
      }
      await qc.refetchQueries({ queryKey: queryKeys.directory });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing || !window.confirm(`Remove ${existing.name} from ${dir.workspace.name}? Its messages stay.`)) return;
    setBusy(true);
    try {
      await remote.deleteAgent(existing.id);
      await qc.refetchQueries({ queryKey: queryKeys.directory });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const openDm = async () => {
    if (!existing) return;
    const dm = agentDmOf(dir, existing.id) ?? (await remote.openDm(existing.id)).id;
    await qc.refetchQueries({ queryKey: queryKeys.directory });
    onDone();
    router.push(`/chat/${dm}`);
  };

  const input = "mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-subtle disabled:opacity-70";
  return (
    <form onSubmit={save}>
      {existing && (
        <div className="mb-5 flex items-center gap-3">
          <Avatar person={personOf(dir, existing.id)} size="xl" className="rounded-[9px]" />
          <p className="min-w-0 flex-1 text-meta text-muted-foreground">{existing.description}</p>
          <button type="button" onClick={openDm} className="h-9 shrink-0 cursor-pointer rounded-md border px-3 text-meta font-semibold hover:bg-muted">
            Message
          </button>
        </div>
      )}
      {!existing && (
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="w-full text-meta text-muted-foreground">Start from a template</span>
          {TEMPLATES.map((t) => (
            <button key={t.handle} type="button" onClick={() => apply(t)} className="h-8 cursor-pointer rounded-full border px-3 text-meta font-semibold hover:bg-muted">
              {t.name}
            </button>
          ))}
        </div>
      )}

      {!builtin && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-meta font-semibold">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} required maxLength={40} placeholder="Triage" className={input} />
            </label>
            <label className="text-meta font-semibold">
              Handle
              <div className="mt-1.5 flex h-10 items-center rounded-md border bg-background px-3 focus-within:border-subtle">
                <span className="text-muted-foreground">@</span>
                <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} disabled={!editable} placeholder="triage" className="min-w-0 flex-1 bg-transparent pl-0.5 text-sm outline-none" />
              </div>
            </label>
          </div>
          <label className="mt-3 block text-meta font-semibold">
            Role
            <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!editable} maxLength={200} placeholder="What it's for, in one line" className={input} />
          </label>
          <label className="mt-3 block text-meta font-semibold">
            Instructions
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={!editable}
              rows={4}
              maxLength={4000}
              placeholder="How it should work: what to do, what to avoid, who to hand off to."
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-subtle disabled:opacity-70"
            />
          </label>
          <fieldset className="mt-3">
            <legend className="text-meta font-semibold">Can</legend>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {([["read", "Read tickets and chat"], ["write", "Create & update tickets"], ["delete", "Delete tickets (needs Confirm)"]] as [AgentTool, string][]).map(([t, label]) => (
                <label key={t} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={tools.includes(t)}
                    disabled={!editable || t === "read"}
                    onChange={(e) => setTools((cur) => (e.target.checked ? [...new Set([...cur, t])] : cur.filter((x) => x !== t)))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-meta text-muted-foreground">It always acts with the permissions of whoever asked it.</p>
          </fieldset>
        </>
      )}

      {canJoin && dir.channels.length > 0 && (
        <fieldset className="mt-5">
          <legend className="text-meta font-semibold">Channels</legend>
          <p className="text-meta text-muted-foreground">It can only read channels it&apos;s in. Everyone sees it in the channel&apos;s agent list.</p>
          <ul className="mt-2 divide-y rounded-lg border">
            {dir.channels.map((c) => {
              const meta = dir.chats[c];
              if (meta?.kind !== "channel") return null;
              return (
                <li key={c} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate text-sm"># {meta.label}</span>
                  <select
                    aria-label={`Mode in #${meta.label}`}
                    value={modes[c]}
                    onChange={(e) => setModes((m) => ({ ...m, [c]: e.target.value as AgentMode | "off" }))}
                    className="h-8 rounded-md border bg-background px-2 text-meta"
                  >
                    {MODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} title={o.hint}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {error && <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-meta text-destructive">{error}</p>}
      <div className="mt-6 flex items-center justify-between gap-2">
        {existing && editable && !builtin ? (
          <button type="button" onClick={remove} disabled={busy} className="h-10 cursor-pointer rounded-md px-3 text-sm font-semibold text-destructive hover:bg-danger-soft">
            Remove agent
          </button>
        ) : (
          <span />
        )}
        <button type="submit" disabled={busy || (!builtin && !name.trim())} className="flex h-10 cursor-pointer items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy && <LoaderCircleIcon className="size-4 animate-spin" />} {existing ? "Save" : "Add agent"}
        </button>
      </div>
    </form>
  );
}
