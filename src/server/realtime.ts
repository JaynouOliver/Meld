import "server-only";

import type { ChatId } from "@/lib/types";

export const REALTIME_TOPIC = "meld-workspace";

export interface ChangePing {
  /** Chats that got new messages. */
  chats: ChatId[];
  /** Ticket data (or the activity chart) changed. */
  tickets: boolean;
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
  if (!url || !key || (!ping.chats.length && !ping.tickets)) return;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: REALTIME_TOPIC, event: "changed", payload: ping }] }),
    });
    if (!res.ok) console.error(`[realtime] broadcast failed: ${res.status} ${await res.text()}`);
  } catch (e) {
    // Realtime is best-effort: the app still works, others just refresh later.
    console.error("[realtime] broadcast error", (e as Error).message);
  }
}
