"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useUiStore } from "@/stores/ui-store";

const DOCKED = "(min-width: 1280px)";

/**
 * On phones and tablets, threads and tickets open as sheets over the screen.
 * This gives each open sheet a history entry, so the browser / Android back
 * gesture closes the sheet instead of leaving the page. Docked panels (xl+)
 * are part of the page and are left alone.
 */
export function useSheetHistory() {
  const pathname = usePathname();
  const ticketId = useUiStore((s) => s.ticketId);
  const threadId = useUiStore((s) => s.threadId);
  const sheetOpen = !!ticketId || (!!threadId && pathname.startsWith("/chat/"));
  const pushed = useRef(false);

  // Back pressed while a sheet entry is on top: close the top-most sheet.
  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) {
        // Forward landed on an entry for a sheet that's already closed: skip it.
        if (history.state?.meldSheet) history.back();
        return;
      }
      pushed.current = false;
      const s = useUiStore.getState();
      if (s.ticketId) s.closeTicket();
      else s.closeThread();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (window.matchMedia(DOCKED).matches) return;
    if (sheetOpen && !pushed.current) {
      // Deferred so React StrictMode's mount/unmount/mount doesn't push twice.
      const t = setTimeout(() => {
        try {
          history.pushState({ ...history.state, meldSheet: true }, "");
          pushed.current = true;
        } catch {
          /* sandboxed previews may refuse history writes */
        }
      }, 0);
      return () => clearTimeout(t);
    }
    if (!sheetOpen && pushed.current) {
      pushed.current = false;
      // Closed from the UI: drop our entry, unless a navigation already replaced it.
      if (history.state?.meldSheet) history.back();
    }
  }, [sheetOpen, ticketId, threadId]);
}
