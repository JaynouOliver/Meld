"use client";

import { CheckIcon } from "lucide-react";

import { Avatar } from "@/components/common/avatar";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ACCENTS, PEOPLE, WORKSPACE_NAME } from "@/lib/constants";
import { ROLE_LABEL, ROLE_SCOPE } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/** Profile and workspace preferences. On phones this replaces the sidebar footer. */
export function MeScreen() {
  const role = useUiStore((s) => s.role);
  const setRole = useUiStore((s) => s.setRole);
  const accent = useUiStore((s) => s.accent);
  const setAccent = useUiStore((s) => s.setAccent);
  const me = PEOPLE.me;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-canvas">
      <ScreenHeader>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] md:text-[17px]">You</h1>
      </ScreenHeader>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-5">
          <div className="flex items-center gap-3.5">
            <Avatar person={me} presence ringClassName="border-canvas" className="size-14 rounded-2xl text-lg" />
            <div className="flex flex-col">
              <span className="text-lg font-bold">{me.name}</span>
              <span className="text-sm text-muted-foreground">
                {ROLE_LABEL[role]} · {WORKSPACE_NAME}
              </span>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">View as role (RBAC demo)</legend>
            <div className="relative overflow-hidden rounded-xl border bg-white">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <label key={r} className="flex min-h-14 cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0 active:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring">
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-semibold">{ROLE_LABEL[r]}</span>
                    <span className="text-[13px] text-muted-foreground">{ROLE_SCOPE[r]}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2", role === r ? "border-brand bg-brand text-white" : "border-input")}
                  >
                    {role === r && <CheckIcon className="size-3.5" strokeWidth={3} />}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">Workspace accent</legend>
            <div className="flex gap-3">
              {ACCENTS.map((a) => (
                <label key={a.value} className="flex cursor-pointer flex-col items-center gap-1.5 text-xs font-medium text-ink-2">
                  <input type="radio" name="accent" value={a.value} checked={accent === a.value} onChange={() => setAccent(a.value)} className="peer sr-only" />
                  <span
                    className="flex size-12 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-canvas peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                    style={{ background: a.value }}
                  >
                    {accent === a.value && <CheckIcon className="size-5" strokeWidth={3} />}
                  </span>
                  {a.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </main>
  );
}
