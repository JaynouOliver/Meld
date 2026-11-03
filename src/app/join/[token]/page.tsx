import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/marketing/logo";
import { getSessionUser } from "@/server/auth";
import { describeInvite } from "@/server/workspace";
import { JoinActions } from "./join-actions";

export const metadata: Metadata = { title: "Join a workspace" };

/** Invite link landing: who's inviting you where, then sign in (if needed) and join. */
export default function JoinPage(props: PageProps<"/join/[token]">) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <header className="flex h-14 items-center border-b bg-background px-5 sm:px-8">
        <Link href="/" aria-label="Meld home" className="text-foreground">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm rounded-lg border bg-card p-6">
          <Suspense fallback={<p className="text-meta text-muted-foreground">Checking your invite…</p>}>
            <JoinCard params={props.params} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function JoinCard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSessionUser();
  const invite = await describeInvite(token, user);
  if (!invite.valid) {
    return (
      <>
        <h1 className="text-lg font-semibold">This invite link doesn&apos;t work</h1>
        <p className="mt-1.5 text-meta text-muted-foreground">It may have expired or been revoked. Ask whoever invited you for a new link.</p>
        <Link href="/" className="mt-6 inline-block text-meta font-semibold">
          Go to Meld
        </Link>
      </>
    );
  }
  return (
    <>
      <p className="text-meta text-muted-foreground">{invite.inviter ? `${invite.inviter} invited you to` : "You're invited to"}</p>
      <h1 className="mt-1 text-xl font-semibold">{invite.workspaceName}</h1>
      <p className="mt-1.5 text-meta text-muted-foreground">
        Join as {invite.role === "owner" ? "an owner" : `a ${invite.role}`} · {invite.memberCount} {invite.memberCount === 1 ? "member" : "members"}
      </p>
      <JoinActions token={token} signedInAs={user?.name ?? null} alreadyMember={invite.alreadyMember} workspaceName={invite.workspaceName} />
    </>
  );
}
