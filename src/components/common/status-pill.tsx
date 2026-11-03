import { STATUS_COLORS } from "@/lib/constants";
import type { TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Status label with a leading dot. The text carries the meaning; the color helps scanning. */
export function StatusPill({ status, bordered, className }: { status: TicketStatus; bordered?: boolean; className?: string }) {
  const [bg, fg, line, dot] = STATUS_COLORS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-px text-xs font-medium",
        bordered && "border",
        status === "Backburner" && bordered && "border-dashed",
        className,
      )}
      style={{ background: bg, color: fg, borderColor: bordered ? line : undefined }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: dot }} />
      {status}
    </span>
  );
}
