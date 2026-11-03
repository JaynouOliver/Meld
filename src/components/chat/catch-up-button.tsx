"use client";

import { HistoryIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { useDirectory } from "@/hooks/use-directory";
import { useSendMessage } from "@/hooks/use-messages";
import { atlasDmOf } from "@/lib/directory";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/** Ask Atlas "What did I miss?" in my Atlas DM (and go there). */
export function CatchUpButton({ className, compact }: { className?: string; compact?: boolean }) {
  const dir = useDirectory();
  const router = useRouter();
  const send = useSendMessage();
  const dm = atlasDmOf(dir);
  if (!dm) return null;
  const ask = () => {
    send.mutate({ chatId: dm, text: "What did I miss?" });
    useUiStore.setState((s) => ({ sentTick: s.sentTick + 1 }));
    router.push(`/chat/${dm}`);
  };
  return (
    <button
      type="button"
      onClick={ask}
      disabled={send.isPending}
      title="Ask Atlas to catch you up"
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-meta font-semibold text-ink-2 hover:bg-muted disabled:opacity-60",
        compact ? "h-9" : "h-10",
        className,
      )}
    >
      <HistoryIcon className="size-4 text-atlas" />
      What did I miss?
    </button>
  );
}
