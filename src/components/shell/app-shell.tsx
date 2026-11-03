"use client";

import { LoaderCircleIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useUiStore } from "@/stores/ui-store";
import { TicketPanel } from "@/components/ticket-panel/ticket-panel";
import { Button } from "@/components/ui/button";
import { useAgentRunsSync } from "@/hooks/use-agent-runs";
import { useDirectoryQuery } from "@/hooks/use-directory";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useSheetHistory } from "@/hooks/use-sheet-history";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";

/**
 * Loads the workspace directory before any screen renders (screens read it through
 * useDirectory). People without a workspace yet go to onboarding.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useDirectoryQuery();
  const noWorkspace = data === null;
  useEffect(() => {
    if (noWorkspace) router.replace("/onboarding");
  }, [noWorkspace, router]);

  if (isError && !data) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-sm text-muted-foreground">
        <p>Couldn&apos;t load your workspace.</p>
        <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
          Try again
        </Button>
      </div>
    );
  }
  if (isPending || !data) {
    return (
      <div className="flex h-dvh w-full items-center justify-center gap-2 bg-background text-sm text-muted-foreground" role="status">
        <LoaderCircleIcon className="size-4 animate-spin" />
        Loading your workspace…
      </div>
    );
  }
  return <Shell>{children}</Shell>;
}

/**
 * Workspace frame.
 * Desktop: sidebar | screen (main + optional thread) | ticket panel.
 * Phone (< md): full-width screens, a bottom tab bar on top-level screens,
 * and thread/ticket panels as full-screen sheets.
 */
function Shell({ children }: { children: React.ReactNode }) {
  useSheetHistory();
  useRealtimeSync();
  useAgentRunsSync();
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
