import { cn } from "@/lib/utils";

/** Meld wordmark: two overlapping squares (people + agent, melded). */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span aria-hidden className="relative inline-block size-6">
        <span className="absolute top-0 left-0 size-4 rounded-[5px] bg-brand" />
        <span className="absolute right-0 bottom-0 size-4 rounded-[5px] bg-atlas/85 mix-blend-multiply dark:mix-blend-screen" />
      </span>
      Meld
    </span>
  );
}
