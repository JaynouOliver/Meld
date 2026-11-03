"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { queryKeys } from "@/hooks/query-keys";
import { useDirectory } from "@/hooks/use-directory";
import * as remote from "@/lib/api/remote";

/** Owners: workspace name, teams, and the GitHub repo PR links point to. */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const dir = useDirectory();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Workspace settings" description={`Ticket ids start with ${dir.workspace.ticketPrefix}-.`}>
        {/* Keyed so the form starts from the latest values each time it opens. */}
        {open && <SettingsForm key={dir.workspace.id} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const dir = useDirectory();
  const qc = useQueryClient();
  const [name, setName] = useState(dir.workspace.name);
  const [teams, setTeams] = useState(dir.teams.map((t) => t.name).join(", "));
  const [repo, setRepo] = useState(dir.workspace.repo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await remote.updateWorkspace({ name, teams: teams.split(","), repo: repo || null });
      await qc.refetchQueries({ queryKey: queryKeys.directory });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = "mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-subtle";
  return (
    <form onSubmit={submit}>
      <label htmlFor="ws-set-name" className="text-meta font-semibold">Name</label>
      <input id="ws-set-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={input} />
      <label htmlFor="ws-set-teams" className="mt-4 block text-meta font-semibold">Teams</label>
      <input id="ws-set-teams" value={teams} onChange={(e) => setTeams(e.target.value)} className={input} />
      <p className="mt-1 text-meta text-muted-foreground">Comma-separated. Teams you keep stay attached to their tickets.</p>
      <label htmlFor="ws-set-repo" className="mt-4 block text-meta font-semibold">GitHub repository</label>
      <input id="ws-set-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="acme/web" className={input} />
      <p className="mt-1 text-meta text-muted-foreground">Used for PR and issue links on tickets.</p>
      {error && <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-meta text-destructive">{error}</p>}
      <div className="mt-6 flex justify-end">
        <button type="submit" disabled={busy} className="flex h-10 cursor-pointer items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy && <LoaderCircleIcon className="size-4 animate-spin" />} Save
        </button>
      </div>
    </form>
  );
}
