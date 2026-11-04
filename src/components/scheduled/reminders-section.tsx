"use client";

import { AlarmClockIcon, HashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDirectory } from "@/hooks/use-directory";
import { useCancelReminder, useReminders } from "@/hooks/use-scheduled";
import { personOf } from "@/lib/directory";
import { formatWhen } from "@/lib/scheduled";

const REMOTE = process.env.NEXT_PUBLIC_DATA_MODE !== "local";

/** The You screen's upcoming reminders (set by me or for me), soonest first, with Cancel. */
export function RemindersSection() {
  const dir = useDirectory();
  const { data, isPending } = useReminders();
  const cancel = useCancelReminder();
  if (!REMOTE) return null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const list = data ?? [];

  return (
    <section aria-labelledby="reminders-title" className="flex flex-col gap-2">
      <h2 id="reminders-title" className="pb-2 text-xs font-medium text-muted-foreground">
        Reminders
      </h2>
      <div className="overflow-hidden rounded-md border bg-card">
        {isPending && <p className="px-3.5 py-3 text-[13px] text-muted-foreground">Loading…</p>}
        {!isPending && !list.length && (
          <p className="px-3.5 py-3 text-[13px] text-muted-foreground">
            No upcoming reminders. Ask Atlas: &ldquo;@atlas remind me tomorrow at 9 to send the deck&rdquo;, or use the clock on any message.
          </p>
        )}
        {list.map((r) => {
          const toChannel = r.target.kind === "channel";
          const meta = toChannel ? dir.chats[r.target.id] : null;
          const where = toChannel ? `#${meta?.kind === "channel" ? meta.label : "channel"}` : r.target.id === dir.me ? "you" : personOf(dir, r.target.id).first;
          const from = r.createdBy === dir.me ? null : personOf(dir, r.createdBy).first;
          return (
            <div key={r.id} className="flex min-h-12 items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
              {toChannel ? <HashIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <AlarmClockIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-medium" title={r.text}>
                  {r.text.charAt(0).toUpperCase() + r.text.slice(1)}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {formatWhen(r.dueAt, zone)} · for {where}
                  {from ? ` · from ${from}` : ""}
                </span>
              </span>
              {r.canCancel && (
                <Button variant="outline" size="sm" aria-label={`Cancel reminder: ${r.text}`} disabled={cancel.isPending && cancel.variables === r.id} onClick={() => cancel.mutate(r.id)}>
                  Cancel
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
