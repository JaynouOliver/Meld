import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

const SIZES = {
  xs: "size-5 text-[8px] rounded-full",
  sm: "size-[22px] text-[9px] rounded-[5px]",
  md: "size-7 text-2xs rounded-[7px]",
  lg: "size-8 text-xs rounded-lg",
  xl: "size-9 text-meta rounded-lg",
} as const;

/** Square, initials-based avatar from the design. Colors are per-person identity colors. */
export function Avatar({
  person,
  size = "xl",
  presence,
  ringClassName = "border-sidebar",
  className,
}: {
  person: Pick<Person, "initials" | "color">;
  size?: keyof typeof SIZES;
  presence?: boolean;
  ringClassName?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ background: person.color }}
      className={cn("relative inline-flex shrink-0 items-center justify-center font-bold text-white", SIZES[size], className)}
    >
      {person.initials}
      {presence && (
        <span className={cn("absolute -right-[3px] -bottom-[3px] size-[9px] rounded-full border-2 bg-online", ringClassName)} />
      )}
    </span>
  );
}
