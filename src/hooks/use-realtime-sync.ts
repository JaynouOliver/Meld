"use client";

import { createClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { CLIENT_ID } from "@/lib/api/remote";
import { displayTime } from "@/lib/format";
import type { ChatId, Message, ReplyNode } from "@/lib/types";
import { insertMessage } from "./use-messages";
import { setRunProgress } from "./use-run-progress";
import { useUiStore } from "@/stores/ui-store";
import { useActiveChat } from "./use-active-chat";
import { useDirectory } from "./use-directory";
import { queryKeys } from "./query-keys";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// One topic per workspace; matches realtimeTopic() in src/server/realtime.ts.
const topic = (workspaceId: string) => `meld-ws-${workspaceId}`;

/**
 * Live updates between teammates: the server broadcasts "what changed" pings over
 * Supabase Realtime. New messages come with the ping and are added straight to the
 * cache; anything else is refetched.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();
  const active = useActiveChat();
  const workspaceId = useDirectory().workspace.id;

  useEffect(() => {
    if (!URL || !KEY || process.env.NEXT_PUBLIC_DATA_MODE === "local") return;
    const sb = createClient(URL, KEY, { auth: { persistSession: false } });
    const channel = sb
      .channel(topic(workspaceId))
      // Atlas's live progress: current step and the reply as it streams.
      .on("broadcast", { event: "run" }, ({ payload }) => {
        const p = payload as { runId: string; step: string | null; draft: string | null; note: string | null };
        setRunProgress(p.runId, { step: p.step, draft: p.draft, note: p.note });
      })
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        const ping = payload as {
          chats: ChatId[]; tickets: boolean; runs?: boolean; directory?: boolean; missions?: boolean; decisions?: boolean; origin: string | null; quiet?: boolean;
          message?: { chatId: ChatId; threadId: string | null; message: Message | ReplyNode };
        };
        // Someone's Atlas run was queued, started or finished.
        if (ping.runs) qc.invalidateQueries({ queryKey: queryKeys.agentRuns });
        // Members, channels or workspace settings changed (by anyone, this tab included).
        if (ping.directory) qc.invalidateQueries({ queryKey: queryKeys.directory });
        // Mission plans, check-ins and decisions (anyone's, this tab's included).
        if (ping.missions) {
          qc.invalidateQueries({ queryKey: queryKeys.missions });
          qc.invalidateQueries({ queryKey: queryKeys.decisions });
        }
        // The team's decision memory (logged, flagged, reopened).
        if (ping.decisions || ping.missions) qc.invalidateQueries({ queryKey: queryKeys.teamDecisions });
        if (ping.origin === CLIENT_ID) return; // our own change: mutations already handled it
        // A new message rides along with the ping: add it directly, no refetch.
        const live = ping.message;
        if (live) {
          const key = queryKeys.messages(live.chatId);
          const node = { ...live.message, time: displayTime(live.message.time) };
          if (qc.getQueryData(key)) {
            qc.setQueryData<Message[]>(key, (old) => (has(old, node.id) ? old : insertMessage(old ?? [], node, live.threadId)));
          }
        }
        for (const chat of ping.chats) {
          if (!live || live.chatId !== chat) qc.invalidateQueries({ queryKey: queryKeys.messages(chat) });
          if (!ping.quiet && chat !== useUiStore.getState().activeChatForUnread) useUiStore.getState().bumpUnread(chat);
        }
        if (ping.tickets) {
          qc.invalidateQueries({ queryKey: queryKeys.tickets });
          qc.invalidateQueries({ queryKey: queryKeys.week });
        }
      })
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [qc, workspaceId]);

  // Keep the store's idea of the open chat current for the handler above.
  useEffect(() => {
    useUiStore.setState({ activeChatForUnread: active });
  }, [active]);
}

const has = (list: Message[] | undefined, id: string) => !!list?.some((m) => m.id === id || m.replies.some((r) => r.id === id));
