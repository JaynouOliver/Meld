import { cn } from "@/lib/utils";

/** Meld wordmark: a solid monogram tile in the brand color, then the name. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-base font-semibold tracking-[-0.01em] text-foreground", className)}>
      <svg aria-hidden viewBox="0 0 20 20" className="size-[1.25em] shrink-0">
        <rect width="20" height="20" rx="4" fill="var(--brand)" />
        <path d="M5.5 14.5v-9l4.5 5 4.5-5v9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />
      </svg>
      Meld
    </span>
  );
}
