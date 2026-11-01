"use client";

import { ChevronLeftIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Right-hand panel (thread, ticket). Docked at xl and up; an overlay with a
 * backdrop on tablets; a full-screen sheet on phones.
 */
export function SidePanel({
  label,
  width,
  onClose,
  children,
}: {
  label: string;
  width: "thread" | "ticket";
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-30 hidden bg-black/30 sm:block xl:hidden" />
      <aside
        aria-label={label}
        className={cn(
          "fixed inset-0 z-40 flex w-full min-w-0 flex-col bg-background animate-in slide-in-from-right-8 duration-200",
          "sm:left-auto sm:border-l sm:shadow-xl",
          "xl:static xl:z-auto xl:shadow-none xl:animate-none",
          width === "thread" ? "sm:w-[380px] xl:w-[380px] xl:shrink-0" : "sm:w-[420px] xl:w-[420px] xl:shrink-0",
        )}
      >
        {children}
      </aside>
    </>
  );
}

/** Panel header: back arrow on phones, close (✕) from sm up. */
export function PanelHeader({
  children,
  actions,
  onClose,
  closeLabel,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <header className="shrink-0 border-b pt-safe">
      <div className="flex h-14 items-center justify-between gap-2 pr-2 pl-1.5 sm:h-[60px] sm:pr-3 sm:pl-5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-brand sm:hidden"
          >
            <ChevronLeftIcon className="size-7" strokeWidth={2.2} />
          </button>
          {children}
        </div>
        <div className="flex shrink-0 gap-0.5">
          {actions}
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="hidden size-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent sm:flex"
          >
            <XIcon className="size-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
