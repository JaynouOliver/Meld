import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/marketing/logo";
import { DesktopHandoff } from "./desktop-handoff";

export const metadata: Metadata = { title: "Back to Meld for Mac", robots: { index: false } };

/**
 * The Mac app's sign-in lands here (Supabase redirect_to), then we hand the one-time code
 * to the app through meld://auth/callback. The app holds the PKCE verifier, so the code
 * is useless to anyone else, and this page never exchanges it.
 */
export default function DesktopAuthPage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <header className="flex h-14 items-center border-b bg-background px-5 sm:px-8">
        <Link href="/" aria-label="Meld home" className="text-foreground">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Suspense>
          <DesktopHandoff />
        </Suspense>
      </main>
    </div>
  );
}
