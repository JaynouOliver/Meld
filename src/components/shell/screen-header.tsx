"use client";

import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CHANNELS, DMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/**
 * 60px screen header. On phones, `back` adds a back button (with the unread
 * count, like a native nav bar); the sidebar replaces it on desktop.
 */
export function ScreenHeader({
  children,
  actions,
  back,
  className,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  back?: string;
  className?: string;
}) {
  const unread = useUiStore((s) => [...CHANNELS, ...DMS].reduce((a, c) => a + (s.unread[c] ?? 0), 0));
  const router = useRouter();
  // Pop history when we got here from inside the app, so Back doesn't stack /home entries.
  const goBack = (e: React.MouseEvent) => {
    if (useUiStore.getState().navDepth > 1) {
      e.preventDefault();
      router.back();
    }
  };
  return (
    <header className={cn("shrink-0 border-b bg-background pt-safe", className)}>
      <div className="flex h-14 items-center justify-between gap-3 px-3 md:h-[60px] md:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {back && (
            <Link
              href={back}
              onClick={goBack}
              className="-ml-1.5 flex h-11 min-w-11 shrink-0 items-center gap-0.5 rounded-lg pr-1 text-brand no-underline hover:text-brand md:hidden"
            >
              <ChevronLeftIcon aria-hidden className="size-7" strokeWidth={2.2} />
              <span className="sr-only">Back to Home</span>
              {unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
                  {unread}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          )}
          {children}
        </div>
        {actions}
      </div>
    </header>
  );
}
