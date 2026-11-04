"use client";

import { ArrowDownIcon, ArrowUpIcon, ListChecksIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { CardSkeletons } from "@/components/common/skeleton";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeletePlaybook, usePlaybooks, useSavePlaybook, useSetPlaybookEnabled } from "@/hooks/use-automation";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { MAX_PLAYBOOK_STEPS, type PlaybookInput, type PlaybookRun, type PlaybookStep, type PlaybookView } from "@/lib/automation";
import { STATUSES } from "@/lib/constants";
import { agentsOf, chatTitle, personOf } from "@/lib/directory";
import type { TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const ago = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const triggerText = (p: Pick<PlaybookView, "trigger">) => (p.trigger.kind === "label" ? `a ticket is labeled ${p.trigger.label}` : `a ticket moves to ${p.trigger.status}`);

/** Workspace playbooks: a trigger plus ordered agent steps. Owners edit; everyone else reads. */
export function PlaybooksScreen() {
  const role = useRole();
  const { data, isPending, error } = usePlaybooks();
  const [editing, setEditing] = useState<PlaybookView | "new" | null>(null);
  const owner = role === "owner";

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ScreenHeader
        actions={
          owner && (
            <Button onClick={() => setEditing("new")} aria-label="New playbook" className="size-10 px-0 sm:h-8 sm:w-auto sm:px-3">
              <PlusIcon strokeWidth={2.2} className="size-5 sm:size-4" />
              <span className="hidden sm:inline">New playbook</span>
            </Button>
          )
        }
      >
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <h1 className="text-base font-semibold">Playbooks</h1>
          <span className="hidden truncate text-meta text-muted-foreground md:block">When something happens to a ticket, agents take it from there, one step at a time.</span>
        </div>
      </ScreenHeader>
      <div className="flex-1 overflow-y-auto bg-canvas px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {!owner && <p className="text-meta text-muted-foreground">Only org owners can create or change playbooks. You can see what runs and when.</p>}
          {isPending && <CardSkeletons count={2} />}
          {error && <p className="text-meta text-destructive">{(error as Error).message}</p>}
          {data && !data.length && (
            <div className="mt-10 rounded-md border bg-card p-6 text-center">
              <ListChecksIcon className="mx-auto size-5 text-muted-foreground" />
              <h2 className="mt-2 text-sm font-semibold">No playbooks yet</h2>
              <p className="mt-1 text-meta text-muted-foreground">
                A playbook hands a ticket from agent to agent: for example, when a ticket is labeled bug, Tess confirms the repro, Rex assesses the risk and Atlas assigns
                an owner.
              </p>
            </div>
          )}
          <ul className="fade-in flex flex-col gap-3">
            {data?.map((p) => (
              <PlaybookCard key={p.id} p={p} owner={owner} onEdit={() => setEditing(p)} />
            ))}
          </ul>
        </div>
      </div>
      {editing && <PlaybookDialog initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

function PlaybookCard({ p, owner, onEdit }: { p: PlaybookView; owner: boolean; onEdit: () => void }) {
  const dir = useDirectory();
  const toggle = useSetPlaybookEnabled();
  const where = p.chatId && dir.chats[p.chatId] ? chatTitle(dir, p.chatId) : null;
  return (
    <li className={cn("rounded-md border bg-card p-4", !p.enabled && "bg-muted/30")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{p.name}</h2>
          <p className="mt-0.5 text-meta text-muted-foreground">
            When {triggerText(p)} · {p.steps.length} {p.steps.length === 1 ? "step" : "steps"}
            {where ? ` · posts in the ticket's thread, or #${where.replace(/^#/, "")}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {owner ? (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={p.enabled}
                aria-label={`${p.name} enabled`}
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ id: p.id, enabled: !p.enabled })}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 text-[12px] font-medium text-ink-2 hover:bg-muted disabled:opacity-60"
              >
                <span className={cn("relative inline-flex h-4 w-7 items-center rounded-full transition-colors", p.enabled ? "bg-brand" : "bg-input")}>
                  <span className={cn("absolute size-3 rounded-full bg-white transition-transform", p.enabled ? "translate-x-3.5" : "translate-x-0.5")} />
                </span>
                {p.enabled ? "On" : "Off"}
              </button>
              <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${p.name}`}>
                <PencilIcon className="size-4" />
              </Button>
            </>
          ) : (
            <span className={cn("rounded-sm border px-1.5 py-px text-[12px] font-medium", p.enabled ? "border-[var(--status-done-line)] text-[var(--status-done-fg)]" : "border-input text-muted-foreground")}>
              {p.enabled ? "On" : "Off"}
            </span>
          )}
        </div>
      </div>
      <ol className="mt-3 flex flex-col gap-2">
        {p.steps.map((s, i) => {
          const a = personOf(dir, s.agentId);
          return (
            <li key={i} className="flex items-start gap-2.5 text-[13px]">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium text-muted-foreground tabular">{i + 1}</span>
              <Avatar person={a} size="xs" className="mt-0.5" />
              <span className="min-w-0">
                <span className="font-medium">{a.name}</span>
                <span className="text-ink-2"> · {s.instruction}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <RecentRuns runs={p.runs} />
    </li>
  );
}

const RUN_STATUS: Record<PlaybookRun["status"], { label: string; cls: string }> = {
  running: { label: "Running", cls: "border-[var(--status-progress-line)] text-[var(--status-progress-fg)]" },
  done: { label: "Completed", cls: "border-[var(--status-done-line)] text-[var(--status-done-fg)]" },
  failed: { label: "Stopped", cls: "border-input text-muted-foreground" },
};

function RecentRuns({ runs }: { runs: PlaybookRun[] }) {
  const { lookup } = useVisibleTickets();
  const openTicket = useUiStore((s) => s.openTicket);
  return (
    <div className="mt-3 border-t pt-3">
      <h3 className="text-[12px] font-medium text-muted-foreground">Recent runs</h3>
      {!runs.length ? (
        <p className="mt-1 text-[13px] text-muted-foreground">No runs yet.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {runs.map((r) => {
            const t = lookup(r.ticketId).ticket;
            const s = RUN_STATUS[r.status];
            const done = r.status === "done" ? r.total : r.step;
            return (
              <li key={r.id} className="flex items-center gap-2.5 text-[13px]">
                <button
                  type="button"
                  onClick={() => t && openTicket(t.id)}
                  disabled={!t}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left hover:underline disabled:cursor-default disabled:no-underline"
                >
                  <span className="font-medium tabular">{r.ticketId}</span>
                  <span className="text-ink-2"> {t?.title ?? ""}</span>
                </button>
                <span className="hidden items-center gap-1 sm:flex" aria-label={`${done} of ${r.total} steps done`}>
                  {Array.from({ length: r.total }, (_, i) => (
                    <span key={i} className={cn("h-1.5 w-4 rounded-full", i < done ? "bg-brand" : i === r.step && r.status === "running" ? "bg-brand/40" : "bg-input")} />
                  ))}
                </span>
                <span className="w-20 shrink-0 text-right text-[12px] text-muted-foreground">{ago(r.createdAt)}</span>
                <span className={cn("shrink-0 rounded-sm border px-1.5 py-px text-[12px] font-medium", s.cls)} title={r.error ?? undefined}>
                  {r.status === "running" ? `Step ${Math.min(r.step + 1, r.total)} of ${r.total}` : s.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const field = "flex flex-col gap-1";

function PlaybookDialog({ initial, onClose }: { initial: PlaybookView | null; onClose: () => void }) {
  const dir = useDirectory();
  const { all } = useVisibleTickets();
  const save = useSavePlaybook();
  const del = useDeletePlaybook();
  const agents = agentsOf(dir).filter((a) => a.kind !== "external");
  const labels = useMemo(() => [...new Set(["bug", ...all.flatMap((t) => t.labels ?? [])])].sort(), [all]);
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"label" | "status">(initial?.trigger.kind ?? "label");
  const [label, setLabel] = useState(initial?.trigger.kind === "label" ? initial.trigger.label : "bug");
  const [status, setStatus] = useState<TicketStatus>(initial?.trigger.kind === "status" ? initial.trigger.status : "In review");
  const [chatId, setChatId] = useState(initial?.chatId ?? dir.channels.find((c) => dir.chats[c]?.kind === "channel" && /eng/i.test((dir.chats[c] as { label: string }).label)) ?? dir.home);
  const [steps, setSteps] = useState<PlaybookStep[]>(initial?.steps ?? [{ agentId: agents[0]?.id ?? "atlas", instruction: "" }]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setStep = (i: number, patch: Partial<PlaybookStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: PlaybookInput = {
      id: initial?.id, name, chatId, steps, enabled: initial?.enabled ?? true,
      trigger: kind === "label" ? { kind: "label", label } : { kind: "status", status },
    };
    save.mutate(input, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={initial ? "Edit playbook" : "New playbook"} description="A trigger, then agents in order. Each step starts when the previous one has posted." className="max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className={field}>
            <Label htmlFor="pb-name">Name</Label>
            <Input id="pb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bug intake" maxLength={60} autoFocus />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={field}>
              <Label htmlFor="pb-trigger">When</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "label" | "status")}>
                <SelectTrigger id="pb-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="label">A ticket is labeled…</SelectItem>
                  <SelectItem value="status">A ticket moves to…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={field}>
              <Label htmlFor="pb-value">{kind === "label" ? "Label" : "Status"}</Label>
              {kind === "label" ? (
                <Select value={label} onValueChange={setLabel}>
                  <SelectTrigger id="pb-value">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {labels.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus)}>
                  <SelectTrigger id="pb-value">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className={field}>
            <Label htmlFor="pb-chat">Post in</Label>
            <Select value={chatId} onValueChange={setChatId}>
              <SelectTrigger id="pb-chat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dir.channels.map((c) => (
                  <SelectItem key={c} value={c}>
                    {chatTitle(dir, c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[12px] text-muted-foreground">Steps post in the ticket&apos;s watch thread when it has one; otherwise in a new thread here.</span>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Steps</legend>
            {steps.map((s, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-md border p-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium text-muted-foreground">{i + 1}</span>
                  <Select value={s.agentId} onValueChange={(v) => setStep(i, { agentId: v })}>
                    <SelectTrigger aria-label={`Step ${i + 1} agent`} className="w-full sm:w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  aria-label={`Step ${i + 1} instruction`}
                  value={s.instruction}
                  onChange={(e) => setStep(i, { instruction: e.target.value })}
                  placeholder="What should this agent do?"
                  maxLength={300}
                  className="min-w-0 flex-1"
                />
                <div className="flex items-center justify-end">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove step ${i + 1}`} disabled={steps.length === 1} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>
                    <XIcon className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {steps.length < MAX_PLAYBOOK_STEPS && (
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setSteps((s) => [...s, { agentId: agents[0]?.id ?? "atlas", instruction: "" }])}>
                <PlusIcon className="size-4" />
                Add step
              </Button>
            )}
          </fieldset>
          {(save.error || del.error) && <p className="text-[13px] text-destructive">{((save.error ?? del.error) as Error).message}</p>}
          <div className="flex items-center gap-2 border-t pt-3">
            {initial &&
              (confirmDelete ? (
                <Button type="button" variant="destructive" size="sm" disabled={del.isPending} onClick={() => del.mutate(initial.id, { onSuccess: onClose })}>
                  <Trash2Icon className="size-4" />
                  Delete playbook?
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2Icon className="size-4" />
                  Delete
                </Button>
              ))}
            <span className="flex-1" />
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {initial ? "Save changes" : "Create playbook"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
