import "server-only";

import type { ChatId } from "@/lib/types";

/** One broadcast topic per workspace, so pings only reach its members' browsers. */
export const realtimeTopic = (workspaceId: string) => `meld-ws-${workspaceId}`;

export interface ChangePing {
  /** Chats that got new messages. */
  chats: ChatId[];
  /** Ticket data (or the activity chart) changed. */
  tickets: boolean;
  /** Atlas runs changed (queued, started or finished). */
  runs?: boolean;
  /** Members, channels or workspace settings changed: refetch the directory. */
  directory?: boolean;
  workspaceId: string;
  /** Browser tab that caused the change, so it can ignore its own ping. */
  origin: string | null;
}

/**
 * Tell every open browser what changed, via Supabase Realtime broadcast. The ping
 * carries no data: browsers refetch through the API, which applies roles.
 */
export async function pingChanges(ping: ChangePing) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || (!ping.chats.length && !ping.tickets && !ping.runs && !ping.directory)) return;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: realtimeTopic(ping.workspaceId), event: "changed", payload: ping }] }),
    });
    if (!res.ok) console.error(`[realtime] broadcast failed: ${res.status} ${await res.text()}`);
  } catch (e) {
    // Realtime is best-effort: the app still works, others just refresh later.
    console.error("[realtime] broadcast error", (e as Error).message);
  }
}
