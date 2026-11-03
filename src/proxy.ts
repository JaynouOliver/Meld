import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { DEV_COOKIE, devUserFromCookie, isAppPath, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/auth/shared";

/**
 * Runs before every page: keeps the Supabase session cookie fresh, and does the quick
 * redirects (signed out → /login, signed in → past /login). Real authorization happens
 * on the server for every API call (src/server/auth.ts), not here.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let signedIn = !!devUserFromCookie(request.cookies.get(DEV_COOKIE)?.value);

  if (!signedIn && SUPABASE_URL && SUPABASE_ANON_KEY) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    signedIn = !!data?.claims?.sub;
  }

  const { pathname, search } = request.nextUrl;
  if (!signedIn && isAppPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.searchParams.get("next")?.startsWith("/") ? request.nextUrl.searchParams.get("next")! : "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Everything except static files and the RPC API (which checks the session itself).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
