import { SignalHighIcon, SignalLowIcon, SignalMediumIcon } from "lucide-react";

import { PRIORITY_COLOR } from "@/lib/constants";
import type { Priority } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON = { High: SignalHighIcon, Medium: SignalMediumIcon, Low: SignalLowIcon } as const;

/** Priority as shape + label + color, so it never relies on color alone (WCAG 1.4.1). */
export function PriorityLabel({ priority, className, iconOnly }: { priority: Priority; className?: string; iconOnly?: boolean }) {
  const Icon = ICON[priority];
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold", className)} style={{ color: PRIORITY_COLOR[priority] }}>
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.4} />
      <span className={iconOnly ? "sr-only" : undefined}>{priority}</span>
    </span>
  );
}
