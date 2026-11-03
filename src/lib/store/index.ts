import { currentCtx } from "../context";
import { memoryStore } from "./memory";
import type { Store } from "./types";

export type { Store } from "./types";

/** True when the server should use Supabase (configured, and not forced to memory). */
export function usingSupabase() {
  return (
    typeof window === "undefined" &&
    process.env.DATA_STORE !== "memory" &&
    !!process.env.SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** The current workspace's store (see src/lib/context.ts). */
export async function getStore(): Promise<Store> {
  return currentCtx().store;
}

/** A store for a given workspace: Supabase on the server when configured, memory otherwise. */
export async function storeFor(ws: { id: string; ticketPrefix: string }): Promise<Store> {
  if (usingSupabase()) return (await import("./supabase")).supabaseStore(ws.id);
  return memoryStore(ws.id, ws.ticketPrefix);
}
