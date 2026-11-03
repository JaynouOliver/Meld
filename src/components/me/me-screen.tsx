"use client";

import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Avatar } from "@/components/common/avatar";
import { ScreenHeader } from "@/components/shell/screen-header";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { ACCENTS } from "@/lib/constants";
import { personOf } from "@/lib/directory";
import { THEME_OPTIONS } from "@/lib/theme";
import { clampRole, roleLabel, roleScope } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const THEME_ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const;
const ROLES: Role[] = ["owner", "member", "guest"];

/** Profile and workspace preferences. On phones this replaces the sidebar footer. */
export function MeScreen() {
  const dir = useDirectory();
  const role = useRole();
  const setRole = useUiStore((s) => s.setRole);
  const accent = useUiStore((s) => s.accent);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setAccent = useUiStore((s) => s.setAccent);
  const me = personOf(dir, dir.me);
  // You can preview the app as your own role or a lower one.
  const viewAs = ROLES.filter((r) => clampRole(r, dir.role) === r);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-canvas">
      <ScreenHeader>
        <h1 className="text-xl font-semibold md:text-[15px]">You</h1>
      </ScreenHeader>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-5">
          <div className="flex items-center gap-3.5">
            <Avatar person={me} presence ringClassName="border-canvas" className="size-12 rounded-md text-base" />
            <div className="flex flex-col">
              <span className="text-base font-semibold">{me.name}</span>
              <span className="text-sm text-muted-foreground">
                {roleLabel(dir, role)} · {dir.workspace.name}
              </span>
            </div>
          </div>

          {viewAs.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-xs font-medium text-muted-foreground">View as role (RBAC demo)</legend>
              <div className="relative overflow-hidden rounded-md border bg-card">
                {viewAs.map((r) => (
                  <label key={r} className="flex min-h-12 cursor-pointer items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0 active:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring">
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body font-semibold">{roleLabel(dir, r)}</span>
                      <span className="text-meta text-muted-foreground">{roleScope(dir, r)}</span>
                    </span>
                    <span
                      aria-hidden
                      className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", role === r ? "border-brand bg-brand text-white" : "border-input")}
                    >
                      {role === r && <CheckIcon className="size-3.5" strokeWidth={3} />}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 text-xs font-medium text-muted-foreground">Appearance</legend>
            <div className="grid grid-cols-3 gap-1 rounded-md border bg-muted p-0.5">
              {THEME_OPTIONS.map((o) => {
                const Icon = THEME_ICON[o.value];
                return (
                  <label
                    key={o.value}
                    className="flex min-h-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-[4px] text-sm font-medium text-muted-foreground has-[:checked]:bg-card has-[:checked]:text-foreground has-[:checked]:ring-1 has-[:checked]:ring-border has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
                  >
                    <input type="radio" name="theme" value={o.value} checked={theme === o.value} onChange={() => setTheme(o.value)} className="sr-only" />
                    <Icon className="size-4" />
                    {o.label}
                  </label>
                );
              })}
            </div>
            <p className="text-meta text-muted-foreground">{THEME_OPTIONS.find((o) => o.value === theme)?.hint}</p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 text-xs font-medium text-muted-foreground">Workspace accent</legend>
            <div className="flex gap-3">
              {ACCENTS.map((a) => (
                <label key={a.value} className="flex cursor-pointer flex-col items-center gap-1.5 text-xs font-medium text-ink-2">
                  <input type="radio" name="accent" value={a.value} checked={accent === a.value} onChange={() => setAccent(a.value)} className="peer sr-only" />
                  <span
                    className="flex size-10 items-center justify-center rounded-md text-white ring-offset-2 ring-offset-canvas peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
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
