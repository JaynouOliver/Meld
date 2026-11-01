import { STATUS_COLORS } from "@/lib/constants";
import type { TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusPill({ status, bordered, className }: { status: TicketStatus; bordered?: boolean; className?: string }) {
  const [bg, fg, line] = STATUS_COLORS[status];
  return (
    <span
      className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", bordered && "border", className)}
      style={{ background: bg, color: fg, borderColor: bordered ? line : undefined }}
    >
      {status}
    </span>
  );
}
