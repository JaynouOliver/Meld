/**
 * Remote implementation of the app API: every call is an RPC to /api/rpc/<method>,
 * which runs the same function server-side (see src/app/api/rpc/[method]/route.ts).
 */
import { displayTime } from "../format";
import type { Decision, Mission, MissionView } from "../missions";
import type { TeamDecision } from "../team-decisions";
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
export const getDirectory = call("getDirectory");
export const markRead = call("markRead");
export const editMessage = call("editMessage");
export const deleteMessage = call("deleteMessage");
export const pinMessage = call("pinMessage");
const getPinnedRaw = call("getPinned");
export const getPinned: typeof getPinnedRaw = async (...a) => (await getPinnedRaw(...a)).map((h) => ({ ...h, time: displayTime(h.time) }));
export const toggleReaction = call("toggleReaction");
const searchMessagesRaw = call("searchMessages");
export const searchMessages: typeof searchMessagesRaw = async (...a) => (await searchMessagesRaw(...a)).map((h) => ({ ...h, time: displayTime(h.time) }));

/** Everything the app needs to start, in one round trip (directory, tickets, week, every chat's messages). */
export async function getBoot() {
  const r = await rpc<Awaited<ReturnType<typeof Local.getBoot>>>("getBoot", []);
  if (!r.directory) return r;
  return {
    ...r,
    tickets: r.tickets?.map(localTicket),
    messages: r.messages && Object.fromEntries(Object.entries(r.messages).map(([c, list]) => [c, list.map(localMessage)])),
  };
}

// Accounts and workspaces (server only; see src/server/workspace.ts).
type Invite = { token: string; role: import("../types").Role; expiresAt: string };
export const createWorkspace = (input: { name: string; ticketPrefix?: string; teams?: string[] }) =>
  rpc<{ workspaceId: string; home: string }>("createWorkspace", [input]);
export const switchWorkspace = (id: string) => rpc<void>("switchWorkspace", [id]);
export const acceptInvite = (token: string) => rpc<{ workspaceId: string }>("acceptInvite", [token]);
export const suggestPrefix = (name: string) => rpc<string>("suggestPrefix", [name]);
export const createInvite = (role: import("../types").Role) => rpc<Invite>("createInvite", [role]);
export const listInvites = () => rpc<Invite[]>("listInvites", []);
export const revokeInvite = (token: string) => rpc<void>("revokeInvite", [token]);
export const updateMember = (input: { userId: string; role?: import("../types").Role; team?: string | null; title?: string | null }) =>
  rpc<void>("updateMember", [input]);
export const removeMember = (userId: string) => rpc<void>("removeMember", [userId]);
export const createChannel = (input: { name: string; topic?: string; team?: string | null }) =>
  rpc<{ id: string; name: string }>("createChannel", [input]);
export const updateChannel = (input: { id: string; name?: string; topic?: string }) => rpc<void>("updateChannel", [input]);
export const deleteChannel = (id: string) => rpc<{ home: string }>("deleteChannel", [id]);
export const openDm = (userId: string) => rpc<{ id: string }>("openDm", [userId]);
export interface AgentInput {
  kind?: "custom" | "external";
  name: string;
  handle?: string;
  description?: string;
  instructions?: string;
  tools?: ("read" | "write" | "delete")[];
}
export const createAgent = (input: AgentInput) => rpc<{ id: string; handle: string; token: string | null }>("createAgent", [input]);
export const rotateAgentToken = (id: string) => rpc<{ token: string }>("rotateAgentToken", [id]);
export const updateAgent = (input: AgentInput & { id: string }) => rpc<void>("updateAgent", [input]);
export const deleteAgent = (id: string) => rpc<void>("deleteAgent", [id]);
export const setChannelAgent = (input: { chatId: string; agentId: string; mode: "mention" | "lurk" | "active" | "off" }) =>
  rpc<void>("setChannelAgent", [input]);
export const updateWorkspace = (input: { name?: string; teams?: string[]; repo?: string | null }) => rpc<void>("updateWorkspace", [input]);

// Missions (server only; see src/server/missions).
export type MissionSummary = Mission & { done: number; total: number; openDecisions: number };
const localView = (v: MissionView): MissionView => ({ ...v, tickets: v.tickets.map(localTicket) });
export const listMissions = () => rpc<MissionSummary[]>("listMissions", []);
export const getMission = async (id: string) => localView(await rpc<MissionView>("getMission", [id]));
export const openDecisions = () => rpc<(Decision & { missionTitle: string })[]>("openDecisions", []);
export const createMission = (input: { goal: string; deadline?: string | null; chatId: string; role?: string }) => rpc<Mission>("createMission", [input]);
export const launchMission = (id: string, role?: string) => rpc<Mission>("launchMission", [id, role]);
export const cancelMission = (id: string) => rpc<Mission>("cancelMission", [id]);
export const checkInMission = (id: string, role?: string) => rpc<{ summary: string }>("checkInMission", [id, role]);
export const listTeamDecisions = () => rpc<TeamDecision[]>("listTeamDecisions", []);
export const setTeamDecisionStatus = (id: string, status: "active" | "reopened", role?: string) => rpc<TeamDecision>("setTeamDecisionStatus", [id, status, role]);
export const answerDecision = (decisionId: string, answer: string, role?: string) => rpc<void>("answerDecision", [decisionId, answer, role]);

// Agent skills: memory and thread summaries.
export const listAgentMemories = (agentId: string) => rpc<import("../agent/memory").AgentMemory[]>("listAgentMemories", [agentId]);
export const forgetAgentMemory = (id: string, role?: string) => rpc<{ ok: true }>("forgetAgentMemory", [id, role]);
export const summarizeThread = (chatId: string, threadId: string, role?: string) => rpc<import("../agent/runs").RunView>("summarizeThread", [chatId, threadId, role]);

// Meeting notes to actions.
export const queueMeetingNotes = (input: { chatId: string; text: string; title?: string; role?: string }) =>
  rpc<import("../agent/runs").RunView>("queueMeetingNotes", [input]);
// Scheduled work: reminders and the daily digest (server only; see src/server/scheduled).
export type ReminderView = import("../scheduled").Reminder & { canCancel: boolean };
export interface NewReminder {
  when?: string | null;
  inMinutes?: number | null;
  text: string;
  target?: string | null;
  role?: import("../types").Role;
  source?: { chatId: string; threadId: string | null; messageId: string } | null;
  timeZone?: string | null;
}
export const deliverDue = (timeZone?: string) => rpc<{ chats: string[] }>("deliverDue", [timeZone]);
export const listReminders = () => rpc<ReminderView[]>("listReminders", []);
export const createReminder = (input: NewReminder) => rpc<{ when: string; to: string; zoneNote: string | null }>("createReminder", [input]);
export const cancelReminder = (id: string, role?: string) => rpc<{ ok: true }>("cancelReminder", [id, role]);
export const postDigestNow = (chatId: string) => rpc<{ messageId: string; text: string } | null>("postDigestNow", [chatId]);
