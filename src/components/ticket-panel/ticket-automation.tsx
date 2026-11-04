"use client";

import { ListChecksIcon, Undo2Icon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/common/avatar";
import { Button } from "@/components/ui/button";
import { useTicketAutomation, useUndoTriage } from "@/hooks/use-automation";
import { useDirectory } from "@/hooks/use-directory";
import type { PlaybookRun } from "@/lib/automation";
import { personOf } from "@/lib/directory";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/**
 * Under the title: who triaged the ticket and why (with Undo), and the playbooks that
 * ran on it. Nothing at all for tickets automation never touched.
 */
export function TicketAutomation({ ticket: t }: { ticket: Ticket }) {
  const dir = useDirectory();
  const { data } = useTicketAutomation(t.id, t.title, t.activity.length);
  const undo = useUndoTriage();
  const triage = data?.triage;
  const runs = data?.runs ?? [];
  const show = triage && triage.status !== "skipped" && triage.status !== "failed";
  if (!show && !runs.length) return null;
  const agent = triage ? personOf(dir, triage.agentId) : null;

  return (
    <div className="flex flex-col gap-2">
      {show && agent && (
        <div className="rounded-md border bg-muted/40 px-3 py-2" aria-live="polite">
          <div className="flex items-start gap-2">
            <Avatar person={agent} size="xs" className="mt-px" />
            {triage.status === "running" ? (
              <span className="flex-1 text-[13px] text-muted-foreground">{agent.name} is triaging this ticket…</span>
            ) : (
              <span className={cn("min-w-0 flex-1 text-[13px]", triage.status === "undone" ? "text-muted-foreground line-through" : "text-foreground")}>
                <span className="font-medium">Triaged by {agent.name}</span>
                <span className="text-muted-foreground"> · {triage.summary}</span>
              </span>
            )}
            {triage.undoable && (
              <Button variant="ghost" size="sm" className="-my-0.5 h-7 px-2" onClick={() => undo.mutate(t.id)} disabled={undo.isPending} aria-label={`Undo ${agent.name}'s triage`}>
                <Undo2Icon className="size-3.5" />
                Undo
              </Button>
            )}
            {triage.status === "undone" && <span className="text-[12px] text-muted-foreground">Undone</span>}
          </div>
          {triage.reason && triage.status !== "running" && <p className="mt-1 pl-7 text-[12px] leading-snug text-muted-foreground">{triage.reason}</p>}
          {undo.error && <p className="mt-1 pl-7 text-[12px] text-destructive">{(undo.error as Error).message}</p>}
        </div>
      )}
      {runs.map((r) => (
        <RunRow key={r.id} run={r} />
      ))}
    </div>
  );
}

const STATUS: Record<PlaybookRun["status"], { label: string; cls: string }> = {
  running: { label: "Running", cls: "border-[var(--status-progress-line)] text-[var(--status-progress-fg)]" },
  done: { label: "Completed", cls: "border-[var(--status-done-line)] text-[var(--status-done-fg)]" },
  failed: { label: "Stopped", cls: "border-input text-muted-foreground" },
};

function RunRow({ run: r }: { run: PlaybookRun }) {
  const router = useRouter();
  const s = STATUS[r.status];
  const step = r.status === "done" ? r.total : Math.min(r.step + 1, r.total);
  const openThread = () => {
    // The chat opens the thread once its messages load (same path as a cited message).
    if (r.threadId) useUiStore.setState({ focus: { chatId: r.chatId, threadId: r.threadId, id: r.threadId }, ticketId: null });
    router.push(`/chat/${r.chatId}`);
  };
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]">
      <ListChecksIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 leading-snug">
        <span className="font-medium">{r.playbookName}</span>
        <span className="text-muted-foreground">
          {" "}
          playbook · step {step} of {r.total}
        </span>
      </span>
      <span className={cn("shrink-0 rounded-sm border px-1.5 py-px text-[12px] font-medium", s.cls)} title={r.error ?? undefined}>
        {s.label}
      </span>
      {r.chatId && (
        <Button variant="ghost" size="sm" className="-my-1 h-7 shrink-0 px-2" onClick={openThread}>
          View thread
        </Button>
      )}
    </div>
  );
}
