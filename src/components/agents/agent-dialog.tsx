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
import { AgentMemorySection } from "./agent-memory";

type Open = { open: boolean; onOpenChange: (o: boolean) => void };

// Built-in agents only: connecting your own agent over MCP exists (docs/mcp.md) but is
// kept out of the UI so trying Meld needs no setup.
const TEMPLATES: { name: string; handle: string; description: string; instructions: string; tools: AgentTool[]; kind?: "external" }[] = [
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
  const [kind, setKind] = useState<"custom" | "external">(existing?.kind === "external" ? "external" : "custom");
  const [token, setToken] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, AgentMode | "off">>(() =>
    Object.fromEntries(dir.channels.map((c) => [c, (existing ? agentModeIn(dir, c, existing.id) : null) ?? "off"])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canJoin = dir.role !== "guest";

  const apply = (t: (typeof TEMPLATES)[number]) => {
    setKind(t.kind ?? "custom");
    setName(t.kind === "external" ? "Coder" : t.name);
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
        else {
          const made = await remote.createAgent({ ...input, kind });
          id = made.id;
          if (made.token) setToken(made.token);
        }
      }
      if (canJoin && id) {
        for (const c of dir.channels) {
          const before = existing ? (agentModeIn(dir, c, existing.id) ?? "off") : "off";
          if (modes[c] !== before) await remote.setChannelAgent({ chatId: c, agentId: id, mode: modes[c] });
        }
      }
      await qc.refetchQueries({ queryKey: queryKeys.directory });
      // An external agent's token is shown once: keep the dialog open to copy it.
      if (!(kind === "external" && !existing)) onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!existing || !window.confirm("Make a new token? The current one stops working.")) return;
    try {
      setToken((await remote.rotateAgentToken(existing.id)).token);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (token) return <Connect token={token} handle={handle || existing?.handle || "agent"} onDone={onDone} />;

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

  const input = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm font-normal text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-70";
  return (
    <form onSubmit={save}>
      {existing && (
        <div className="mb-5 flex items-center gap-3">
          <Avatar person={personOf(dir, existing.id)} size="xl" />
          <p className="min-w-0 flex-1 text-meta text-muted-foreground">{existing.description}</p>
          <button type="button" onClick={openDm} className="h-8 shrink-0 cursor-pointer rounded-md border border-input px-2.5 text-meta font-medium hover:bg-muted">
            Message
          </button>
        </div>
      )}
      {!existing && (
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="w-full text-xs font-medium text-muted-foreground">Start from a template</span>
          {TEMPLATES.map((t) => (
            <button key={t.handle} type="button" onClick={() => apply(t)} className="h-7 cursor-pointer rounded-md border border-input px-2.5 text-meta font-medium hover:bg-muted">
              {t.name}
            </button>
          ))}
        </div>
      )}

      {kind === "external" && (
        <div className="mb-4 rounded-md border bg-muted px-3 py-2.5 text-meta">
          <strong>Connects over MCP.</strong> Claude Code, Codex or your own agent joins as @{handle || "coder"}: it gets an inbox for mentions, DMs and
          hand-offs, reads the channels you add it to, replies, and updates tickets. You&apos;ll get a token and a one-line command.
          {existing && editable && (
            <button type="button" onClick={rotate} className="ml-2 cursor-pointer font-semibold text-link hover:underline">
              New token
            </button>
          )}
        </div>
      )}
      {!builtin && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-ink-2">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} required maxLength={40} placeholder="Triage" className={input} />
            </label>
            <label className="text-xs font-medium text-ink-2">
              Handle
              <div className="mt-1 flex h-9 items-center rounded-md border border-input bg-background px-2.5 text-sm font-normal text-foreground focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                <span className="text-muted-foreground">@</span>
                <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} disabled={!editable} placeholder="triage" className="min-w-0 flex-1 bg-transparent pl-0.5 text-sm outline-none" />
              </div>
            </label>
          </div>
          <label className="mt-3 block text-xs font-medium text-ink-2">
            Role
            <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!editable} maxLength={200} placeholder="What it's for, in one line" className={input} />
          </label>
          {kind !== "external" && (
          <label className="mt-3 block text-xs font-medium text-ink-2">
            Instructions
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={!editable}
              rows={4}
              maxLength={4000}
              placeholder="How it should work: what to do, what to avoid, who to hand off to."
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm font-normal text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-70"
            />
          </label>
          )}
          <fieldset className="mt-3">
            <legend className="text-xs font-medium text-ink-2">Can</legend>
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

      {existing && existing.kind !== "external" && <AgentMemorySection agent={existing} />}

      {canJoin && dir.channels.length > 0 && (
        <fieldset className="mt-5">
          <legend className="text-xs font-medium text-ink-2">Channels</legend>
          <p className="text-meta text-muted-foreground">It can only read channels it&apos;s in. Everyone sees it in the channel&apos;s agent list.</p>
          <ul className="mt-2 divide-y rounded-md border">
            {dir.channels.map((c) => {
              const meta = dir.chats[c];
              if (meta?.kind !== "channel") return null;
              return (
                <li key={c} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="truncate text-sm"># {meta.label}</span>
                  <select
                    aria-label={`Mode in #${meta.label}`}
                    value={modes[c]}
                    onChange={(e) => setModes((m) => ({ ...m, [c]: e.target.value as AgentMode | "off" }))}
                    className="h-7 rounded-[4px] border border-input bg-background px-1.5 text-meta"
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
      <div className="mt-5 flex items-center justify-between gap-2 border-t pt-4">
        {existing && editable && !builtin ? (
          <button type="button" onClick={remove} disabled={busy} className="h-9 cursor-pointer rounded-md px-3 text-sm font-medium text-destructive hover:bg-danger-soft">
            Remove agent
          </button>
        ) : (
          <span />
        )}
        <button type="submit" disabled={busy || (!builtin && !name.trim())} className="flex h-9 cursor-pointer items-center gap-2 rounded-md bg-brand px-3.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy && <LoaderCircleIcon className="size-4 animate-spin" />} {existing ? "Save" : "Add agent"}
        </button>
      </div>
    </form>
  );
}

/** Shown once after creating an external agent: its token and the command to connect. */
function Connect({ token, handle, onDone }: { token: string; handle: string; onDone: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const command = `claude mcp add --transport http meld-${handle} ${origin}/api/mcp --header "Authorization: Bearer ${token}"`;
  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <div>
      <p className="text-sm">
        @{handle} is a member now. Connect your agent with this command (Claude Code shown; any MCP client works with the same URL and header). Copy the
        token now: it isn&apos;t shown again.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md border bg-muted p-3 font-mono text-meta whitespace-pre-wrap break-all" data-testid="mcp-command">{command}</pre>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => copy("cmd", command)} className="h-8 cursor-pointer rounded-md bg-foreground px-3 text-meta font-medium text-background">
          {copied === "cmd" ? "Copied" : "Copy command"}
        </button>
        <button type="button" onClick={() => copy("tok", token)} className="h-8 cursor-pointer rounded-md border border-input px-3 text-meta font-medium hover:bg-muted">
          {copied === "tok" ? "Copied" : "Copy token"}
        </button>
      </div>
      <p className="mt-4 text-meta text-muted-foreground">
        Then ask it something like: &ldquo;Check your Meld inbox and handle what&apos;s there.&rdquo; Tag @{handle} in a channel it&apos;s in to give it work.
      </p>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onDone} className="h-9 cursor-pointer rounded-md bg-brand px-3.5 text-sm font-medium text-white hover:opacity-90">
          Done
        </button>
      </div>
    </div>
  );
}
