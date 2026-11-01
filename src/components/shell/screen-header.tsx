"use client";

import { MenuIcon } from "lucide-react";

import { useUiStore } from "@/stores/ui-store";

/** 60px screen header with a nav-drawer button on small screens. */
export function ScreenHeader({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
          className="-ml-1 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent md:hidden"
        >
          <MenuIcon className="size-5" />
        </button>
        {children}
      </div>
      {actions}
    </header>
  );
}
