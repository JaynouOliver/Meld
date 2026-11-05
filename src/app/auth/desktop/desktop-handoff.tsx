"use client";

import { CircleAlertIcon, CircleCheckIcon, LaptopIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

/** The Mac app's URL scheme (apps/mac/Resources/Info.plist). Fixed: never taken from the URL. */
const APP_CALLBACK = "meld://auth/callback";

/** Only these params go to the app; codes are opaque tokens, so keep them to safe characters. */
function appLink(params: URLSearchParams) {
  const out = new URLSearchParams();
  const code = params.get("code");
  if (code && /^[A-Za-z0-9_-]{8,200}$/.test(code)) out.set("code", code);
  for (const key of ["error", "error_description"]) {
    const v = params.get(key);
    if (v) out.set(key, v.slice(0, 300));
  }
  return out.size ? `${APP_CALLBACK}?${out}` : null;
}

export function DesktopHandoff() {
  const params = useSearchParams();
  const href = useMemo(() => appLink(params), [params]);
  const failed = !params.get("code");
  const error = params.get("error_description") ?? params.get("error");

  useEffect(() => {
    if (href) window.location.href = href;
  }, [href]);

  if (!href) {
    return (
      <Card icon={<LaptopIcon className="size-6 text-muted-foreground" />} title="Nothing to hand off">
        <p>This page finishes signing in to Meld for Mac. Start from the app, or sign in on the web instead.</p>
        <Link href="/login" className={SECONDARY}>
          Sign in on the web
        </Link>
      </Card>
    );
  }

  if (failed) {
    return (
      <Card icon={<CircleAlertIcon className="size-6 text-destructive" />} title="Sign-in didn't finish">
        <p>{error ?? "Something went wrong. Head back to the app and try again."}</p>
        <a href={href} className={PRIMARY}>
          Back to Meld
        </a>
      </Card>
    );
  }

  return (
    <Card icon={<CircleCheckIcon className="size-6 text-success" />} title="You're signed in">
      <p>Opening Meld for Mac now. If your browser asks, allow it to open Meld.</p>
      <a href={href} className={PRIMARY}>
        Open Meld
      </a>
      <p className="text-xs">Nothing happened? Click the button above. You can close this tab afterwards.</p>
    </Card>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">{icon}</div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="mt-2 flex flex-col items-center gap-4 text-meta text-muted-foreground">{children}</div>
    </div>
  );
}

const PRIMARY =
  "inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90";
const SECONDARY =
  "inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-muted";
