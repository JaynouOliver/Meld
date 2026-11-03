import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { DEV_COOKIE, devUserFromCookie, SUPABASE_ANON_KEY, SUPABASE_URL, toSessionUser, type SessionUser } from "@/lib/auth/shared";

/** Supabase client bound to this request's auth cookies (route handlers). */
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Called from a context that can't set cookies; the proxy refreshes them instead.
        }
      },
    },
  });
}

/**
 * Who is making this request. The single place the server learns identity:
 * a verified Supabase session, or the dev cookie when AUTH_MODE=dev.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const dev = devUserFromCookie(jar.get(DEV_COOKIE)?.value);
  if (dev) return dev;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const sb = await supabaseServer();
  // getClaims verifies the session JWT locally (signing keys are cached), so most
  // requests skip a round trip to the Auth server; it falls back to getUser if needed.
  const { data } = await sb.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  return toSessionUser({ id: c.sub, email: (c.email as string | undefined) ?? null, user_metadata: (c.user_metadata as Record<string, unknown>) ?? {} });
}
