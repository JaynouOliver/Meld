"use client";

import { BookmarkIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { ScreenHeader } from "@/components/shell/screen-header";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useSetDecisionStatus, useTeamDecisions } from "@/hooks/use-team-decisions";
import { personOf } from "@/lib/directory";
import type { TeamDecision } from "@/lib/team-decisions";
import { useUiStore } from "@/stores/ui-store";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const STATUS: Record<TeamDecision["status"], { label: string; cls: string }> = {
  active: { label: "In effect", cls: "border-[var(--status-done-line)] text-[var(--status-done-fg)]" },
  reopened: { label: "Reopened", cls: "border-[var(--status-review-line)] text-[var(--status-review-fg)]" },
  superseded: { label: "Replaced", cls: "border-input text-muted-foreground" },
};

/** The team's decision memory: what was decided, why, what was rejected, by whom, and where. */
export function DecisionsScreen() {
  const { data, isPending } = useTeamDecisions();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (data ?? []).filter((d) => {
      const hay = `${d.topic} ${d.statement} ${d.rationale} ${d.rejected.join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [data, q]);
  const flagged = (data ?? []).reduce((n, d) => n + d.flags, 0);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ScreenHeader>
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <h1 className="text-base font-semibold">Decisions</h1>
          <span className="hidden truncate text-meta text-muted-foreground md:block">
            Logged by Atlas as conversations settle them. Atlas points people back here when a decision comes up again.
          </span>
        </div>
      </ScreenHeader>
      <div className="flex-1 overflow-y-auto bg-canvas px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded border bg-background px-2.5 focus-within:border-subtle">
              <SearchIcon className="size-4 text-muted-foreground" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search decisions: why did we…" aria-label="Search decisions" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            {data && (
              <span className="text-meta text-muted-foreground">
                {data.filter((d) => d.status === "active").length} in effect{flagged ? ` · re-raised ${flagged}×, caught by Atlas` : ""}
              </span>
            )}
          </div>
          {isPending && <p className="text-meta text-muted-foreground">Loading decisions…</p>}
          {data && !data.length && (
            <div className="mt-10 rounded-md border bg-card p-6 text-center">
              <BookmarkIcon className="mx-auto size-5 text-muted-foreground" />
              <h2 className="mt-2 text-sm font-semibold">No decisions yet</h2>
              <p className="mt-1 text-meta text-muted-foreground">
                When a conversation settles something (&ldquo;Agreed: we&apos;ll go with the sidebar card&rdquo;), Atlas logs it here with the reasoning, and flags it
                if someone proposes the opposite later.
              </p>
            </div>
          )}
          <ul className="flex flex-col gap-3">
            {list.map((d) => (
              <DecisionItem key={d.id} d={d} />
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

function DecisionItem({ d }: { d: TeamDecision }) {
  const dir = useDirectory();
  const role = useRole();
  const router = useRouter();
  const set = useSetDecisionStatus();
  const meta = dir.chats[d.chatId];
  const where = meta?.kind === "channel" ? `#${meta.label}` : "a DM";
  const s = STATUS[d.status];
  const open = () => {
    useUiStore.setState({ focus: { chatId: d.chatId, threadId: d.threadId, id: d.messageId } });
    router.push(`/chat/${d.chatId}`);
  };
  return (
    <li className="rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-muted-foreground">{d.topic}</div>
          <p className={`mt-0.5 text-sm font-semibold ${d.status === "superseded" ? "text-muted-foreground line-through" : ""}`}>{d.statement}</p>
        </div>
        <span className={`inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-[12px] font-medium ${s.cls}`}>{s.label}</span>
      </div>
      {d.rationale && (
        <p className="mt-2 text-meta text-ink-2">
          <span className="font-semibold">Why:</span> {d.rationale}
        </p>
      )}
      {d.rejected.length > 0 && (
        <p className="mt-1 text-meta text-ink-2">
          <span className="font-semibold">Not chosen:</span> {d.rejected.join("; ")}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-meta text-muted-foreground">
        <span className="flex items-center -space-x-1">
          {d.deciders.slice(0, 5).map((p) => (
            <Avatar key={p} person={personOf(dir, p)} size="xs" className="size-5 text-2xs ring-2 ring-card" />
          ))}
        </span>
        <span>
          {d.deciders.map((p) => personOf(dir, p).first).join(", ")} · {fmt(d.createdAt)} · {d.source === "mission" ? "mission decision in " : ""}
          <button type="button" onClick={open} className="cursor-pointer text-link hover:underline">
            {where}
          </button>
        </span>
        {d.flags > 0 && <span className="font-medium text-[var(--status-review-fg)]">Re-raised {d.flags}×</span>}
        {role !== "guest" && d.status !== "superseded" && (
          <button
            type="button"
            disabled={set.isPending}
            onClick={() => set.mutate({ id: d.id, status: d.status === "active" ? "reopened" : "active" })}
            className="ml-auto h-7 cursor-pointer rounded border px-2 text-[12px] font-medium text-ink-2 hover:border-subtle disabled:opacity-60"
          >
            {d.status === "active" ? "Reopen" : "Back in effect"}
          </button>
        )}
      </div>
    </li>
  );
}
