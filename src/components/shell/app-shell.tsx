"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useUiStore } from "@/stores/ui-store";
import { TicketPanel } from "@/components/ticket-panel/ticket-panel";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useSheetHistory } from "@/hooks/use-sheet-history";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";

/**
 * Workspace frame.
 * Desktop: sidebar | screen (main + optional thread) | ticket panel.
 * Phone (< md): full-width screens, a bottom tab bar on top-level screens,
 * and thread/ticket panels as full-screen sheets.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  useSheetHistory();
  useRealtimeSync();
  const pathname = usePathname();
  useEffect(() => {
    useUiStore.setState((s) => ({ navDepth: s.navDepth + 1 }));
  }, [pathname]);
  return (
    // Side safe-area padding keeps content clear of the notch in landscape.
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] md:flex-row">
      <aside className="hidden w-[248px] shrink-0 md:flex">
        <Sidebar />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
      <TabBar />
      <TicketPanel />
    </div>
  );
}
