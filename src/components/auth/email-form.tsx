"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { supabaseBrowser } from "@/lib/auth/browser";
import { clearLocalCache } from "@/lib/cache";

/**
 * Email + password, next to GitHub/Google. Signing up may need an email confirmation
 * (Supabase setting); the link comes back through /auth/callback like OAuth does.
 */
export function EmailForm({ mode, next }: { mode: "signin" | "signup"; next: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const signup = mode === "signup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    try {
      if (signup) {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim() || undefined },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      clearLocalCache();
      window.location.assign(next);
    } catch (err) {
      setError((err as Error).message || "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="rounded-md bg-success-soft px-3 py-2.5 text-meta text-success">
        Check {email} for a link to confirm your account. It brings you right back here.
      </p>
    );
  }

  const input = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-subtle";
  return (
    <form onSubmit={submit} className="grid gap-2.5">
      {signup && (
        <input aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={input} />
      )}
      <input aria-label="Email" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={input} />
      <input
        aria-label="Password"
        type="password"
        required
        minLength={6}
        placeholder={signup ? "Password (6+ characters)" : "Password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={signup ? "new-password" : "current-password"}
        className={input}
      />
      <button type="submit" disabled={busy} className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60">
        {busy && <LoaderCircleIcon className="size-4 animate-spin" />}
        {signup ? "Sign up with email" : "Sign in with email"}
      </button>
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-meta text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

/** "or" between the provider buttons and the email form. */
export function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3 text-meta text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
