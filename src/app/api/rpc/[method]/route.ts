import { after } from "next/server";

import type { SessionUser } from "@/lib/auth/shared";
import { currentCtx, type RequestCtx } from "@/lib/context";
import * as api from "@/lib/api/service";
import { atlasDmOf } from "@/lib/directory";
import { mentionsAgent } from "@/lib/text";
import type { ChatId, Role } from "@/lib/types";
import { enqueueAtlas, processRun, sweepRuns } from "@/server/atlas/queue";
import { runAtlasAgent } from "@/server/atlas/run";
import { getSessionUser } from "@/server/auth";
import { runInCtx } from "@/server/context";
import { llm } from "@/server/llm";
import { pingChanges } from "@/server/realtime";
import * as ws from "@/server/workspace";

// Atlas runs after the response (after()), within this function's time limit. Long
// runs (e.g. turning a thread into tickets) can take a minute or more.
export const maxDuration = 300;

/**
 * RPC endpoint behind src/lib/api/remote.ts. Identity comes from the session cookie;
 * the workspace from the person's membership (active-workspace cookie). Each call runs
 * inside that workspace's context, so data access is scoped to it. After a change,
 * every open browser in the workspace gets a realtime ping to refetch.
 */
type Method = (...args: never[]) => Promise<unknown>;

/** Calls that run inside the caller's active workspace. */
const methods: Record<string, Method> = {
  getMessages: api.getMessages,
  getTickets: api.getTickets,
  getWeekActivity: api.getWeekActivity,
  // An @Atlas message enqueues a run in the same request; it runs once the response is
  // sent and the reply arrives over realtime. Without a model, the browser calls the
  // rule-based askAtlas instead (no runId).
  postMessage: async (input: api.PostMessageInput) => {
    const saved = await api.postMessage(input);
    if (!llm() || !mentionsAgent(input.text, input.chatId, atlasDmOf(currentCtx().dir))) return saved;
    const run = await enqueueAtlas({ ...input, role: api.effectiveRole(input.role), triggerMessageId: saved.id });
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
    const role = api.effectiveRole(input.role);
    if (!llm()) return api.askAtlas({ ...input, role });
    const { trace, ...result } = await runAtlasAgent({ ...input, role });
    void trace;
    return result;
  },
  createInvite: async (role: Role) => ws.createInvite(currentCtx(), role),
  listInvites: async () => ws.listInvites(currentCtx()),
  revokeInvite: async (token: string) => ws.revokeInvite(currentCtx(), token),
  updateMember: async (input: Parameters<typeof ws.updateMember>[1]) => ws.updateMember(currentCtx(), input),
  removeMember: async (userId: string) => ws.removeMember(currentCtx(), userId),
  updateWorkspace: async (input: Parameters<typeof ws.updateWorkspaceSettings>[1]) => ws.updateWorkspaceSettings(currentCtx(), input),
  createChannel: async (input: Parameters<typeof ws.createChannel>[1]) => ws.createChannel(currentCtx(), input),
  updateChannel: async (input: Parameters<typeof ws.updateChannel>[1]) => ws.updateChannel(currentCtx(), input),
  deleteChannel: async (id: string) => ws.deleteChannel(currentCtx(), id),
  openDm: async (userId: string) => ws.openDm(currentCtx(), userId),
};

/** Calls that don't need a workspace (loading the directory, onboarding, joining). */
const accountMethods: Record<string, (user: SessionUser, ...args: never[]) => Promise<unknown>> = {
  getDirectory: async (user) => {
    const ctx = await ws.contextFor(user);
    if (!ctx) {
      // First visit: make sure the profile exists for when they create or join one.
      await (await ws.registry()).upsertProfile({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl });
      return null;
    }
    return ctx.dir;
  },
  createWorkspace: async (user, input: ws.CreateWorkspaceInput) => ws.createWorkspace(user, input),
  switchWorkspace: async (user, id: string) => ws.switchWorkspace(user, id),
  acceptInvite: async (user, token: string) => ws.acceptInvite(user, token),
  suggestPrefix: async (_user, name: string) => ws.suggestPrefix(name),
};

/** Which chats / data a call changed, for the realtime ping. */
function changes(method: string, args: unknown[], result: unknown): { chats: ChatId[]; tickets: boolean; runs?: boolean; directory?: boolean } {
  const a0 = args[0] as Record<string, unknown> | string | undefined;
  switch (method) {
    case "postMessage":
      return { chats: [(a0 as { chatId: ChatId }).chatId], tickets: false, runs: !!(result as api.PostedMessage).runId };
    case "teammateReply":
      return { chats: [a0 as ChatId], tickets: false };
    case "askAtlas":
      return { chats: (result as api.AskAtlasResult).touchedChats, tickets: true };
    case "createTicket":
      return { chats: [], tickets: true };
    case "deleteTicket":
      return { chats: (result as { notified: ChatId[] }).notified, tickets: true };
    case "updateTicket": {
      const r = result as api.UpdateTicketResult;
      return { chats: [...(r.broadcastChat ? [r.broadcastChat] : []), ...r.notified], tickets: true };
    }
    case "decideAction":
      return { chats: (result as api.DecideActionResult).chats, tickets: true };
    case "resetWorkspace":
      return { chats: currentCtx().dir.channels.concat(currentCtx().dir.dms), tickets: true };
    case "updateMember":
    case "removeMember":
    case "updateWorkspace":
    case "createChannel":
    case "updateChannel":
    case "deleteChannel":
    case "openDm":
      return { chats: [], tickets: false, directory: true };
    default:
      return { chats: [], tickets: false };
  }
}

function errorResponse(method: string, e: unknown) {
  const status = e instanceof api.ApiError || e instanceof ws.WorkspaceError ? (e as { status: number }).status : 500;
  if (status === 500) console.error(`[rpc] ${method} failed:`, e);
  return Response.json({ error: (e as Error).message }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ method: string }> }) {
  const { method } = await params;
  const fn = methods[method];
  const accountFn = accountMethods[method];
  if (!fn && !accountFn) return Response.json({ error: `Unknown method ${method}` }, { status: 404 });
  // Every call needs a signed-in user (Supabase session, or the dev cookie locally).
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { args = [] } = (await req.json().catch(() => ({}))) as { args?: unknown[] };

  if (accountFn) {
    try {
      return Response.json({ result: (await accountFn(user, ...(args as never[]))) ?? null });
    } catch (e) {
      return errorResponse(method, e);
    }
  }

  let ctx: RequestCtx | null;
  try {
    ctx = await ws.contextFor(user);
  } catch (e) {
    return errorResponse(method, e);
  }
  if (!ctx) return Response.json({ error: "Create or join a workspace first" }, { status: 409 });
  const origin = req.headers.get("x-meld-client");
  return runInCtx(ctx, async () => {
    try {
      const result = await fn(...(args as never[]));
      const changed = changes(method, args, result);
      // Tell the workspace's other browsers after the response is sent.
      after(() => pingChanges({ ...changed, origin, workspaceId: ctx.dir.workspace.id }));
      return Response.json({ result: result ?? null });
    } catch (e) {
      return errorResponse(method, e);
    }
  });
}
