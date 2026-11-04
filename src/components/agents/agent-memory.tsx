"use client";

import { XIcon } from "lucide-react";

import { useAgentMemories, useForgetMemory } from "@/hooks/use-agent-memory";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { TEAM_MEMORY, type AgentMemory } from "@/lib/agent/memory";
import { personOf, type AgentInfo } from "@/lib/directory";

/**
 * What an agent remembers across conversations (it adds facts when asked to remember),
 * and the team memory every agent reads. Anyone but guests can remove a fact.
 */
export function AgentMemorySection({ agent }: { agent: AgentInfo }) {
  const { data, isLoading, error } = useAgentMemories(agent.id);
  const own = (data ?? []).filter((m) => m.agentId === agent.id);
  const team = (data ?? []).filter((m) => m.agentId === TEAM_MEMORY);
  return (
    <section className="mt-5" aria-labelledby="agent-memory-heading">
      <h3 id="agent-memory-heading" className="text-xs font-medium text-ink-2">Memory</h3>
      <p className="text-meta text-muted-foreground">
        Facts {agent.name} keeps between conversations. Ask it to &ldquo;remember that…&rdquo; to add one.
      </p>
      {error ? (
        <p className="mt-2 text-meta text-destructive">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="mt-2 text-meta text-muted-foreground">Loading…</p>
      ) : (
        <>
          <MemoryList items={own} empty={`${agent.name} hasn't been asked to remember anything yet.`} />
          <h4 className="mt-3 text-xs font-medium text-ink-2">Team memory</h4>
          <p className="text-meta text-muted-foreground">Shared by every agent in the workspace.</p>
          <MemoryList items={team} empty="Nothing shared yet." />
        </>
      )}
    </section>
  );
}

function MemoryList({ items, empty }: { items: AgentMemory[]; empty: string }) {
  const dir = useDirectory();
  const role = useRole();
  const forget = useForgetMemory();
  if (!items.length) return <p className="mt-2 rounded-md border border-dashed px-3 py-2 text-meta text-muted-foreground">{empty}</p>;
  return (
    <ul className="mt-2 divide-y rounded-md border" data-testid="memory-list">
      {items.map((m) => (
        <li key={m.id} className="flex items-start gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm break-words">{m.text}</p>
            <p className="text-xs text-muted-foreground">
              From {personOf(dir, m.createdBy).name} · {new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </div>
          {role !== "guest" && (
            <button
              type="button"
              onClick={() => forget.mutate(m.id)}
              disabled={forget.isPending && forget.variables === m.id}
              aria-label={`Forget "${m.text}"`}
              title="Forget"
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
