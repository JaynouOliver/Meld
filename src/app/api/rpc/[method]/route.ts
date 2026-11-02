import * as api from "@/lib/api/local";
import { runAtlasAgent } from "@/server/atlas/run";
import { llm } from "@/server/llm";

/**
 * RPC endpoint behind src/lib/api/remote.ts. Each method is the same function the
 * browser preview runs locally, executed here against the server's db; Atlas runs on
 * Meta's Model API when MODEL_API_KEY is set, else falls back to the rule-based agent.
 *
 * Demo note: the caller's role arrives in the request. With real auth it must come
 * from the session instead.
 */
const methods: Record<string, (...args: never[]) => Promise<unknown>> = {
  getMessages: api.getMessages,
  getTickets: api.getTickets,
  getWeekActivity: api.getWeekActivity,
  postMessage: api.postMessage,
  teammateReply: api.teammateReply,
  createTicket: api.createTicket,
  updateTicket: api.updateTicket,
  deleteTicket: api.deleteTicket,
  askAtlas: async (input: api.AskAtlasInput) => {
    if (!llm()) return api.askAtlas(input);
    const { trace, ...result } = await runAtlasAgent(input);
    void trace;
    return result;
  },
};

export async function POST(req: Request, { params }: { params: Promise<{ method: string }> }) {
  const { method } = await params;
  const fn = methods[method];
  if (!fn) return Response.json({ error: `Unknown method ${method}` }, { status: 404 });
  const { args = [] } = (await req.json().catch(() => ({}))) as { args?: unknown[] };
  try {
    const result = await fn(...(args as never[]));
    return Response.json({ result: result ?? null });
  } catch (e) {
    const status = e instanceof api.ApiError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
