import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

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
 * a verified Supabase session (cookie from the browser, or `Authorization: Bearer
 * <access token>` from the Mac app), or the dev cookie when AUTH_MODE=dev.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const dev = devUserFromCookie(jar.get(DEV_COOKIE)?.value);
  if (dev) return dev;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const bearer = (await headers()).get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  // getClaims verifies the session JWT locally (signing keys are cached), so most
  // requests skip a round trip to the Auth server; it falls back to getUser if needed.
  // A malformed token makes getClaims throw instead of returning an error: treat it as signed out.
  const { data } = bearer
    ? await bearerClient().auth.getClaims(bearer).catch(() => ({ data: null }))
    : await (await supabaseServer()).auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  return toSessionUser({ id: c.sub, email: (c.email as string | undefined) ?? null, user_metadata: (c.user_metadata as Record<string, unknown>) ?? {} });
}

let bearerSb: ReturnType<typeof createClient> | null = null;
/** A stateless client for verifying access tokens sent as a Bearer header. */
function bearerClient() {
  bearerSb ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return bearerSb;
}
