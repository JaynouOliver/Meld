"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { EmailForm, OrDivider } from "@/components/auth/email-form";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { acceptInvite } from "@/lib/api/remote";
import { clearLocalCache } from "@/lib/cache";
import { signOut } from "@/lib/auth/browser";

export function JoinActions(props: { token: string; signedInAs: string | null; alreadyMember: boolean; workspaceName: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = `/join/${props.token}`;
  const [emailMode, setEmailMode] = useState<"signin" | "signup">("signup");

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
      clearLocalCache();
      // Full load: the app starts fresh in the new workspace.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/app");
    });

  if (!props.signedInAs) {
    return (
      <div className="mt-6">
        <ProviderButtons verb="Continue" next={back} />
        <OrDivider />
        <EmailForm mode={emailMode} next={back} />
        <button type="button" onClick={() => setEmailMode(emailMode === "signup" ? "signin" : "signup")} className="mt-3 w-full cursor-pointer text-center text-meta font-semibold text-link hover:underline">
          {emailMode === "signup" ? "Already have an account? Sign in with email" : "New here? Sign up with email"}
        </button>
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
        className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-brand text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
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
