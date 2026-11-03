"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/marketing/logo";
import { InviteLink } from "@/components/workspace/invite-link";
import { useDirectoryQuery } from "@/hooks/use-directory";
import { useHydrated } from "@/hooks/use-hydrated";
import { queryKeys } from "@/hooks/query-keys";
import { signOut } from "@/lib/auth/browser";
import * as remote from "@/lib/api/remote";

const DEFAULT_TEAMS = "Engineering, Design, Product";

/** "Acme Robotics" → "AR"; "Northwind" → "NOR" (mirrors the server's suggestion). */
function prefixFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const p = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3);
  return p.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

/** Two steps: set up the company's workspace, then invite the team. */
export function Onboarding() {
  const { data: cached } = useDirectoryQuery();
  // The directory can come from the persisted cache, which the server doesn't have.
  const existing = useHydrated() ? cached : undefined;
  const [created, setCreated] = useState<{ home: string; name: string } | null>(null);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-14 items-center justify-between border-b bg-background px-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3 text-meta">
          {existing && !created && (
            <Link href="/app" className="font-semibold">
              Back to {existing.workspace.name}
            </Link>
          )}
          <button type="button" onClick={() => void signOut()} className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-lg border bg-card p-6">
          <Steps step={created ? 2 : 1} />
          {created ? <InviteStep {...created} /> : <CompanyStep onCreated={setCreated} />}
        </div>
      </main>
    </div>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <ol className="mb-5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <li className={step === 1 ? "text-brand" : ""}>1 · Company</li>
      <li aria-hidden>—</li>
      <li className={step === 2 ? "text-brand" : ""}>2 · Invite your team</li>
    </ol>
  );
}

function CompanyStep({ onCreated }: { onCreated: (c: { home: string; name: string }) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixEdited, setPrefixEdited] = useState(false);
  const [teams, setTeams] = useState(DEFAULT_TEAMS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownPrefix = prefixEdited ? prefix : prefixFor(name);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give your workspace a name.");
    setBusy(true);
    setError(null);
    try {
      const res = await remote.createWorkspace({ name, ticketPrefix: shownPrefix, teams: teams.split(",") });
      await qc.invalidateQueries({ queryKey: queryKeys.directory });
      onCreated({ home: res.home, name: name.trim() });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <h1 className="text-lg font-semibold">Set up your company</h1>
      <p className="mt-1.5 text-meta text-muted-foreground">You can change all of this later.</p>

      <Field label="Company name" htmlFor="ws-name">
        <input id="ws-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Robotics" maxLength={60} className={INPUT} />
      </Field>
      <Field label="Ticket prefix" htmlFor="ws-prefix" hint={`Tickets will be ${shownPrefix || "ACME"}-1, ${shownPrefix || "ACME"}-2, …`}>
        <input
          id="ws-prefix"
          value={shownPrefix}
          onChange={(e) => {
            setPrefixEdited(true);
            setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5));
          }}
          placeholder="ACME"
          className={`${INPUT} font-mono uppercase`}
        />
      </Field>
      <Field label="Teams" htmlFor="ws-teams" hint="Comma-separated. Tickets belong to a team.">
        <input id="ws-teams" value={teams} onChange={(e) => setTeams(e.target.value)} className={INPUT} />
      </Field>

      {error && <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-meta text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className={PRIMARY}>
        {busy && <LoaderCircleIcon className="size-4 animate-spin" />} Create workspace
      </button>
    </form>
  );
}

function InviteStep({ home, name }: { home: string; name: string }) {
  const router = useRouter();
  return (
    <div>
      <h1 className="text-lg font-semibold">Invite your team to {name}</h1>
      <p className="mt-1.5 text-meta text-muted-foreground">
        Share this link. Anyone who opens it can sign in with GitHub or Google and join. Links expire in 14 days.
      </p>
      <InviteLink />
      <button type="button" onClick={() => router.push(`/chat/${home}`)} className={PRIMARY}>
        Continue to #general
      </button>
      <p className="mt-3 text-center text-meta text-muted-foreground">You can invite people any time from the workspace menu.</p>
    </div>
  );
}

const INPUT = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const PRIMARY =
  "mt-6 flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-brand text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";

function Field(props: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <label htmlFor={props.htmlFor} className="text-xs font-medium text-ink-2">
        {props.label}
      </label>
      {props.children}
      {props.hint && <p className="mt-1 text-meta text-muted-foreground">{props.hint}</p>}
    </div>
  );
}
