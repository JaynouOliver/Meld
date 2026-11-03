import { after } from "next/server";

import * as api from "@/lib/api/service";
import type { ChatId } from "@/lib/types";
import { mentionsAgent } from "@/lib/text";
import { enqueueAtlas, processRun, sweepRuns } from "@/server/atlas/queue";
import { runAtlasAgent } from "@/server/atlas/run";
import { llm } from "@/server/llm";
import { pingChanges } from "@/server/realtime";

// Atlas runs after the response (after()), within this function's time limit. Long
// runs (e.g. turning a thread into tickets) can take a minute or more.
export const maxDuration = 300;

/**
 * RPC endpoint behind src/lib/api/remote.ts: each method is the same function the
 * browser preview runs locally, executed here against the shared store (Supabase).
 * After a change, every open browser gets a realtime ping to refetch.
 *
 * Demo note: the caller's role arrives in the request. With real auth it must come
 * from the session instead.
 */
type Method = (...args: never[]) => Promise<unknown>;
const methods: Record<string, Method> = {
  getMessages: api.getMessages,
  getTickets: api.getTickets,
  getWeekActivity: api.getWeekActivity,
  // An @Atlas message enqueues a run in the same request; it runs once the response is
  // sent and the reply arrives over realtime. Without a model, the browser calls the
  // rule-based askAtlas instead (no runId).
  postMessage: async (input: api.PostMessageInput) => {
    const saved = await api.postMessage(input);
    if (!llm() || !mentionsAgent(input.text, input.chatId)) return saved;
    const run = await enqueueAtlas({ ...input, role: input.role ?? "member", triggerMessageId: saved.id });
    after(() => processRun(run.id));
    return { ...saved, runId: run.id };
  },
  getAgentRuns: async () => {
    const runs = await api.getAgentRuns();
    // Self-healing: if a run was missed or its worker died, polling browsers restart it.
    if (runs.some((r) => r.status === "queued" || r.status === "running")) after(() => sweepRuns());
    return runs;
  },
  teammateReply: api.teammateReply,
  createTicket: api.createTicket,
  updateTicket: api.updateTicket,
  deleteTicket: api.deleteTicket,
  resetWorkspace: api.resetWorkspace,
  decideAction: api.decideAction,
  askAtlas: async (input: api.AskAtlasInput) => {
    if (!llm()) return api.askAtlas(input);
    const { trace, ...result } = await runAtlasAgent(input);
    void trace;
    return result;
  },
};

/** Which chats / data a call changed, for the realtime ping. */
function changes(method: string, args: unknown[], result: unknown): { chats: ChatId[]; tickets: boolean; runs?: boolean } {
  const a0 = args[0] as Record<string, unknown> | string | undefined;
  switch (method) {
    case "postMessage":
      return { chats: [(a0 as { chatId: ChatId }).chatId], tickets: false, runs: !!(result as api.PostedMessage).runId };
    case "teammateReply":
      return { chats: [a0 as ChatId], tickets: false };
    case "askAtlas":
      return { chats: (result as api.AskAtlasResult).touchedChats, tickets: true };
    case "createTicket":
    case "deleteTicket":
      return { chats: [], tickets: true };
    case "updateTicket": {
      const b = (result as api.UpdateTicketResult).broadcastChat;
      return { chats: b ? [b] : [], tickets: true };
    }
    case "decideAction":
      return { chats: (result as api.DecideActionResult).chats, tickets: true };
    case "resetWorkspace":
      return { chats: ["general", "design", "payments", "platform", "aiko", "ravi", "atlas"], tickets: true };
    default:
      return { chats: [], tickets: false };
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ method: string }> }) {
  const { method } = await params;
  const fn = methods[method];
  if (!fn) return Response.json({ error: `Unknown method ${method}` }, { status: 404 });
  const { args = [] } = (await req.json().catch(() => ({}))) as { args?: unknown[] };
  try {
    const result = await fn(...(args as never[]));
    const changed = changes(method, args, result);
    // Tell other browsers after the response is sent, so the caller isn't kept waiting.
    const origin = req.headers.get("x-meld-client");
    after(() => pingChanges({ ...changed, origin }));
    return Response.json({ result: result ?? null });
  } catch (e) {
    const status = e instanceof api.ApiError ? e.status : 500;
    if (status === 500) console.error(`[rpc] ${method} failed:`, e);
    return Response.json({ error: (e as Error).message }, { status });
  }
}
