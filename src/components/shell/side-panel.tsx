"use client";

import { cn } from "@/lib/utils";

/**
 * Right-hand panel (thread, ticket). Docked at xl and up; an overlay with a
 * backdrop below that so it works on tablets and phones.
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
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-30 bg-black/30 xl:hidden" />
      <aside
        aria-label={label}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-full min-w-0 flex-col border-l bg-background shadow-xl animate-in slide-in-from-right-8 duration-200",
          "xl:static xl:z-auto xl:shadow-none xl:animate-none",
          width === "thread" ? "sm:w-[380px] xl:w-[380px] xl:shrink-0" : "sm:w-[420px] xl:w-[420px] xl:shrink-0",
        )}
      >
        {children}
      </aside>
    </>
  );
}
