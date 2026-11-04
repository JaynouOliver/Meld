"use client";

import { SearchIcon } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { useDirectory } from "@/hooks/use-directory";
import { personOf, teamName } from "@/lib/directory";
import { useUiStore } from "@/stores/ui-store";

/**
 * The channel's people and agents: a stacked-faces button that opens a searchable list.
 * Every row opens that person's profile.
 */
export function MembersButton({ chatId }: { chatId: string }) {
  const dir = useDirectory();
  const meta = dir.chats[chatId];
  const [q, setQ] = useState("");
  const members = useMemo(() => (meta?.kind === "channel" ? meta.members : []), [meta]);
  const agents = useMemo(() => (meta?.kind === "channel" ? (meta.agents ?? []).map((a) => a.id) : []), [meta]);
  const people = useMemo(() => {
    const all = [...new Set([...members, ...agents])].map((id) => personOf(dir, id));
    const term = q.trim().toLowerCase();
    const hit = (p: (typeof all)[number]) => !term || `${p.name} ${p.title ?? ""}`.toLowerCase().includes(term);
    // People first (you at the top), then agents; alphabetical inside each.
    return all
      .filter(hit)
      .sort((a, b) => Number(!!a.isAgent) - Number(!!b.isAgent) || Number(b.id === dir.me) - Number(a.id === dir.me) || a.name.localeCompare(b.name));
  }, [members, agents, dir, q]);
  if (meta?.kind !== "channel") return null;
  // Agents can be listed as members too: count people and agents separately.
  const humans = [...new Set(members)].filter((id) => !personOf(dir, id).isAgent);
  const agentCount = new Set([...agents, ...members.filter((id) => personOf(dir, id).isAgent)]).size;
  const open = (id: string) => useUiStore.getState().openProfile(id);

  return (
    <Popover.Root onOpenChange={(o) => !o && setQ("")}>
      <Popover.Trigger
        title="Channel members"
        aria-label={`Channel members: ${humans.length}`}
        className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-input pr-2.5 pl-1.5 transition-colors hover:bg-muted data-[state=open]:bg-muted"
      >
        <span aria-hidden className="flex pl-1 max-[360px]:hidden">
          {humans.slice(0, 3).map((k) => (
            <Avatar key={k} person={personOf(dir, k)} size="sm" className="-ml-1 border-2 border-background" />
          ))}
        </span>
        <span className="tabular text-meta font-medium text-ink-2">{humans.length}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[300px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
        >
          <div className="border-b px-3 pt-3 pb-2">
            <div className="text-[13px] font-semibold">
              #{meta.label} · {humans.length} {humans.length === 1 ? "person" : "people"}
              {agentCount ? `, ${agentCount} ${agentCount === 1 ? "agent" : "agents"}` : ""}
            </div>
            <label className="mt-2 flex h-8 items-center gap-2 rounded-md border bg-background px-2 focus-within:border-subtle">
              <SearchIcon aria-hidden className="size-3.5 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone" aria-label="Find a member" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
            </label>
          </div>
          <ul className="max-h-[320px] overflow-y-auto p-1">
            {people.map((p) => (
              <li key={p.id}>
                <Popover.Close asChild>
                  <button type="button" onClick={() => open(p.id)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                    <Avatar person={p} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {p.name}
                        {p.id === dir.me && <span className="font-normal text-muted-foreground"> (you)</span>}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {p.isAgent ? "Agent" : [p.title, p.team ? teamName(dir, p.team) : null].filter(Boolean).join(" · ") || "Member"}
                      </span>
                    </span>
                  </button>
                </Popover.Close>
              </li>
            ))}
            {!people.length && <li className="px-2 py-3 text-[13px] text-muted-foreground">No one matches.</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
