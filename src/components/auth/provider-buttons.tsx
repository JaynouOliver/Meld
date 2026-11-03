"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { GitHubIcon, GoogleIcon } from "@/components/marketing/brand-icons";
import { signInWith, type OAuthProvider } from "@/lib/auth/browser";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/auth/shared";

const PROVIDERS: { id: OAuthProvider; label: string; Icon: (p: { className?: string }) => React.ReactNode }[] = [
  { id: "github", label: "GitHub", Icon: GitHubIcon },
  { id: "google", label: "Google", Icon: GoogleIcon },
];

/**
 * Which sign-in providers are switched on in Supabase (its public settings endpoint),
 * so we never send someone to a provider that isn't set up. Null while loading.
 */
function useEnabledProviders() {
  const [enabled, setEnabled] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    let live = true;
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { external?: Record<string, boolean> } | null) => live && d?.external && setEnabled(d.external))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return enabled;
}

/** "Continue with GitHub / Google" for the providers that are enabled. */
export function ProviderButtons({ verb, next }: { verb: string; next: string }) {
  const enabled = useEnabledProviders();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Coming back with the browser's Back button restores this page from the
  // back-forward cache, spinner and all: reset it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

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

  // Until we know, show every provider; then only the enabled ones.
  const shown = PROVIDERS.filter((p) => !enabled || enabled[p.id]);
  return (
    <div className="grid gap-2.5">
      {shown.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => go(id)}
          disabled={!!busy}
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted disabled:cursor-default disabled:opacity-60"
        >
          {busy === id && <LoaderCircleIcon className="size-[18px] animate-spin" />}
          <Icon className="size-[18px]" /> {verb} with {label}
        </button>
      ))}
      {enabled && !shown.length && <p className="text-meta text-muted-foreground">Sign-in isn&apos;t set up yet.</p>}
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-meta text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
