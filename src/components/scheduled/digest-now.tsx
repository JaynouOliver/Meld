"use client";

import { HashIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { useDirectory } from "@/hooks/use-directory";
import { usePostDigest } from "@/hooks/use-scheduled";
import { agentById } from "@/lib/directory";
import { DIGEST_HOUR, isStandupAgent } from "@/lib/scheduled";

const REMOTE = process.env.NEXT_PUBLIC_DATA_MODE !== "local";

/**
 * On a standup agent's profile (Sunny): when the daily digest goes out, and a button per
 * channel to post today's now. Renders nothing for other agents and people.
 */
export function DigestNow({ agentId, onPosted }: { agentId: string; onPosted: (chatId: string) => void }) {
  const dir = useDirectory();
  const post = usePostDigest();
  const [busy, setBusy] = useState<string | null>(null);
  const agent = agentById(dir, agentId);
  if (!REMOTE || !agent || !isStandupAgent(agent)) return null;
  const channels = dir.channels.filter((c) => {
    const m = dir.chats[c];
    return m?.kind === "channel" && m.agents?.some((a) => a.id === agentId);
  });
  if (!channels.length) return null;
  const label = (c: string) => {
    const m = dir.chats[c];
    return m?.kind === "channel" ? m.label : c;
  };

  return (
    <div className="mt-5">
      <h3 className="mb-1 text-[12px] font-medium text-muted-foreground">Daily digest</h3>
      <p className="mb-2 text-[13px] text-ink-2">
        Posts each workday after {DIGEST_HOUR}:00 in {channels.map((c) => `#${label(c)}`).join(" and ")}: shipped, in progress, blocked, due and who looks overloaded.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {channels.map((c) => (
          <button
            key={c}
            type="button"
            disabled={!!busy}
            onClick={() => {
              setBusy(c);
              post.mutate(c, { onSuccess: () => onPosted(c), onSettled: () => setBusy(null) });
            }}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-card px-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-subtle hover:bg-accent active:scale-[0.97] disabled:opacity-60"
          >
            {busy === c ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <HashIcon className="size-3.5 text-muted-foreground" />}
            Post digest now in {label(c)}
          </button>
        ))}
      </div>
      {post.isError && <p className="mt-2 text-[12px] text-destructive">Couldn&apos;t post the digest. Try again.</p>}
    </div>
  );
}
