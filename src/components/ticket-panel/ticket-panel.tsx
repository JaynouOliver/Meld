"use client";

import { CircleDotIcon, GitPullRequestIcon, ImageIcon, TicketIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { StatusPill } from "@/components/common/status-pill";
import { PanelHeader, SidePanel } from "@/components/shell/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useDeleteTicket, useUpdateTicket, useVisibleTickets } from "@/hooks/use-tickets";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import { personOf, teamName } from "@/lib/directory";
import { canDelete } from "@/lib/rbac";
import type { PersonId, Priority, Ticket, TicketStatus } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";

/** Ticket detail panel. Rendered by the shell; shows whichever ticket is open and visible. */
export function TicketPanel() {
  const ticketId = useUiStore((s) => s.ticketId);
  const closeTicket = useUiStore((s) => s.closeTicket);
  const { visible } = useVisibleTickets();
  const ticket = ticketId ? visible.find((t) => t.id === ticketId) : undefined;
  if (!ticket) return null;
  return (
    <SidePanel label="Ticket" width="ticket" onClose={closeTicket}>
      {/* key resets local drafts when switching tickets */}
      <TicketDetail key={ticket.id} ticket={ticket} onClose={closeTicket} />
    </SidePanel>
  );
}

const sectionLabel = "text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase";

function TicketDetail({ ticket: t, onClose }: { ticket: Ticket; onClose: () => void }) {
  const dir = useDirectory();
  const role = useRole();
  const linkKind = useUiStore((s) => s.linkKind);
  const setLinkKind = useUiStore((s) => s.setLinkKind);
  const update = useUpdateTicket();
  const del = useDeleteTicket();
  const [title, setTitle] = useState(t.title);
  const [desc, setDesc] = useState(t.description);
  const [linkNum, setLinkNum] = useState("");
  const [confirming, setConfirming] = useState(false);
  // iOS Safari doesn't always blur on outside taps, so the confirm also disarms itself.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);
  // Title wraps and grows instead of being cut off on narrow screens.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  const reporter = personOf(dir, t.reporter);
  // A former member stays selectable as the current assignee.
  const assignees = dir.personOrder.includes(t.assignee) ? dir.personOrder : [...dir.personOrder, t.assignee];

  const commitTitle = () => title !== t.title && update.mutate({ id: t.id, patch: { title } });
  const commitDesc = () => desc !== t.description && update.mutate({ id: t.id, patch: { description: desc } });
  const addLink = () => {
    const num = linkNum.replace(/[^0-9]/g, "");
    if (!num) return;
    update.mutate({ id: t.id, addLink: { kind: linkKind, num } });
    setLinkNum("");
  };
  const onImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => update.mutate({ id: t.id, addImage: { src: String(rd.result), name: f.name } });
    rd.readAsDataURL(f);
    e.target.value = "";
  };

  return (
    <>
      <PanelHeader
        onClose={onClose}
        closeLabel="Close ticket"
        actions={
          canDelete(role) &&
          (confirming ? (
            <Button variant="destructive" className="h-10" onClick={() => del.mutate(t.id)} onBlur={() => setConfirming(false)} autoFocus>
              <Trash2Icon className="size-4" />
              Delete?
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete ticket"
              title="Delete ticket (org owners only)"
              className="size-11 text-destructive hover:text-destructive sm:size-10"
              onClick={() => setConfirming(true)}
            >
              <Trash2Icon className="size-[17px]" />
            </Button>
          ))
        }
      >
        <TicketIcon aria-hidden className="hidden size-[18px] text-agent-foreground sm:block" />
        <h2 className="text-base font-bold whitespace-nowrap">{t.id}</h2>
        <StatusPill status={t.status} />
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{teamName(dir, t.team)}</span>
      </PanelHeader>

      <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-4 pt-4 pb-[max(24px,env(safe-area-inset-bottom))] sm:px-5">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tk-title" className={sectionLabel}>
            Title
          </Label>
          <textarea
            id="tk-title"
            ref={titleRef}
            rows={1}
            value={title}
            // New tickets start empty: put the cursor in the title.
            autoFocus={!t.title}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="Add a title"
            className="-mx-2 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1.5 text-xl leading-snug font-bold text-foreground outline-none hover:border-border focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="tk-status" label="Status">
            <Select value={t.status} onValueChange={(v) => update.mutate({ id: t.id, patch: { status: v as TicketStatus } })}>
              <SelectTrigger id="tk-status">
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
          </Field>
          <Field id="tk-priority" label="Priority">
            <Select value={t.priority} onValueChange={(v) => update.mutate({ id: t.id, patch: { priority: v as Priority } })}>
              <SelectTrigger id="tk-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="tk-assignee" label="Assignee">
            <Select value={t.assignee} onValueChange={(v) => update.mutate({ id: t.id, patch: { assignee: v as PersonId } })}>
              <SelectTrigger id="tk-assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignees.map((k) => {
                  const p = personOf(dir, k);
                  return (
                    <SelectItem key={k} value={k}>
                      <Avatar person={p} size="xs" className="mr-2 align-middle" />
                      {p.name}
                      {p.isAgent ? " (agent)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Reporter</span>
            <span className="flex min-h-[38px] items-center gap-2 text-sm">
              <Avatar person={reporter} size="sm" />
              {reporter.name}
              {reporter.isAgent ? " (agent)" : ""}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="tk-desc" className={sectionLabel}>
            Description
          </Label>
          <Textarea
            id="tk-desc"
            rows={5}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={commitDesc}
            placeholder="Describe the work, acceptance criteria, links…"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className={sectionLabel}>Images · {t.images.length}</span>
            <label
              htmlFor="tk-image"
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 md:min-h-9 text-meta font-semibold text-foreground hover:bg-muted focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring"
            >
              <ImageIcon className="size-[15px]" />
              Add image
              <input id="tk-image" type="file" accept="image/*" onChange={onImage} className="sr-only" />
            </label>
          </div>
          {t.images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {t.images.map((im) => (
                <div key={im.id} className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user uploads as data URLs */}
                  <img src={im.src} alt={im.name} className="block size-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => update.mutate({ id: t.id, removeImageId: im.id })}
                    className="absolute top-1 right-1 flex size-9 cursor-pointer md:size-7 items-center justify-center rounded-md bg-black/65 text-white"
                  >
                    <XIcon className="size-3.5" strokeWidth={2.4} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-input p-3.5 text-center text-meta text-muted-foreground">
              No images yet. Add screenshots or mockups.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className={sectionLabel}>GitHub</span>
          {t.links.map((l) => (
            <div key={l.id} className="flex items-center gap-2.5 rounded-lg border py-1.5 pr-1.5 pl-3">
              {l.kind === "PR" ? (
                <GitPullRequestIcon aria-hidden className="size-4 text-success" />
              ) : (
                <CircleDotIcon aria-hidden className="size-4 text-success" />
              )}
              <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                <span className="text-sm font-semibold">{(l.kind === "PR" ? "Pull request #" : "Issue #") + l.num}</span>
                <span className="text-xs text-muted-foreground">{l.repo}</span>
              </span>
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">Open</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Unlink ${l.kind} #${l.num}`}
                onClick={() => update.mutate({ id: t.id, removeLinkId: l.id })}
              >
                <XIcon className="size-3.5" strokeWidth={2.2} />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
            <Select value={linkKind} onValueChange={(v) => setLinkKind(v as "PR" | "Issue")}>
              <SelectTrigger aria-label="Link type" className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PR">Pull request</SelectItem>
                <SelectItem value="Issue">Issue</SelectItem>
              </SelectContent>
            </Select>
            <Input
              aria-label="Number"
              value={linkNum}
              onChange={(e) => setLinkNum(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                }
              }}
              placeholder="Number, e.g. 512"
              inputMode="numeric"
              autoComplete="off"
              className="min-w-0 flex-1"
            />
            <Button variant="outline" className="h-10 md:h-[38px]" onClick={addLink}>
              Link
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">{dir.workspace.repo ? `Repository: ${dir.workspace.repo}` : "No default repository set for this workspace"}</span>
        </div>

        <div className="flex flex-col gap-2">
          <span className={sectionLabel}>Activity</span>
          {[...t.activity].reverse().map((a, i) => (
            <div key={i} className="flex gap-2 text-meta leading-[1.45] text-ink-2">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: a.who === "Atlas" ? "#D97706" : "var(--brand)" }} />
              <span>
                <strong className="font-semibold text-foreground">{a.who}</strong> {a.text} · <span className="text-muted-foreground">{a.time}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
