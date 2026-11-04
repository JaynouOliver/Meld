"use client";

import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { ScreenHeader } from "@/components/shell/screen-header";
import { useDirectory } from "@/hooks/use-directory";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { agentById, ATLAS_ID, personOf, teamName } from "@/lib/directory";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

type Filter = "all" | "people" | "agents" | string;

/** Everyone in the workspace, people and agents, as cards. Each opens a profile. */
export function PeopleScreen() {
  const dir = useDirectory();
  const { visible } = useVisibleTickets();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const everyone = useMemo(() => {
    const ids = [...new Set([...dir.personOrder, ATLAS_ID, ...Object.keys(dir.people)])];
    return ids.map((id) => personOf(dir, id)).filter((p) => p.name !== "Former member");
  }, [dir]);
  const openCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of visible) if (t.status !== "Done" && t.status !== "Backburner") m.set(t.assignee, (m.get(t.assignee) ?? 0) + 1);
    return m;
  }, [visible]);

  const shown = everyone
    .filter((p) => (filter === "all" ? true : filter === "people" ? !p.isAgent : filter === "agents" ? !!p.isAgent : p.team === filter && !p.isAgent))
    .filter((p) => {
      const term = q.trim().toLowerCase();
      return !term || `${p.name} ${p.title ?? ""} ${teamName(dir, p.team)}`.toLowerCase().includes(term);
    })
    .sort((a, b) => Number(!!a.isAgent) - Number(!!b.isAgent) || Number(b.id === dir.me) - Number(a.id === dir.me) || a.name.localeCompare(b.name));

  const peopleCount = everyone.filter((p) => !p.isAgent).length;
  const agentCount = everyone.length - peopleCount;
  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: `Everyone · ${everyone.length}` },
    { id: "people", label: `People · ${peopleCount}` },
    { id: "agents", label: `Agents · ${agentCount}` },
    ...dir.teams.map((t) => ({ id: t.id, label: t.name })),
  ];

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ScreenHeader>
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <h1 className="text-base font-semibold">People</h1>
          <span className="hidden truncate text-meta text-muted-foreground md:block">Everyone in {dir.workspace.name}: your teammates and the agents that work with them.</span>
        </div>
      </ScreenHeader>
      <div className="flex-1 overflow-y-auto bg-canvas px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <label className="flex h-9 max-w-md items-center gap-2 rounded-md border bg-background px-2.5 focus-within:border-subtle">
            <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, title or team" aria-label="Search people" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter people">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={filter === c.id}
                onClick={() => setFilter(c.id)}
                className={cn(
                  "h-7 cursor-pointer rounded-md border px-2.5 text-[12px] font-medium transition-colors",
                  filter === c.id ? "border-foreground/20 bg-foreground text-background" : "bg-card text-ink-2 hover:border-subtle",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <ul className="fade-in mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => {
              const agent = agentById(dir, p.id);
              const n = openCount.get(p.id) ?? 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    data-profile={p.id}
                    className="no-press flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-card p-3.5 text-left transition-[border-color,box-shadow,transform] hover:border-subtle hover:shadow-sm active:scale-[0.99]"
                  >
                    <Avatar person={p} size="2xl" className="size-14" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[14px] font-semibold">{p.name}</span>
                        {p.isAgent && <span className="rounded-sm border px-1 text-[11px] font-medium text-muted-foreground">Agent</span>}
                        {p.id === dir.me && <span className="rounded-sm border px-1 text-[11px] font-medium text-muted-foreground">You</span>}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted-foreground">
                        {p.isAgent
                          ? agent?.description || p.title || "Agent"
                          : [p.title, p.team ? teamName(dir, p.team) : null].filter(Boolean).join(" · ") || "Member"}
                      </span>
                      <span className="mt-1.5 block text-[12px] text-ink-2">{n ? `${n} open ${n === 1 ? "ticket" : "tickets"}` : "No open tickets"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!shown.length && <p className="mt-6 text-center text-meta text-muted-foreground">No one matches.</p>}
        </div>
      </div>
    </main>
  );
}

/** Opens a profile from code (e.g. the command palette). */
export const openProfile = (id: string) => useUiStore.getState().openProfile(id);
