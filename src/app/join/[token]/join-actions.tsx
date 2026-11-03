"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { GitHubIcon, GoogleIcon } from "@/components/marketing/brand-icons";
import { acceptInvite } from "@/lib/api/remote";
import { signInWith, signOut, type OAuthProvider } from "@/lib/auth/browser";

export function JoinActions(props: { token: string; signedInAs: string | null; alreadyMember: boolean; workspaceName: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = `/join/${props.token}`;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };
  const join = () =>
    run("join", async () => {
      await acceptInvite(props.token);
      // Full load: the app starts fresh in the new workspace.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/app");
    });

  if (!props.signedInAs) {
    const go = (p: OAuthProvider) => run(p, () => signInWith(p, back));
    return (
      <div className="mt-6 grid gap-2.5">
        <Provider onClick={() => go("github")} busy={busy === "github"}>
          <GitHubIcon className="size-[18px]" /> Continue with GitHub
        </Provider>
        <Provider onClick={() => go("google")} busy={busy === "google"}>
          <GoogleIcon className="size-[18px]" /> Continue with Google
        </Provider>
        {error && <p role="alert" className="text-meta text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Joining is idempotent and switches you to that workspace, so members use it to open it. */}
      <button
        type="button"
        onClick={join}
        disabled={!!busy}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy === "join" && <LoaderCircleIcon className="size-4 animate-spin" />}
        {props.alreadyMember ? `Open ${props.workspaceName}` : `Join ${props.workspaceName}`}
      </button>
      <p className="mt-3 text-center text-meta text-muted-foreground">
        Signed in as {props.signedInAs}.{" "}
        <button type="button" onClick={() => void signOut()} className="cursor-pointer font-semibold text-link hover:underline">
          Not you?
        </button>
      </p>
      {error && <p role="alert" className="mt-2 text-meta text-destructive">{error}</p>}
    </div>
  );
}

function Provider(props: { onClick: () => void; busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border bg-background text-sm font-semibold hover:bg-muted"
    >
      {props.busy && <LoaderCircleIcon className="size-[18px] animate-spin" />}
      {props.children}
    </button>
  );
}
