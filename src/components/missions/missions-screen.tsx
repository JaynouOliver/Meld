"use client";

import { FlagIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useMissions } from "@/hooks/use-missions";
import { personOf } from "@/lib/directory";
import { MissionStatusTag, ProgressBar, fmtDay } from "./mission-bits";
import { NewMissionDialog } from "./new-mission-dialog";

/** All missions: what's being driven, how far along, and what needs a person. */
export function MissionsScreen() {
  const dir = useDirectory();
  const role = useRole();
  const { data, isPending } = useMissions();
  const [open, setOpen] = useState(false);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ScreenHeader
        actions={
          role !== "guest" && (
            <Button onClick={() => setOpen(true)} className="h-9 px-3">
              <PlusIcon className="size-4" /> New mission
            </Button>
          )
        }
      >
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <h1 className="text-base font-semibold">Missions</h1>
          <span className="hidden truncate text-meta text-muted-foreground md:block">
            Goals the agents plan, assign and drive to a date, asking you only for decisions.
          </span>
        </div>
      </ScreenHeader>
      <div className="flex-1 overflow-y-auto bg-canvas px-4 py-4 sm:px-6">
        {isPending && <p className="text-meta text-muted-foreground">Loading missions…</p>}
        {data && !data.length && (
          <div className="mx-auto mt-10 max-w-md rounded-md border bg-card p-6 text-center">
            <FlagIcon className="mx-auto size-5 text-muted-foreground" />
            <h2 className="mt-2 text-sm font-semibold">No missions yet</h2>
            <p className="mt-1 text-meta text-muted-foreground">
              Give the agents a goal and a date, for example &ldquo;ship the new pricing page by Friday&rdquo;. They plan the work, assign owners, chase it
              and flag what needs you. You can also type <span className="font-mono">@atlas mission: …</span> in any channel.
            </p>
            {role !== "guest" && (
              <Button onClick={() => setOpen(true)} className="mt-4 h-9 px-3">
                <PlusIcon className="size-4" /> New mission
              </Button>
            )}
          </div>
        )}
        <ul className="grid gap-3 lg:grid-cols-2">
          {data?.map((m) => {
            const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
            return (
              <li key={m.id}>
                <Link href={`/missions/${m.id}`} className="block rounded-md border bg-card p-4 text-foreground no-underline hover:border-input hover:text-foreground">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{m.title}</div>
                      <div className="mt-0.5 line-clamp-1 text-meta text-muted-foreground">{m.goal}</div>
                    </div>
                    <MissionStatusTag status={m.status} />
                  </div>
                  <ProgressBar value={pct} className="mt-3" />
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted-foreground">
                    <span>
                      {m.done}/{m.total} done
                    </span>
                    <span>Due {fmtDay(m.deadline)}</span>
                    <span>Started by {personOf(dir, m.createdBy ?? "").name}</span>
                    {m.openDecisions > 0 && <span className="font-semibold text-warning">Needs you · {m.openDecisions}</span>}
                  </div>
                  {m.health && <div className="mt-2 truncate text-meta text-ink-2">{m.health}</div>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <NewMissionDialog open={open} onOpenChange={setOpen} />
    </main>
  );
}
