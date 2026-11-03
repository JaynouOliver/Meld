"use client";

import { AgentBadge } from "@/components/common/agent-badge";
import { Avatar } from "@/components/common/avatar";
import { RichText } from "@/components/common/rich-text";
import { useAtlasRun } from "@/hooks/use-agent-runs";
import { useDirectory } from "@/hooks/use-directory";
import { useRunProgress } from "@/hooks/use-run-progress";
import { ATLAS_ID, personOf } from "@/lib/directory";
import type { ChatId } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Atlas answering, live: appears the moment you ask ("On it"), shows what Atlas is
 * doing while it works ("Checking NW-130"), then streams the reply. When the saved
 * reply arrives, the real message takes its place.
 */
export function AtlasLive({ chatId, threadId, className }: { chatId: ChatId; threadId: string | null; className?: string }) {
  const dir = useDirectory();
  const run = useAtlasRun(chatId, threadId);
  const progress = useRunProgress(run?.id ?? null);
  if (!run) return null;
  const draft = progress?.draft ? clean(progress.draft) : "";
  const step = progress?.step ?? (run.status === "queued" ? "Getting started" : "Reading the conversation");

  return (
    <div data-testid="atlas-live" className={cn("flex gap-3 py-1.5", className)} aria-live="polite">
      <Avatar person={personOf(dir, ATLAS_ID)} size="xl" className="rounded-[7px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-body font-bold">Atlas</span>
          <AgentBadge />
        </div>
        {progress?.note && !draft && <p className="mt-0.5 text-body leading-[1.55]">{clean(progress.note)}</p>}
        {draft ? (
          <div className="mt-0.5 text-body leading-[1.55]">
            <RichText text={draft} className="inline" />
            <span aria-hidden className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse bg-atlas" />
          </div>
        ) : (
          <div className={cn("mt-0.5 flex items-center gap-2 text-muted-foreground", progress?.note ? "text-meta" : "text-body")}>
            {!progress?.note && <span className="atlas-shimmer font-medium">On it</span>}
            <span className={cn("text-meta", progress?.note && "atlas-shimmer font-medium")}>
              {progress?.note ? step : `· ${step}`}
            </span>
            <Dots />
          </div>
        )}
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span aria-hidden className="flex gap-1">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 animate-bounce rounded-full bg-atlas/70" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

/** Citations ([[id]]) are resolved when the reply is saved; hide them while streaming. */
function clean(text: string) {
  return text.replace(/\s*\[\[[^\]]*\]\]?/g, "").replace(/\s*\[\[?[^\]]*$/, "").trim();
}
