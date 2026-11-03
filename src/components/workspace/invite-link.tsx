"use client";

import { CheckIcon, CopyIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import * as remote from "@/lib/api/remote";
import type { Role } from "@/lib/types";

const ROLE_HINT: Record<Role, string> = {
  member: "Members chat, create and edit tickets in their team.",
  guest: "Guests only see tickets assigned to them.",
  owner: "Owners can do everything, including inviting and deleting.",
};

/** Make an invite link for a role, with copy. Shared with the in-app invite dialog. */
export function InviteLink() {
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = link[role];

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const inv = await remote.createInvite(role);
      setLink((l) => ({ ...l, [role]: `${window.location.origin}/join/${inv.token}` }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-5">
      <div className="flex gap-2" role="radiogroup" aria-label="Invite as">
        {(["member", "guest", "owner"] as Role[]).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            onClick={() => setRole(r)}
            className={`h-9 cursor-pointer rounded-md border px-3 text-meta font-semibold capitalize ${role === r ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <p className="mt-2 text-meta text-muted-foreground">{ROLE_HINT[role]}</p>
      {url ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border bg-background py-1 pr-1 pl-3">
          <code className="min-w-0 flex-1 truncate text-meta" data-testid="invite-url">{url}</code>
          <button type="button" onClick={copy} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-3 text-meta font-semibold text-background">
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={make} disabled={busy} className="mt-3 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-semibold hover:bg-muted">
          {busy && <LoaderCircleIcon className="size-4 animate-spin" />} Create {role} invite link
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-meta text-destructive">{error}</p>}
    </div>
  );
}
