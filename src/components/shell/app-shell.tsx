"use client";

import { TicketPanel } from "@/components/ticket-panel/ticket-panel";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";

/**
 * Workspace frame.
 * Desktop: sidebar | screen (main + optional thread) | ticket panel.
 * Phone (< md): full-width screens, a bottom tab bar on top-level screens,
 * and thread/ticket panels as full-screen sheets.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background md:min-h-[560px] md:flex-row">
      <aside className="hidden w-[248px] shrink-0 md:flex">
        <Sidebar />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
      <TabBar />
      <TicketPanel />
    </div>
  );
}
