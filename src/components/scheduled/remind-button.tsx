"use client";

import { AlarmClockIcon, CheckIcon, ChevronLeftIcon, LoaderCircleIcon } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useDirectory } from "@/hooks/use-directory";
import { useCreateReminder } from "@/hooks/use-scheduled";
import { personOf } from "@/lib/directory";
import { presetTime, REMIND_PRESETS } from "@/lib/scheduled";
import type { ChatId, Message, ReplyNode } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";

const REMOTE = process.env.NEXT_PUBLIC_DATA_MODE !== "local";
const ITEM = "flex h-8 w-full cursor-pointer items-center rounded-sm px-2 text-left text-[13px] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/**
 * "Remind me about this" on the message hover toolbar: a few quick times or a custom
 * one. Atlas posts the reminder in my DM with a link back to the message.
 */
export function RemindButton({ chatId, node, className }: { chatId: ChatId; node: Message | ReplyNode; className: string }) {
  const dir = useDirectory();
  const create = useCreateReminder();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (!REMOTE) return null;
  // Replies live in the thread that's open (threads are flat).
  const threadId = "replies" in node ? null : useUiStore.getState().threadId;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const set = (due: Date) => {
    const author = node.who === dir.me ? "your message" : `${personOf(dir, node.who).first}'s message`;
    const snippet = node.text.replace(/\s+/g, " ").trim();
    const text = `${author}: "${snippet.length > 140 ? `${snippet.slice(0, 137)}…` : snippet}"`;
    create.mutate(
      { when: due.toISOString(), text, target: "me", source: { chatId, threadId, messageId: node.id }, timeZone: tz },
      {
        onSuccess: (r) => {
          setDone(r.when);
          setTimeout(() => setOpen(false), 1400);
        },
      },
    );
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setCustom(null);
          setDone(null);
          create.reset();
        }
      }}
    >
      <Popover.Trigger asChild>
        <button type="button" aria-label="Remind me about this" title="Remind me about this" className={className}>
          <AlarmClockIcon className="size-4" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          aria-label="Remind me about this"
          onClick={(e) => e.stopPropagation()}
          className="z-50 w-60 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          {done ? (
            <p role="status" className="flex items-start gap-2 px-2 py-1.5 text-[13px]">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" />
              <span>
                Reminder set for <span className="font-medium">{done}</span>. Atlas will message you.
              </span>
            </p>
          ) : custom !== null ? (
            <form
              className="flex flex-col gap-2 p-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const due = new Date(custom);
                if (!Number.isNaN(due.getTime())) set(due);
              }}
            >
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Back" onClick={() => setCustom(null)} className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent">
                  <ChevronLeftIcon className="size-4" />
                </button>
                <label htmlFor={`remind-${node.id}`} className="text-[13px] font-medium">
                  Custom time
                </label>
              </div>
              <input
                id={`remind-${node.id}`}
                type="datetime-local"
                value={custom}
                min={localInput(new Date())}
                onChange={(e) => setCustom(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <Button type="submit" size="sm" disabled={!custom || create.isPending}>
                {create.isPending && <LoaderCircleIcon className="animate-spin" />}
                Set reminder
              </Button>
            </form>
          ) : (
            <div role="menu" className="flex flex-col">
              <p className="px-2 pt-1 pb-1.5 text-[12px] font-medium text-muted-foreground">Remind me about this</p>
              {REMIND_PRESETS.map((p) => (
                <button key={p.key} type="button" role="menuitem" disabled={create.isPending} onClick={() => set(presetTime(p.key, tz))} className={ITEM}>
                  {p.label}
                </button>
              ))}
              <button type="button" role="menuitem" onClick={() => setCustom(localInput(presetTime("1h", tz)))} className={ITEM}>
                Custom…
              </button>
            </div>
          )}
          {create.isError && <p className="px-2 pb-1.5 text-[12px] text-destructive">{(create.error as Error).message}</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
