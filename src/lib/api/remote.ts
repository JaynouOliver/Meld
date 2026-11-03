/**
 * Remote implementation of the app API: every call is an RPC to /api/rpc/<method>,
 * which runs the same function server-side (see src/app/api/rpc/[method]/route.ts).
 */
import { displayTime } from "../format";
import type { Message, ReplyNode, Ticket } from "../types";
import type * as Local from "./service";

/** Identifies this browser tab, so realtime pings it caused can be ignored. */
export const CLIENT_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

async function rpc<T>(method: string, args: unknown[]): Promise<T> {
  const res = await fetch(`/api/rpc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-meld-client": CLIENT_ID },
    body: JSON.stringify({ args }),
  });
  if (res.status === 401 && typeof window !== "undefined") {
    // Session ended: sign in again, then come back here.
    // Full page load on purpose: drops every cached query from the old session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${method} failed (${res.status})`);
  return body.result as T;
}

type Fn<K extends keyof typeof Local> = (typeof Local)[K] extends (...a: infer A) => infer R ? (...a: A) => R : never;
const call =
  <K extends keyof typeof Local>(name: K): Fn<K> =>
  ((...args: unknown[]) => rpc(name as string, args)) as Fn<K>;

// The server stores ISO times; show them in the viewer's local time.
const localReply = (n: ReplyNode): ReplyNode => ({ ...n, time: displayTime(n.time) });
const localMessage = (m: Message): Message => ({ ...m, time: displayTime(m.time), replies: m.replies.map(localReply) });
const localTicket = (t: Ticket): Ticket => ({ ...t, activity: t.activity.map((a) => ({ ...a, time: displayTime(a.time) })) });

const getMessagesRaw = call("getMessages");
const getTicketsRaw = call("getTickets");
export const getMessages: typeof getMessagesRaw = async (...a) => (await getMessagesRaw(...a)).map(localMessage);
export const getTickets: typeof getTicketsRaw = async () => (await getTicketsRaw()).map(localTicket);
export const getWeekActivity = call("getWeekActivity");
export const postMessage = call("postMessage");
export const askAtlas = call("askAtlas");
export const teammateReply = call("teammateReply");
const createTicketRaw = call("createTicket");
export const createTicket: typeof createTicketRaw = async (...a) => localTicket(await createTicketRaw(...a));
const updateTicketRaw = call("updateTicket");
export const updateTicket: typeof updateTicketRaw = async (...a) => {
  const r = await updateTicketRaw(...a);
  return { ...r, ticket: localTicket(r.ticket) };
};
export const deleteTicket = call("deleteTicket");
export const resetWorkspace = call("resetWorkspace");
export const decideAction = call("decideAction");
export const getAgentRuns = call("getAgentRuns");
