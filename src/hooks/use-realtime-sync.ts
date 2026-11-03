"use client";

import { createClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { CLIENT_ID } from "@/lib/api/remote";
import type { ChatId } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { useActiveChat } from "./use-active-chat";
import { queryKeys } from "./query-keys";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TOPIC = "meld-workspace"; // matches src/server/realtime.ts

/**
 * Live updates between teammates: the server broadcasts "what changed" pings over
 * Supabase Realtime, and this refetches those chats/tickets. Pings carry no data.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();
  const active = useActiveChat();

  useEffect(() => {
    if (!URL || !KEY || process.env.NEXT_PUBLIC_DATA_MODE === "local") return;
    const sb = createClient(URL, KEY, { auth: { persistSession: false } });
    const channel = sb
      .channel(TOPIC)
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        const ping = payload as { chats: ChatId[]; tickets: boolean; runs?: boolean; origin: string | null };
        // Someone's Atlas run was queued, started or finished.
        if (ping.runs) qc.invalidateQueries({ queryKey: queryKeys.agentRuns });
        if (ping.origin === CLIENT_ID) return; // our own change: mutations already handled it
        for (const chat of ping.chats) {
          qc.invalidateQueries({ queryKey: queryKeys.messages(chat) });
          if (chat !== useUiStore.getState().activeChatForUnread) useUiStore.getState().bumpUnread(chat);
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
  }, [qc]);

  // Keep the store's idea of the open chat current for the handler above.
  useEffect(() => {
    useUiStore.setState({ activeChatForUnread: active });
  }, [active]);
}
