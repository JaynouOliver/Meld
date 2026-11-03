"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { EmailForm, OrDivider } from "@/components/auth/email-form";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { safeNext } from "@/lib/auth/shared";

export function LoginCard({ devAuth }: { devAuth: boolean }) {
  const params = useSearchParams();
  const signup = params.get("mode") === "signup";
  const next = safeNext(params.get("next"));
  const error = params.get("error");

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-sm">
      <h1 className="text-xl font-bold">{signup ? "Create your account" : "Sign in to Meld"}</h1>
      <p className="mt-1.5 text-meta text-muted-foreground">
        {signup ? "Then set up your company's workspace and invite your team." : "Welcome back. Pick how you signed up."}
      </p>

      <div className="mt-6">
        <ProviderButtons verb={signup ? "Sign up" : "Continue"} next={next} />
        <OrDivider />
        <EmailForm mode={signup ? "signup" : "signin"} next={next} />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-meta text-destructive">
          {error}
        </p>
      )}

      {devAuth && <DevSignIn next={next} />}

      <p className="mt-6 text-center text-meta text-muted-foreground">
        {signup ? "Already have an account? " : "New to Meld? "}
        <Link className="font-semibold text-link hover:underline" href={signup ? `/login?next=${encodeURIComponent(next)}` : `/login?mode=signup&next=${encodeURIComponent(next)}`}>
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

/** Local testing only (AUTH_MODE=dev): sign in as a named test user. */
function DevSignIn({ next }: { next: string }) {
  const [name, setName] = useState("Ada Lovelace");
  return (
    <form action="/auth/dev" method="get" className="mt-5 border-t pt-4">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="dev-name" className="text-meta font-semibold text-muted-foreground">
        Dev sign-in (local only)
      </label>
      <div className="mt-1.5 flex gap-2">
        <input id="dev-name" name="name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
        <button type="submit" className="h-10 cursor-pointer rounded-md bg-foreground px-3 text-sm font-semibold text-background">
          Go
        </button>
      </div>
    </form>
  );
}
