"use client";

import { useQuery } from "@tanstack/react-query";

import * as api from "@/lib/api";
import type { Directory } from "@/lib/directory";
import { clampRole, viewerOf, type Viewer } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { queryKeys } from "./query-keys";

/** The workspace directory query (people, channels, teams, my role). */
export function useDirectoryQuery() {
  return useQuery({ queryKey: queryKeys.directory, queryFn: () => api.getDirectory(), staleTime: 60_000 });
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
