/** Auth bits shared by the proxy, route handlers and the browser. */

export interface SessionUser {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
}

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Local testing without OAuth: AUTH_MODE=dev enables /auth/dev, which signs you in as a
 * named test user via a plain cookie. Never set on Vercel.
 */
export const DEV_AUTH = process.env.AUTH_MODE === "dev";
export const DEV_COOKIE = "meld_dev_user";

/** Pages that need a signed-in user. */
export const APP_PATHS = ["/home", "/chat", "/tickets", "/me", "/onboarding"];
export const isAppPath = (path: string) => APP_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

/** Only same-site paths after sign-in (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/home") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function devUserFromCookie(value: string | undefined): SessionUser | null {
  if (!DEV_AUTH || !value) return null;
  try {
    const u = JSON.parse(decodeURIComponent(value)) as Partial<SessionUser>;
    return u.id && u.name ? { id: u.id, name: u.name, email: u.email ?? null, avatarUrl: null } : null;
  } catch {
    return null;
  }
}

/** Supabase user → our user (GitHub and Google name their fields differently). */
export function toSessionUser(u: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): SessionUser {
  const m = u.user_metadata ?? {};
  const name = (m.full_name || m.name || m.user_name || m.preferred_username || u.email?.split("@")[0] || "New user") as string;
  return { id: u.id, email: u.email ?? null, name, avatarUrl: (m.avatar_url || m.picture || null) as string | null };
}
