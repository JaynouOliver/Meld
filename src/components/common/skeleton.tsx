import { cn } from "@/lib/utils";

/** A placeholder block with the shape of what's loading (see .skeleton in globals.css). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/** Card-shaped placeholders for lists (missions, decisions). */
export function CardSkeletons({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-md border bg-card p-4">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-2.5 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-3 w-24 self-center" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Row placeholders for tables (tickets). */
export function RowSkeletons({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className={cn("h-3.5", ["w-2/5", "w-1/3", "w-1/2", "w-2/5"][i % 4])} />
          <Skeleton className="ml-auto h-5 w-20 rounded-full" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** The whole app's frame while the workspace loads for the first time. */
export function AppSkeleton() {
  return (
    <div role="status" aria-label="Loading your workspace" className="flex h-dvh w-full bg-background">
      <div className="hidden w-[248px] shrink-0 flex-col gap-2 border-r bg-sidebar p-3 md:flex">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-3 h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="mt-4 h-3 w-16" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
        <Skeleton className="mt-4 h-3 w-16" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-5">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-1 flex-col gap-5 px-5 py-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 shrink-0 rounded-[6px]" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className={cn("mt-2 h-3.5", ["w-3/4", "w-1/2", "w-2/3"][i % 3])} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
