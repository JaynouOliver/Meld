"use client";

import { ChevronLeftIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";

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
  const docked = useMediaQuery("(min-width: 1280px)");
  const ref = useRef<HTMLDivElement>(null);

  // As an overlay it behaves like a dialog: focus moves in, Esc closes, focus returns after.
  useEffect(() => {
    if (docked) return;
    const opener = document.activeElement as HTMLElement | null;
    // Respect a child that already took focus (e.g. the title of a new ticket).
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // Inner controls (inline reply, mention popover) claim Esc via preventDefault.
      if (e.key === "Escape") return e.defaultPrevented ? undefined : onClose();
      if (e.key !== "Tab" || !ref.current) return;
      // Keep keyboard focus inside the dialog.
      const items = [...ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!ref.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [docked, onClose]);

  return (
    <>
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-30 hidden bg-black/40 sm:block xl:hidden" />
      <div
        ref={ref}
        aria-label={label}
        role={docked ? "complementary" : "dialog"}
        aria-modal={docked ? undefined : true}
        tabIndex={-1}
        className={cn(
          "outline-none",
          "fixed inset-0 z-40 flex w-full min-w-0 flex-col bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] animate-in slide-in-from-right-8 duration-200 motion-reduce:animate-none",
          "sm:left-auto sm:border-l sm:shadow-xl",
          "sm:pl-0 xl:static xl:z-auto xl:pr-0 xl:shadow-none xl:animate-none",
          width === "thread" ? "sm:w-[380px] xl:w-[380px] xl:shrink-0" : "sm:w-[420px] xl:w-[420px] xl:shrink-0",
        )}
      >
        {children}
      </div>
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
      <div className="flex h-14 items-center justify-between gap-2 pr-2 pl-1.5 sm:pr-3 sm:pl-5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-brand sm:hidden"
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
            className="hidden size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:flex"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
