"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BotIcon } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { queryKeys } from "@/hooks/query-keys";
import { useDirectory } from "@/hooks/use-directory";
import * as remote from "@/lib/api/remote";
import { agentModeIn, agentsOf, personOf } from "@/lib/directory";
import type { AgentMode, ChatId } from "@/lib/types";
import { AgentDialog } from "./agent-dialog";
import { MODE_OPTIONS } from "./agent-modes";

/**
 * The agents that can read a channel (participant transparency), shown in its header;
 * opens a list where members add agents and set how forward they are here.
 */
export function ChannelAgents({ chatId }: { chatId: ChatId }) {
  const dir = useDirectory();
  const [open, setOpen] = useState(false);
  const meta = dir.chats[chatId];
  if (!meta || meta.kind !== "channel") return null;
  const here = meta.agents ?? [];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={here.length ? `Agents that can read #${meta.label}` : "Add agents to this channel"}
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input px-2 text-meta font-medium text-ink-2 hover:bg-muted"
      >
        {here.length ? (
          <span aria-hidden className="flex">
            {here.slice(0, 3).map((a) => (
              <Avatar key={a.id} person={personOf(dir, a.id)} size="sm" className="-ml-1 rounded-[5px] border-2 border-background first:ml-0" />
            ))}
          </span>
        ) : (
          <BotIcon className="size-4" />
        )}
        <span className="max-sm:hidden">{here.length ? `${here.length} agent${here.length === 1 ? "" : "s"}` : "Agents"}</span>
      </button>
      <ChannelAgentsDialog chatId={chatId} open={open} onOpenChange={setOpen} />
    </>
  );
}

function ChannelAgentsDialog({ chatId, open, onOpenChange }: { chatId: ChatId; open: boolean; onOpenChange: (o: boolean) => void }) {
  const dir = useDirectory();
  const qc = useQueryClient();
  const meta = dir.chats[chatId];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const canEdit = dir.role !== "guest";
  if (!meta || meta.kind !== "channel") return null;

  const set = async (agentId: string, mode: AgentMode | "off") => {
    setBusy(agentId);
    setError(null);
    try {
      await remote.setChannelAgent({ chatId, agentId, mode });
      await qc.refetchQueries({ queryKey: queryKeys.directory });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent title={`Agents in #${meta.label}`} description="Agents read only the channels they're in. Everyone here can see this list.">
          <ul className="divide-y rounded-md border">
            {agentsOf(dir).map((a) => {
              const mode = agentModeIn(dir, chatId, a.id) ?? "off";
              return (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar person={personOf(dir, a.id)} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {a.name} <span className="font-normal text-muted-foreground">@{a.handle}</span>
                    </div>
                    <div className="truncate text-meta text-muted-foreground">{MODE_OPTIONS.find((o) => o.value === mode)?.hint}</div>
                  </div>
                  <select
                    aria-label={`${a.name} in #${meta.label}`}
                    value={mode}
                    disabled={!canEdit || busy === a.id}
                    onChange={(e) => set(a.id, e.target.value as AgentMode | "off")}
                    className="h-7 rounded-[4px] border border-input bg-background px-1.5 text-meta disabled:opacity-70"
                  >
                    {MODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          {error && <p role="alert" className="mt-3 text-meta text-destructive">{error}</p>}
          {canEdit && (
            <button type="button" onClick={() => setAdding(true)} className="mt-4 h-8 cursor-pointer rounded-md border border-input px-3 text-meta font-medium hover:bg-muted">
              + New agent
            </button>
          )}
        </DialogContent>
      </Dialog>
      <AgentDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
