"use client";

import { LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import { supabaseBrowser } from "@/lib/auth/browser";
import { clearLocalCache } from "@/lib/cache";
import { cn } from "@/lib/utils";

/** One click into a private copy of a company with agents already at work. No sign-up. */
export function TryDemo({ className, label = "Try the live demo" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      const body = (await res.json()) as { credentials?: { email: string; password: string } | null; next?: string; error?: string };
      if (!res.ok || !body.next) throw new Error(body.error ?? "Couldn't start the demo.");
      if (body.credentials) {
        const { error } = await supabaseBrowser().auth.signInWithPassword(body.credentials);
        if (error) throw error;
      }
      clearLocalCache();
      window.location.assign(body.next);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={cn("inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-70", className)}
      >
        {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
        {busy ? "Setting up your demo company…" : label}
      </button>
      {error && <p role="alert" className="text-meta text-destructive">{error}</p>}
    </div>
  );
}
