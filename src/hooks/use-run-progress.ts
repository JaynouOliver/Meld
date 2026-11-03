"use client";

import { useSyncExternalStore } from "react";

/**
 * Live progress of Atlas runs, pushed over realtime (or read from polling): the current
 * step and the reply as it streams. Kept outside React Query so a stream of updates
 * doesn't churn the runs cache.
 */
export interface LiveProgress {
  step: string | null;
  draft: string | null;
  note?: string | null;
}

const live = new Map<string, LiveProgress>();
const listeners = new Set<() => void>();

export function setRunProgress(runId: string, p: LiveProgress) {
  const cur = live.get(runId);
  if (cur && cur.step === p.step && cur.draft === p.draft && cur.note === p.note) return;
  live.set(runId, p);
  for (const l of listeners) l();
}

export function useRunProgress(runId: string | null): LiveProgress | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (runId ? (live.get(runId) ?? null) : null),
    () => null,
  );
}
