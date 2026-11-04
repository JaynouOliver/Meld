"use client";

import { PinIcon } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { useDirectory } from "@/hooks/use-directory";
import { usePinned } from "@/hooks/use-messages";
import { personOf } from "@/lib/directory";
import { plainSnippet } from "@/lib/markdown";
import type { ChatId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/** "Pinned" in the chat header: how many messages are pinned, and a list that jumps to each. */
export function PinnedButton({ chatId }: { chatId: ChatId }) {
  const dir = useDirectory();
  const [open, setOpen] = useState(false);
  const { data: pins } = usePinned(chatId);
  const count = pins?.length ?? 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Pinned messages (${count})`}
          title="Pinned messages"
          className={cn(
            "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input px-2 text-[13px] font-medium text-ink-2 hover:bg-muted hover:text-foreground",
            !count && "max-sm:hidden",
          )}
        >
          <PinIcon className="size-3.5" />
          <span className="max-md:hidden">Pinned</span>
          <span className="tabular text-muted-foreground">{count}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 flex max-h-[min(420px,calc(100dvh-96px))] w-[360px] max-w-[calc(100vw-16px)] flex-col rounded-md border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <div className="border-b px-3 py-2.5 text-[13px] font-semibold">Pinned messages</div>
          {!count ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              Nothing pinned yet. Hover a message and choose Pin to keep it handy here.
            </p>
          ) : (
            <ul className="min-h-0 overflow-y-auto p-1">
              {pins!.map((h) => {
                const p = personOf(dir, h.who);
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        useUiStore.setState({ focus: { chatId, threadId: h.threadId, id: h.id }, ticketId: null });
                      }}
                      className="flex w-full cursor-pointer gap-2.5 rounded-sm px-2 py-2 text-left hover:bg-accent"
                    >
                      <Avatar person={p} size="md" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] font-semibold">{p.name}</span>
                          <span className="shrink-0 text-[12px] text-muted-foreground">{h.time}</span>
                          {h.threadId && <span className="shrink-0 text-[12px] text-muted-foreground">in thread</span>}
                        </span>
                        <span className="line-clamp-2 text-[13px] text-ink-2">{plainSnippet(h.text)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
