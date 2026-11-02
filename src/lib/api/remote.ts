/**
 * Remote implementation of the app API: every call is an RPC to /api/rpc/<method>,
 * which runs the same function server-side (see src/app/api/rpc/[method]/route.ts).
 */
import type * as Local from "./local";

async function rpc<T>(method: string, args: unknown[]): Promise<T> {
  const res = await fetch(`/api/rpc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ args }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${method} failed (${res.status})`);
  return body.result as T;
}

type Fn<K extends keyof typeof Local> = (typeof Local)[K] extends (...a: infer A) => infer R ? (...a: A) => R : never;
const call =
  <K extends keyof typeof Local>(name: K): Fn<K> =>
  ((...args: unknown[]) => rpc(name as string, args)) as Fn<K>;

export const getMessages = call("getMessages");
export const getTickets = call("getTickets");
export const getWeekActivity = call("getWeekActivity");
export const postMessage = call("postMessage");
export const askAtlas = call("askAtlas");
export const teammateReply = call("teammateReply");
export const createTicket = call("createTicket");
export const updateTicket = call("updateTicket");
export const deleteTicket = call("deleteTicket");
