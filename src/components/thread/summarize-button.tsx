"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ListChecksIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { trackRun, useLiveRuns } from "@/hooks/use-agent-runs";
import { useRole } from "@/hooks/use-directory";
import * as remote from "@/lib/api/remote";
import type { ChatId } from "@/lib/types";

/**
 * "Summarize" in the thread header: Atlas posts a TL;DR, decisions, owners and next steps,
 * and open questions into the thread. It runs as an agent run, so the thread shows Atlas
 * working live; the button spins until the summary lands.
 */
export function SummarizeButton({ chatId, threadId, disabled }: { chatId: ChatId; threadId: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const role = useRole();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = useLiveRuns(chatId, threadId).some((r) => r.trigger === "summary" && (r.status === "queued" || r.status === "running"));
  const busy = starting || working;

  const run = async () => {
    setStarting(true);
    setError(null);
    try {
      trackRun(qc, await remote.summarizeThread(chatId, threadId, role));
    } catch (e) {
      setError((e as Error).message);
      setTimeout(() => setError(null), 4000);
    } finally {
      setStarting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy || disabled}
      title={error ?? (disabled ? "Nothing to summarize yet" : "Atlas posts a summary of this thread")}
      aria-label={busy ? "Summarizing the thread" : "Summarize thread"}
      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input px-2.5 text-[13px] font-medium text-ink-2 hover:bg-muted disabled:cursor-default disabled:opacity-60"
    >
      {busy ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <ListChecksIcon className="size-3.5" />}
      <span className={error ? "text-destructive" : undefined}>{error ? "Couldn't summarize" : busy ? "Summarizing…" : "Summarize"}</span>
    </button>
  );
}
