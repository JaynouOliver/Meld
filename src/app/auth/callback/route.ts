import { NextResponse } from "next/server";

import { safeNext } from "@/lib/auth/shared";
import { supabaseServer } from "@/server/auth";

/** OAuth lands here (GitHub / Google via Supabase): swap the code for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    console.error("[auth] code exchange failed:", error.message);
  }
  const fail = new URL("/login", url.origin);
  fail.searchParams.set("error", url.searchParams.get("error_description") ?? "Sign-in didn't complete. Please try again.");
  return NextResponse.redirect(fail);
}
