"use client";

import { LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { GitHubIcon, GoogleIcon } from "@/components/marketing/brand-icons";
import { signInWith, type OAuthProvider } from "@/lib/auth/browser";
import { safeNext } from "@/lib/auth/shared";

export function LoginCard({ devAuth }: { devAuth: boolean }) {
  const params = useSearchParams();
  const signup = params.get("mode") === "signup";
  const next = safeNext(params.get("next"));
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(params.get("error"));
  const verb = signup ? "Sign up" : "Continue";

  const go = async (p: OAuthProvider) => {
    setBusy(p);
    setError(null);
    try {
      await signInWith(p, next);
    } catch (e) {
      setBusy(null);
      setError((e as Error).message || "Couldn't start sign-in.");
    }
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-sm">
      <h1 className="text-xl font-bold">{signup ? "Create your account" : "Sign in to Meld"}</h1>
      <p className="mt-1.5 text-meta text-muted-foreground">
        {signup ? "Then set up your company's workspace and invite your team." : "Welcome back. Pick how you signed up."}
      </p>

      <div className="mt-6 grid gap-2.5">
        <ProviderButton onClick={() => go("github")} busy={busy === "github"} disabled={!!busy}>
          <GitHubIcon className="size-[18px]" /> {verb} with GitHub
        </ProviderButton>
        <ProviderButton onClick={() => go("google")} busy={busy === "google"} disabled={!!busy}>
          <GoogleIcon className="size-[18px]" /> {verb} with Google
        </ProviderButton>
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

function ProviderButton(props: { onClick: () => void; busy: boolean; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border bg-background text-sm font-semibold hover:bg-muted disabled:cursor-default disabled:opacity-60"
    >
      {props.busy ? <LoaderCircleIcon className="size-[18px] animate-spin" /> : null}
      {props.children}
    </button>
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
