import { memoryStore } from "./memory";
import type { Store } from "./types";

export type { Store } from "./types";

/**
 * Supabase on the server when it's configured (and not overridden with
 * DATA_STORE=memory, which the evals use); memory everywhere else.
 */
export async function getStore(): Promise<Store> {
  if (
    typeof window === "undefined" &&
    process.env.DATA_STORE !== "memory" &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return (await import("./supabase")).supabaseStore;
  }
  return memoryStore;
}
