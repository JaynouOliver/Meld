"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./shared";

let client: SupabaseClient | null = null;

/** The browser's Supabase client (auth session lives in cookies, shared with the server). */
export function supabaseBrowser() {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

export type OAuthProvider = "github" | "google";

export async function signInWith(provider: OAuthProvider, next: string) {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error) throw error;
}

export async function signOut() {
  await supabaseBrowser().auth.signOut().catch(() => {});
  await fetch("/auth/signout", { method: "POST" });
  // Full page load on purpose: drops every cached query from the old session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/";
}
