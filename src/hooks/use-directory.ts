"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api";
import type { Directory } from "@/lib/directory";
import { clampRole, viewerOf, type Viewer } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { queryKeys } from "./query-keys";

let booted = false;

/**
 * The first load boots the whole app in one round trip (like Slack's boot payload):
 * directory, tickets, this week's activity and every chat's messages go straight into
 * the cache, so opening any chat afterwards is instant. Later refreshes fetch just the
 * directory.
 */
async function loadDirectory(qc: QueryClient): Promise<Directory | null> {
  const prev = qc.getQueryData<Directory | null>(queryKeys.directory);
  const other = (d: Directory | null) => !!d && !!prev && (prev.workspace.id !== d.workspace.id || prev.me !== d.me);
  if (booted) {
    const dir = await api.getDirectory();
    if (!other(dir)) return dir;
  }
  const boot = await api.getBoot();
  booted = true;
  // Cached data from another workspace or person (switched, or saved in this browser): drop it.
  if (other(boot.directory)) qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "directory" });
  if (boot.tickets) qc.setQueryData(queryKeys.tickets, boot.tickets);
  if (boot.week) qc.setQueryData(queryKeys.week, boot.week);
  for (const [chat, list] of Object.entries(boot.messages ?? {})) qc.setQueryData(queryKeys.messages(chat), list);
  return boot.directory;
}

/** The workspace directory query (people, channels, teams, my role). */
export function useDirectoryQuery() {
  const qc = useQueryClient();
  // Until this tab has booted, saved data is shown but always refreshed.
  return useQuery({ queryKey: queryKeys.directory, queryFn: () => loadDirectory(qc), staleTime: booted ? 60_000 : 0 });
}

/**
 * The signed-in person's workspace. The app shell renders screens only once this has
 * loaded (and sends people without a workspace to onboarding), so inside the app it's
 * always there.
 */
export function useDirectory(): Directory {
  const { data } = useDirectoryQuery();
  if (!data) throw new Error("useDirectory() used before the workspace loaded (render inside AppShell)");
  return data;
}

/** The role the UI acts as: the "view as" choice, never above the real role. */
export function useRole(): Role {
  const dir = useDirectory();
  const requested = useUiStore((s) => s.role);
  return clampRole(requested, dir.role);
}

/** Role + identity for the ticket permission checks in src/lib/rbac.ts. */
export function useViewer(): Viewer {
  return viewerOf(useDirectory(), useRole());
}
