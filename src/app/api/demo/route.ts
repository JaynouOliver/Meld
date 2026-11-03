import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { DEV_AUTH, DEV_COOKIE } from "@/lib/auth/shared";
import { uid } from "@/lib/format";
import { usingSupabase } from "@/lib/store";
import { createSandbox, SANDBOX_USER_NAME } from "@/server/sandbox";
import { ACTIVE_WS_COOKIE, registry } from "@/server/workspace";

/**
 * "Try the live demo": a throwaway account plus a private copy of a seeded company, so
 * anyone can try Meld's agents in seconds without signing up. The browser then signs in
 * with the returned credentials (or, in local dev, gets the dev cookie).
 */
export const maxDuration = 60;

// Each demo can spend model credits: a few per visitor per hour.
const recent = new Map<string, number[]>();
const LIMIT = 5;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= LIMIT) return Response.json({ error: "Too many demos from here. Try again in an hour, or sign up." }, { status: 429 });
  recent.set(ip, [...hits, now]);

  const first = SANDBOX_USER_NAME.split(" ")[0];
  const jar = await cookies();
  try {
    let id: string;
    let credentials: { email: string; password: string } | null = null;
    if (usingSupabase() && !DEV_AUTH) {
      const { sb } = await import("@/lib/store/supabase");
      const email = `demo-${uid().slice(1)}@demo.meld-app.dev`;
      const password = randomBytes(18).toString("base64url");
      const r = await sb().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: SANDBOX_USER_NAME, demo: true } });
      if (r.error || !r.data.user) throw new Error(r.error?.message ?? "Couldn't create a demo account");
      id = r.data.user.id;
      credentials = { email, password };
    } else {
      id = `dev-demo-${uid().slice(1)}`;
      jar.set(DEV_COOKIE, encodeURIComponent(JSON.stringify({ id, name: SANDBOX_USER_NAME, email: null })), { path: "/", httpOnly: true, sameSite: "lax" });
    }
    await (await registry()).upsertProfile({ id, name: SANDBOX_USER_NAME, email: credentials?.email ?? null, avatarUrl: null });
    const sandbox = await createSandbox({ id, first });
    jar.set(ACTIVE_WS_COOKIE, sandbox.workspaceId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
    return Response.json({ credentials, next: `/chat/${sandbox.home}` });
  } catch (e) {
    console.error("[demo] failed:", e);
    return Response.json({ error: "Couldn't set up the demo. Please try again." }, { status: 500 });
  }
}
