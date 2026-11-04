"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { queryKeys } from "@/hooks/query-keys";
import { useDirectory } from "@/hooks/use-directory";
import * as remote from "@/lib/api/remote";
import { ATLAS_ID, personOf } from "@/lib/directory";
import { canManage } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { InviteLink } from "./invite-link";

/** Invite people (owners) and see / manage members (role, team, remove). */
export function PeopleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const dir = useDirectory();
  const owner = canManage(dir.role);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`People in ${dir.workspace.name}`} description={owner ? "Invite your team and manage roles." : "Who's here, and your team."}>
        {owner && (
          <section className="mb-6">
            <h3 className="text-meta font-semibold">Invite people</h3>
            <InviteLink />
          </section>
        )}
        <section>
          <h3 className="text-meta font-semibold">Members · {dir.personOrder.filter((id) => id !== ATLAS_ID).length}</h3>
          <ul className="mt-2 divide-y">
            {dir.personOrder.filter((id) => id !== ATLAS_ID).map((id) => (
              <MemberRow key={id} id={id} />
            ))}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({ id }: { id: string }) {
  const dir = useDirectory();
  const qc = useQueryClient();
  const p = personOf(dir, id);
  const self = id === dir.me;
  const owner = canManage(dir.role);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The directory has roles only for me; others' roles come from the membership list.
  const role = (dir.roles?.[id] ?? (self ? dir.role : "member")) as Role;

  const save = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: queryKeys.directory });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <button type="button" data-profile={p.id} aria-label={`${p.name}'s profile`} className="cursor-pointer rounded-[6px]">
        <Avatar person={p} size="md" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          <button type="button" data-profile={p.id} className="cursor-pointer hover:underline">{p.name}</button>{" "}
          {self && <span className="font-normal text-muted-foreground">(you)</span>}
        </div>
        {error && <div className="text-meta text-destructive">{error}</div>}
      </div>
      <select
        aria-label={`${p.first}'s team`}
        disabled={busy || !(owner || self)}
        value={p.team ?? ""}
        onChange={(e) => save(() => remote.updateMember({ userId: id, team: e.target.value || null }))}
        className="h-8 rounded-md border bg-background px-2 text-meta disabled:opacity-70"
      >
        <option value="">No team</option>
        {dir.teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        aria-label={`${p.first}'s role`}
        disabled={busy || !owner}
        value={role}
        onChange={(e) => save(() => remote.updateMember({ userId: id, role: e.target.value as Role }))}
        className="h-8 rounded-md border bg-background px-2 text-meta capitalize disabled:opacity-70"
      >
        {(["owner", "member", "guest"] as Role[]).map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {owner && !self && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Remove ${p.name} from ${dir.workspace.name}?`)) void save(() => remote.removeMember(id));
          }}
          className="h-8 cursor-pointer rounded-md px-2 text-meta font-medium text-destructive hover:bg-danger-soft"
        >
          Remove
        </button>
      )}
    </li>
  );
}
