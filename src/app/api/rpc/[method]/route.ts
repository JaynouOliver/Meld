import { after } from "next/server";

import type { SessionUser } from "@/lib/auth/shared";
import { currentCtx, type RequestCtx } from "@/lib/context";
import * as api from "@/lib/api/service";
import type { ChatId, Role } from "@/lib/types";
import { progressOf } from "@/server/atlas/progress";
import { toRunView } from "@/lib/agent/runs";
import { dispatch, runsWeExecute } from "@/server/agents/dispatch";
import { processRun, sweepRuns } from "@/server/atlas/queue";
import { runAtlasAgent } from "@/server/atlas/run";
import { getSessionUser } from "@/server/auth";
import { runInCtx } from "@/server/context";
import { llm } from "@/server/llm";
import { pingChanges } from "@/server/realtime";
import * as missions from "@/server/missions";
import { listen, shouldListen } from "@/server/listener";
import * as teamDecisions from "@/server/listener/decisions";
import * as ws from "@/server/workspace";
import * as agentMemory from "@/server/agents/memory";
import * as summary from "@/server/atlas/summary";
import * as meetingNotes from "@/server/notes";
import * as scheduled from "@/server/scheduled";
import * as followUps from "@/server/proactive/followups";
import * as playbooks from "@/server/automation/playbooks";
import { undoTriage } from "@/server/automation/triage";

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
  markRead: api.markRead,
  editMessage: api.editMessage,
  deleteMessage: api.deleteMessage,
  pinMessage: api.pinMessage,
  getPinned: api.getPinned,
  toggleReaction: api.toggleReaction,
  searchMessages: api.searchMessages,
  // An @Atlas message enqueues a run in the same request; it runs once the response is
  // sent and the reply arrives over realtime. Without a model, the browser calls the
  // rule-based askAtlas instead (no runId).
  // Agents that should look at the message (mentioned, the DM's agent, lurk/active
  // channel agents) get a run in their inbox, in the same request; they run once the
  // response is sent and their replies arrive over realtime. Without a model, the
  // browser calls the rule-based askAtlas instead (no runs).
  postMessage: async (input: api.PostMessageInput) => {
    const saved = await api.postMessage(input);
    // Activity is when due reminders and the morning digest go out (src/server/scheduled).
    after(() => scheduled.sweepQuietly());
    // Free, with or without a model: does it answer a tracked question? Now and then, follow up on due ones.
    const said = { chatId: input.chatId, threadId: input.threadId ?? null, messageId: saved.id, authorId: currentCtx().dir.me };
    after(() => followUps.afterHumanMessage(said));
    if (!llm()) return saved;
    const runs = await dispatch({
      chatId: input.chatId, threadId: input.threadId ?? null, messageId: saved.id, authorId: currentCtx().dir.me,
      text: saved.text, role: api.effectiveRole(input.role),
    });
    const ours = runsWeExecute(runs);
    if (ours.length) after(() => Promise.all(ours.map((r) => processRun(r.id))));
    // The listener reads every message from a person once, after the response is sent.
    const heard = { chatId: input.chatId, threadId: input.threadId ?? null, messageId: saved.id, authorId: currentCtx().dir.me, text: saved.text, role: api.effectiveRole(input.role) };
    if (shouldListen(heard)) after(() => listen(heard).catch((e) => console.error("[listener] failed:", e)));
    return { ...saved, runs: runs.map(toRunView) };
  },
  getAgentRuns: async () => {
    // Live step / draft from this process, for browsers without realtime.
    const runs = (await api.getAgentRuns()).map((r) => ({ ...r, ...(progressOf(r.id) ?? {}) }));
    // Self-healing: if a run was missed or its worker died, polling browsers restart it.
    if (runs.some((r) => r.status === "queued" || r.status === "running")) after(() => sweepRuns());
    after(() => scheduled.sweepQuietly());
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
  listMissions: async () => missions.listMissions(),
  getMission: async (id: string) => missions.getMission(id),
  openDecisions: async () => missions.openDecisions(),
  createMission: async (input: Parameters<typeof missions.createMission>[0]) => missions.createMission(input),
  launchMission: async (id: string, role?: string) => missions.launchMission(id, role),
  cancelMission: async (id: string) => missions.cancelMission(id),
  checkInMission: async (id: string, role?: string) => missions.checkInMission(id, role),
  answerDecision: async (decisionId: string, answer: string, role?: string) => missions.answerDecision(decisionId, answer, role),
  listTeamDecisions: async () => teamDecisions.listTeamDecisions(),
  setTeamDecisionStatus: async (id: string, status: "active" | "reopened", role?: string) => teamDecisions.setTeamDecisionStatus(id, status, role),
  createAgent: async (input: ws.AgentInput) => ws.createAgent(currentCtx(), input),
  updateAgent: async (input: ws.AgentInput & { id: string }) => ws.updateAgent(currentCtx(), input),
  deleteAgent: async (id: string) => ws.deleteAgent(currentCtx(), id),
  rotateAgentToken: async (id: string) => ws.rotateAgentToken(currentCtx(), id),
  setChannelAgent: async (input: Parameters<typeof ws.setChannelAgent>[1]) => ws.setChannelAgent(currentCtx(), input),
  // Agent skills: memory (agent dialog) and thread summaries.
  listAgentMemories: async (agentId: string) => agentMemory.listAgentMemories(agentId),
  forgetAgentMemory: async (id: string, role?: Role) => agentMemory.forgetMemory(id, role),
  summarizeThread: async (chatId: ChatId, threadId: string, role?: Role) => summary.summarizeThread(chatId, threadId, role),
  // Meeting notes to actions: queued as an Atlas run in the channel.
  queueMeetingNotes: async (input: Parameters<typeof meetingNotes.queueMeetingNotes>[0]) => meetingNotes.queueMeetingNotes(input),
  // Scheduled work: reminders (You screen, "Remind me about this") and Sunny's digest.
  deliverDue: async (timeZone?: string) => scheduled.deliverDue(timeZone),
  listReminders: async () => scheduled.listMyReminders(),
  createReminder: async (input: scheduled.CreateReminderInput) => scheduled.createReminder({ ...input, role: api.effectiveRole(input.role) }),
  cancelReminder: async (id: string, role?: Role) => scheduled.cancelReminder(id, api.effectiveRole(role)),
  postDigestNow: async (chatId: ChatId) => scheduled.postDigest(chatId, { force: true }),
  // Proactive Atlas: follow up on open questions now (Atlas's profile card).
  checkFollowUps: async (role?: Role) => followUps.checkFollowUps(role),
  // Workflow automation: playbooks, and the ticket panel's triage note and playbook runs.
  listPlaybooks: async () => playbooks.listPlaybooks(),
  savePlaybook: async (input: import("@/lib/automation").PlaybookInput, role?: Role) => playbooks.savePlaybook(input, role),
  setPlaybookEnabled: async (id: string, enabled: boolean, role?: Role) => playbooks.setPlaybookEnabled(id, enabled, role),
  deletePlaybook: async (id: string, role?: Role) => playbooks.deletePlaybook(id, role),
  ticketAutomation: async (ticketId: string, role?: Role) => playbooks.ticketAutomation(ticketId, role),
  undoTriage: async (ticketId: string, role?: Role) => undoTriage(ticketId, role),
  // Jump to old messages, and load older/newer history (read-only).
  getMessagesAround: api.getMessagesAround,
};

