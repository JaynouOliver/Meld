"use client";

import { AgentBadge } from "@/components/common/agent-badge";
import { Avatar } from "@/components/common/avatar";
import { RichText } from "@/components/common/rich-text";
import { useLiveRuns } from "@/hooks/use-agent-runs";
import { useDirectory } from "@/hooks/use-directory";
import { useRunProgress } from "@/hooks/use-run-progress";
import { agentById, ATLAS_ID, personOf } from "@/lib/directory";
import type { RunView } from "@/lib/agent/runs";
import type { ChatId } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Agents answering, live: a bubble appears the moment you ask ("On it"), shows what the
 * agent is doing while it works ("Checking NW-130"), then streams the reply. When the
 * saved reply arrives, the real message takes its place. One bubble per working agent.
 */
export function AtlasLive({ chatId, threadId, className }: { chatId: ChatId; threadId: string | null; className?: string }) {
  const runs = useLiveRuns(chatId, threadId);
  return (
    <>
      {runs.map((r) => (
        <LiveBubble key={r.id} run={r} className={className} />
      ))}
    </>
  );
}

function LiveBubble({ run, className }: { run: RunView; className?: string }) {
  const dir = useDirectory();
  const progress = useRunProgress(run.id);
  // A proactive check shows up only once the agent has decided to speak.
  if (run.trigger === "proactive" && !progress) return null;
  const agent = personOf(dir, run.agentId ?? ATLAS_ID);
  const draft = progress?.draft ? clean(progress.draft) : "";
  // External agents (MCP) pick work up from their inbox on their own schedule.
  const external = agentById(dir, run.agentId ?? ATLAS_ID)?.kind === "external";
  const handle = agentById(dir, run.agentId ?? ATLAS_ID)?.handle;
  const step = external
    ? run.status === "queued" ? `In @${handle}'s inbox, waiting to be picked up` : "Working on it in its own environment"
    : progress?.step ?? (run.status === "queued" ? "Getting started" : "Reading the conversation");

  return (
    <div data-testid="atlas-live" data-agent={agent.id} className={cn("flex gap-3 py-1.5", className)} aria-live="polite">
      <Avatar person={agent} size="xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-body font-semibold">{agent.name}</span>
          <AgentBadge />
          {run.trigger === "delegation" && <span className="text-xs text-muted-foreground">picked up a hand-off</span>}
        </div>
        {progress?.note && !draft && <p className="mt-0.5 text-body">{clean(progress.note)}</p>}
        {draft ? (
          <div className="mt-0.5 text-body">
            <RichText text={draft} className="inline" />
            <span aria-hidden className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse bg-foreground/60" />
          </div>
        ) : (
          <div className="mt-1 flex max-w-sm flex-col gap-1.5">
            <div className="flex items-center gap-2 text-meta text-muted-foreground">
              <Spinner />
              {!progress?.note && <span className="font-medium text-ink-2">On it</span>}
              <span className="truncate">{progress?.note ? step : `· ${step}`}</span>
            </div>
            <div aria-hidden className="agent-progress w-full" />
          </div>
        )}
      </div>
    </div>
  );
}

/** A small neutral ring spinner: the agent is working. */
function Spinner() {
  return <span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-border border-t-muted-foreground" />;
}

/** Citations ([[id]]) are resolved when the reply is saved; hide them while streaming. */
function clean(text: string) {
  return text.replace(/\s*\[\[[^\]]*\]\]?/g, "").replace(/\s*\[\[?[^\]]*$/, "").trim();
}
