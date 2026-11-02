// The single-file preview runs fully in the browser with in-memory data:
// no Supabase. This stub keeps supabase-js out of the bundle.
export function createClient(): never {
  throw new Error("Supabase isn't available in the preview build");
}
export type SupabaseClient = never;
