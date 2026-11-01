"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TicketPanel } from "@/components/ticket-panel/ticket-panel";
import { useUiStore } from "@/stores/ui-store";
import { Sidebar } from "./sidebar";

/**
 * Workspace frame: sidebar | screen (main + optional thread) | ticket panel.
 * Below md the sidebar becomes a drawer; below xl side panels overlay the screen.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <div className="flex h-dvh min-h-[560px] w-full overflow-hidden bg-background">
      <aside className="hidden w-[248px] shrink-0 md:flex">
        <Sidebar />
      </aside>
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" showClose={false} className="w-[280px] border-none p-0 md:hidden">
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">Channels, direct messages and tickets</SheetDescription>
          <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1">{children}</div>
      <TicketPanel />
    </div>
  );
}
