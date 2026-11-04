"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { trackRun } from "@/hooks/use-agent-runs";
import { useRole } from "@/hooks/use-directory";
import * as remote from "@/lib/api/remote";
import type { ChatId } from "@/lib/types";

const MAX = 30_000;

/**
 * "Add meeting notes": paste notes or a transcript, and Atlas posts the summary,
 * decisions, action items and open questions in this channel. It runs as an Atlas run,
 * so the dialog closes right away and the channel shows Atlas working.
 */
export function MeetingNotesDialog({ chatId, open, onOpenChange }: { chatId: ChatId; open: boolean; onOpenChange: (o: boolean) => void }) {
  const role = useRole();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      trackRun(qc, await remote.queueMeetingNotes({ chatId, text, title: title.trim() || undefined, role }));
      onOpenChange(false);
      setTitle("");
      setText("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = "mt-1.5 w-full rounded border bg-background px-2.5 text-sm outline-none focus:border-subtle";
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        title="Add meeting notes"
        description="Atlas posts a summary with decisions, action items and open questions. Decisions go to the decision log; tickets wait for your OK."
        className="max-w-xl"
      >
        <form onSubmit={submit}>
          <label className="block text-meta font-semibold">
            Meeting title <span className="font-normal text-muted-foreground">(optional)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Weekly product sync" className={`${field} h-9`} />
          </label>
          <label className="mt-3 block text-meta font-semibold">
            Notes or transcript
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              rows={12}
              maxLength={MAX}
              placeholder={"Paste notes or a transcript, e.g.\nSofia: Let's lock the launch date for the 18th.\nJonas: I'll have the webhooks done by Thursday."}
              className={`${field} min-h-[180px] resize-y py-2 font-mono text-[13px] leading-[1.5]`}
            />
          </label>
          <div className="mt-1 flex justify-between gap-3 text-meta text-muted-foreground">
            <span>Owners are matched to people in the workspace; open tickets are reused, not duplicated.</span>
            <span className="shrink-0 tabular-nums">{text.length > MAX * 0.8 ? `${text.length.toLocaleString("en-US")} / ${MAX.toLocaleString("en-US")}` : ""}</span>
          </div>
          {error && <p role="alert" className="mt-3 rounded border border-destructive/30 bg-danger-soft px-3 py-2 text-meta text-destructive">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className="h-9 cursor-pointer rounded border border-input px-3.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" disabled={busy || text.trim().length < 40} className="flex h-9 cursor-pointer items-center gap-2 rounded bg-brand px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-60">
              {busy && <LoaderCircleIcon className="size-4 animate-spin" />}
              {busy ? "Sending…" : "Process notes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