/** Calls that don't need a workspace (loading the directory, onboarding, joining). */
const accountMethods: Record<string, (user: SessionUser, ...args: never[]) => Promise<unknown>> = {
  getDirectory: async (user) => {
    const ctx = await ws.contextFor(user, { fresh: true });
    if (!ctx) {
      // First visit: make sure the profile exists for when they create or join one.
      await (await ws.registry()).upsertProfile({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl });
      return null;
    }
    return ctx.dir;
  },
  // Everything the app needs to start, in one round trip (like Slack's boot payload):
  // the directory, tickets, this week's activity and every chat's messages.
  getBoot: async (user) => {
    const ctx = await ws.contextFor(user, { fresh: true });
    if (!ctx) {
      await (await ws.registry()).upsertProfile({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl });
      return { directory: null };
    }
    return runInCtx(ctx, async () => {
      const chats = [...ctx.dir.channels, ...ctx.dir.dms].slice(0, 30);
      const [tickets, week, lists] = await Promise.all([
        api.getTickets(),
        api.getWeekActivity(),
        Promise.all(chats.map((c) => api.getMessages(c, 30).catch(() => null))),
      ]);
      const messages = Object.fromEntries(chats.map((c, i) => [c, lists[i]]).filter(([, l]) => l));
      return { directory: ctx.dir, tickets, week, messages };
    });
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
    case "summarizeThread":
    case "queueMeetingNotes":
      return { chats: [], tickets: false, runs: true };
    case "postMessage":
      return { chats: [(a0 as { chatId: ChatId }).chatId], tickets: false, runs: !!(result as api.PostedMessage).runs?.length };
    // Edits, deletes, pins and reactions: the chat refetches, but it isn't new activity.
    case "editMessage":
    case "deleteMessage":
    case "pinMessage":
    case "toggleReaction": {
      const quiet = { chats: [(result as api.MessageChange).chatId], tickets: false, quiet: true };
      return quiet;
    }
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
    case "createAgent":
    case "updateAgent":
    case "deleteAgent":
    case "setChannelAgent":
      return { chats: [], tickets: false, directory: true };
    case "undoTriage":
      return { chats: (result as { chats: ChatId[] }).chats, tickets: true };
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
      const result = await accountFn(user, ...(args as never[]));
      // Joining, creating or switching workspaces changes what this person's directory holds.
      if (!["getDirectory", "getBoot", "suggestPrefix"].includes(method)) ws.forgetDirectories();
      // Someone joined: everyone already in the workspace refreshes their member list.
      if (method === "acceptInvite") {
        const { workspaceId } = result as { workspaceId: string };
        after(() => pingChanges({ chats: [], tickets: false, directory: true, origin: null, workspaceId }));
      }
      return Response.json({ result: result ?? null });
    } catch (e) {
      return errorResponse(method, e);
    }
  }

  const origin = req.headers.get("x-meld-client");
  const STALE = Symbol("stale directory");
  const attempt = async (fresh: boolean): Promise<Response | typeof STALE> => {
    let ctx: RequestCtx | null;
    try {
      ctx = await ws.contextFor(user, { fresh });
    } catch (e) {
      return errorResponse(method, e);
    }
    if (!ctx) return Response.json({ error: "Create or join a workspace first" }, { status: 409 });
    return runInCtx(ctx, async () => {
      try {
        const result = await fn(...(args as never[]));
        const changed = changes(method, args, result);
        if (changed.directory) ws.forgetDirectories();
        // Tell the workspace's other browsers after the response is sent.
        after(() => pingChanges({ ...changed, origin, workspaceId: ctx.dir.workspace.id, ...livePayload(method, args, result) }));
        return Response.json({ result: result ?? null });
      } catch (e) {
        // A chat created moments ago on another server instance: rebuild and try once more.
        if (!fresh && e instanceof api.ApiError && e.status === 404) return STALE;
        return errorResponse(method, e);
      }
    });
  };
  const res = await attempt(false);
  return res === STALE ? ((await attempt(true)) as Response) : res;
}

/** New messages ride along with the realtime ping, so other browsers add them without a refetch. */
function livePayload(method: string, args: unknown[], result: unknown) {
  if (method !== "postMessage") return {};
  const input = args[0] as api.PostMessageInput;
  const { runs: _r, ...message } = result as api.PostedMessage;
  void _r;
  return { message: { chatId: input.chatId, threadId: input.threadId ?? null, message } };
}
