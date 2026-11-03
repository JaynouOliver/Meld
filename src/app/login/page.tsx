import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/marketing/logo";
import { LoginCard } from "./login-card";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <header className="flex h-14 items-center border-b bg-background px-5 sm:px-8">
        <Link href="/" aria-label="Meld home" className="text-foreground">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Suspense>
          <LoginCard devAuth={process.env.AUTH_MODE === "dev"} />
        </Suspense>
      </main>
    </div>
  );
}
