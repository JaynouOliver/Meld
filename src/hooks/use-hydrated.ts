"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False during server rendering and hydration, true afterwards.
 *
 * Pages stream in pieces, so a later piece can hydrate after a query (started by an
 * earlier piece, like the sidebar) has already resolved. Rendering that data during
 * hydration would differ from the server HTML and throw React error #418. Gate
 * query data behind this so hydration always matches, then data appears right after.
 */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}
