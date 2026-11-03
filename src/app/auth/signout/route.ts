import { cookies } from "next/headers";

import { DEV_COOKIE } from "@/lib/auth/shared";
import { supabaseServer } from "@/server/auth";

/** Clear the session cookies (Supabase and the dev cookie). */
export async function POST() {
  const jar = await cookies();
  jar.delete(DEV_COOKIE);
  const sb = await supabaseServer();
  await sb.auth.signOut().catch(() => {});
  return Response.json({ ok: true });
}
