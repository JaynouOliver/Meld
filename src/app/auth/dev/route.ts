import { NextResponse } from "next/server";

import { DEV_AUTH, DEV_COOKIE, safeNext } from "@/lib/auth/shared";

/**
 * Local testing only (AUTH_MODE=dev): /auth/dev?name=Ada%20Lovelace[&id=…] signs you in as that
 * test user without OAuth. Returns 404 everywhere else.
 */
export async function GET(request: Request) {
  if (!DEV_AUTH) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "Dev User").slice(0, 60);
  // ?id=me signs in as the Northwind demo owner (Suvra) for the existing e2e tests.
  const id = url.searchParams.get("id") || `dev-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const res = NextResponse.redirect(new URL(safeNext(url.searchParams.get("next")), url.origin));
  res.cookies.set(DEV_COOKIE, encodeURIComponent(JSON.stringify({ id, name, email: `${id}@example.test` })), { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
