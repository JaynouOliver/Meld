"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useDirectory } from "./use-directory";

export type TicketLayout = "table" | "board";

const listeners = new Set<() => void>();
const keyFor = (me: string) => `meld-ticket-layout:${me}`;
/** This visit's choice, used when storage is unavailable (private mode, blocked site data). */
let memo: TicketLayout = "table";

function read(me: string): TicketLayout {
  try {
    const v = window.localStorage.getItem(keyFor(me));
    return v === "board" || v === "table" ? v : memo;
  } catch {
    return memo;
  }
}

/** Table or board on the tickets screen, remembered per person on this device. */
export function useTicketLayout() {
  const me = useDirectory().me;
  const layout = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(me),
    // The server (and hydration) always renders the table; the saved choice applies right after.
    () => "table" as TicketLayout,
  );
  const setLayout = useCallback(
    (next: TicketLayout) => {
      memo = next;
      try {
        window.localStorage.setItem(keyFor(me), next);
      } catch {
        // Not saved across visits; the in-memory choice still applies.
      }
      listeners.forEach((l) => l());
    },
    [me],
  );
  return [layout, setLayout] as const;
}
