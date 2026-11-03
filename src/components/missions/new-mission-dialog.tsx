"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { queryKeys } from "@/hooks/query-keys";
import { useDirectory, useRole } from "@/hooks/use-directory";
import * as remote from "@/lib/api/remote";

const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

/** Give the agents a goal and a date; they come back with a plan to review. */
export function NewMissionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const dir = useDirectory();
  const role = useRole();
  const qc = useQueryClient();
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState(inDays(5));
  const [chatId, setChatId] = useState(dir.home);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const m = await remote.createMission({ goal, deadline, chatId, role });
      await qc.invalidateQueries({ queryKey: queryKeys.missions });
      onOpenChange(false);
      setGoal("");
      router.push(`/missions/${m.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = "mt-1.5 h-9 w-full rounded border bg-background px-2.5 text-sm outline-none focus:border-subtle";
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent title="New mission" description="Atlas drafts a plan: tasks, owners, dates and what depends on what. You review it before anything is filed.">
        <form onSubmit={submit}>
          <label className="block text-meta font-semibold">
            Goal
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              required
              rows={3}
              maxLength={300}
              placeholder="Ship the new pricing page with annual billing"
              className="mt-1.5 w-full rounded border bg-background px-2.5 py-2 text-sm outline-none focus:border-subtle"
            />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-meta font-semibold">
              Due
              <input type="date" value={deadline} min={inDays(0)} onChange={(e) => setDeadline(e.target.value)} className={input} />
            </label>
            <label className="block text-meta font-semibold">
              Channel
              <select value={chatId} onChange={(e) => setChatId(e.target.value)} className={input}>
                {dir.channels.map((c) => {
                  const m = dir.chats[c];
                  return m?.kind === "channel" ? (
                    <option key={c} value={c}>
                      #{m.label}
                    </option>
                  ) : null;
                })}
              </select>
            </label>
          </div>
          <p className="mt-2 text-meta text-muted-foreground">The mission gets its own thread there. Agents in that channel can own tasks.</p>
          {error && <p role="alert" className="mt-3 rounded border border-destructive/30 bg-danger-soft px-3 py-2 text-meta text-destructive">{error}</p>}
          <div className="mt-5 flex justify-end">
            <button type="submit" disabled={busy || !goal.trim()} className="flex h-9 cursor-pointer items-center gap-2 rounded bg-brand px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
              {busy && <LoaderCircleIcon className="size-4 animate-spin" />}
              {busy ? "Planning…" : "Plan mission"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
