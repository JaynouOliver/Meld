"use client";

import { useDirectory } from "@/hooks/use-directory";
import { personOf } from "@/lib/directory";
import type { PersonId } from "@/lib/types";

/**
 * Reactions under a message. Agents use 👀 to show they've picked a message up (it's
 * replaced by their reply), so the chip names who's looking.
 */
export function Reactions({ reactions }: { reactions?: Record<string, PersonId[]> }) {
  const dir = useDirectory();
  const entries = Object.entries(reactions ?? {}).filter(([, who]) => who.length);
  if (!entries.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {entries.map(([emoji, who]) => {
        const names = who.map((id) => personOf(dir, id).name);
        const label = emoji === "👀" ? `${names.join(", ")} ${who.length === 1 ? "is" : "are"} looking at this` : names.join(", ");
        return (
          <span key={emoji} title={label} className="inline-flex items-center gap-1.5 rounded-sm border bg-muted px-1.5 py-px text-xs">
            <span aria-hidden>{emoji}</span>
            <span className="text-ink-2">{emoji === "👀" ? names.join(", ") : who.length}</span>
            <span className="sr-only">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
