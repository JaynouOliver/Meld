import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { toView, type ActionRecord } from "../agent/actions";
import { RUN_MAX_ATTEMPTS, RUN_RECENT_MS, RUN_STALE_MS, type AgentRun } from "../agent/runs";
import { todayIndex } from "../format";
import type { Decision, Mission, MissionEvent } from "../missions";
import type { TeamDecision } from "../team-decisions";
import type { AgentMemory } from "../agent/memory";
import type { Reminder } from "../scheduled";
import type { OpenQuestion, ThreadLink } from "../proactive";
import { DEMO_WORKSPACE_ID } from "../mock/demo";
import { SEED_CHATS, SEED_TICKETS, SEED_WEEK } from "../mock/seed";
import type { ChatId, Message, PersonId, Ticket, WeekDay } from "../types";
import { automationSupabase } from "./automation-supabase";
import type { Store } from "./types";

/**
 * Postgres via supabase-js, using the service-role key. Server-only: the tables have
 * RLS on with no policies, so nothing else can read them.
 */
let client: SupabaseClient | null = null;
export function sb() {
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

interface TicketRow {
  id: string; team: Ticket["team"]; title: string; description: string; status: Ticket["status"];
  priority: Ticket["priority"]; assignee: PersonId; reporter: PersonId; links: Ticket["links"];
  images: Ticket["images"]; watch: Ticket["watch"]; activity: Ticket["activity"]; updated: string;
  blocked_by: string[];
  mission_id: string | null;
  due: string | null;
  labels: string[];
  estimate: number | string | null;
  checklist: NonNullable<Ticket["checklist"]>;
  comments: NonNullable<Ticket["comments"]>;
}
export const toRow = (t: Ticket): TicketRow => ({
  id: t.id, team: t.team, title: t.title, description: t.description, status: t.status, priority: t.priority,
  assignee: t.assignee, reporter: t.reporter, links: t.links, images: t.images, watch: t.watch,
  activity: t.activity, updated: t.updated, blocked_by: t.blockedBy ?? [], mission_id: t.missionId ?? null, due: t.due ?? null,
  labels: t.labels ?? [], estimate: t.estimate ?? null, checklist: t.checklist ?? [], comments: t.comments ?? [],
});
const fromRow = ({ blocked_by, mission_id, due, labels, estimate, checklist, comments, ...r }: TicketRow): Ticket => ({
  ...r, blockedBy: blocked_by ?? [], missionId: mission_id ?? null, due: due ?? null,
  // numeric can arrive as a string, depending on the client.
  labels: labels ?? [], estimate: estimate == null ? null : Number(estimate), checklist: checklist ?? [], comments: comments ?? [],
});

interface MessageRow {
  workspace_id?: string;
  id: string; chat_id: ChatId; thread_id: string | null; parent_id: string | null;
  who: PersonId; text: string; ticket_id: string | null; time_label: string; action_id?: string | null;
  reactions?: Record<string, string[]> | null;
  edited_at?: string | null; deleted_at?: string | null; pinned_at?: string | null; pinned_by?: string | null;
}

interface ActionRow {
  id: string; chat_id: ChatId; message_id: string | null; status: ActionRecord["status"]; ops: ActionRecord["ops"];
  summary: string[]; destructive: boolean; undo_until: string | null; created_at: string;
}
const actionFromRow = (r: ActionRow): ActionRecord => ({
  id: r.id, chatId: r.chat_id, messageId: r.message_id, status: r.status, ops: r.ops, summary: r.summary,
  destructive: r.destructive, undoUntil: r.undo_until, createdAt: r.created_at,
});

/** Rows (ordered by seq) back into the nested Message / ReplyNode tree the UI uses. */
interface RunRow {
  id: string; trigger_message_id: string; chat_id: ChatId; thread_id: string | null; requester: string; role: AgentRun["role"];
  agent_id: string; trigger: AgentRun["trigger"]; depth: number; parent_run_id: string | null;
  text: string; status: AgentRun["status"]; attempts: number; error: string | null; result: AgentRun["result"]; trace: unknown;
  created_at: string; started_at: string | null; finished_at: string | null;
}
const runFromRow = (r: RunRow): AgentRun => ({
  id: r.id, triggerMessageId: r.trigger_message_id, chatId: r.chat_id, threadId: r.thread_id, requester: r.requester, role: r.role,
  agentId: r.agent_id ?? "atlas", trigger: r.trigger ?? "mention", depth: r.depth ?? 0, parentRunId: r.parent_run_id ?? null,
  text: r.text, status: r.status, attempts: r.attempts, error: r.error, result: r.result, trace: r.trace,
  createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
});

interface MissionRow {
  id: string; title: string; goal: string; chat_id: string; thread_id: string | null; status: Mission["status"]; deadline: string | null;
  plan: Mission["plan"]; summary: string; health: string; created_by: string | null; created_at: string; launched_at: string | null; last_checkin_at: string | null;
}
const missionFrom = (r: MissionRow): Mission => ({
  id: r.id, title: r.title, goal: r.goal, chatId: r.chat_id, threadId: r.thread_id, status: r.status, deadline: r.deadline,
  plan: r.plan?.tasks ? r.plan : { tasks: [], risks: [] }, summary: r.summary, health: r.health, createdBy: r.created_by, createdAt: r.created_at,
  launchedAt: r.launched_at, lastCheckinAt: r.last_checkin_at,
});
interface DecisionRow {
  id: string; mission_id: string; question: string; options: string[]; context: string; status: Decision["status"]; answer: string | null;
  answered_by: string | null; answered_at: string | null; created_at: string; actions: Decision["actions"] | null;
}
const decisionFrom = (r: DecisionRow): Decision => ({
  id: r.id, missionId: r.mission_id, question: r.question, options: r.options ?? [], context: r.context, status: r.status, answer: r.answer,
  answeredBy: r.answered_by, answeredAt: r.answered_at, createdAt: r.created_at, actions: r.actions ?? {},
});

interface TeamDecisionRow {
  id: string; topic: string; statement: string; rationale: string; rejected: string[] | null; deciders: string[] | null; chat_id: string;
  thread_id: string | null; message_id: string; status: TeamDecision["status"]; superseded_by: string | null; flags: number;
  last_flagged_at: string | null; source: TeamDecision["source"]; created_at: string;
}
const teamDecisionFrom = (r: TeamDecisionRow): TeamDecision => ({
  id: r.id, topic: r.topic, statement: r.statement, rationale: r.rationale, rejected: r.rejected ?? [], deciders: r.deciders ?? [],
  chatId: r.chat_id, threadId: r.thread_id, messageId: r.message_id, status: r.status, supersededBy: r.superseded_by, flags: r.flags,
  lastFlaggedAt: r.last_flagged_at, source: r.source, createdAt: r.created_at,
});

interface MemoryRow { id: string; agent_id: string; text: string; created_by: string; created_at: string }
const memoryFrom = (r: MemoryRow): AgentMemory => ({ id: r.id, agentId: r.agent_id, text: r.text, createdBy: r.created_by, createdAt: r.created_at });

interface ReminderRow {
  id: string; created_by: string; target_kind: Reminder["target"]["kind"]; target_id: string; text: string; due_at: string; time_zone: string;
  status: Reminder["status"]; attempts: number; source_chat_id: string | null; source_thread_id: string | null; source_message_id: string | null;
  created_at: string; sent_at: string | null;
}
const reminderFrom = (r: ReminderRow): Reminder => ({
  id: r.id, createdBy: r.created_by, target: { kind: r.target_kind, id: r.target_id }, text: r.text, dueAt: new Date(r.due_at).toISOString(),
  timeZone: r.time_zone, status: r.status, attempts: r.attempts,
  source: r.source_chat_id && r.source_message_id ? { chatId: r.source_chat_id, threadId: r.source_thread_id, messageId: r.source_message_id } : null,
  createdAt: r.created_at, sentAt: r.sent_at,
});
interface QuestionRow {
  id: string; chat_id: string; thread_id: string | null; message_id: string; asker: string; addressee: string | null; summary: string;
  status: OpenQuestion["status"]; asked_at: string; due_at: string; follow_up_id: string | null; resolved_at: string | null; resolved_by: string | null;
}
const questionFrom = (r: QuestionRow): OpenQuestion => ({
  id: r.id, chatId: r.chat_id, threadId: r.thread_id, messageId: r.message_id, asker: r.asker, addressee: r.addressee, summary: r.summary,
  status: r.status, askedAt: r.asked_at, dueAt: r.due_at, followUpId: r.follow_up_id, resolvedAt: r.resolved_at, resolvedBy: r.resolved_by,
});
interface LinkRow { key: string; chat_id: string; message_id: string; to_chat_id: string; to_message_id: string; reply_id: string; created_at: string }
const linkFrom = (r: LinkRow): ThreadLink => ({
  key: r.key, chatId: r.chat_id, messageId: r.message_id, toChatId: r.to_chat_id, toMessageId: r.to_message_id, replyId: r.reply_id, createdAt: r.created_at,
});

function toTree(rows: MessageRow[], actions: Map<string, ActionRecord> = new Map()): Message[] {
  const roots: Message[] = [];
  const byId = new Map<string, Message>();
  for (const r of rows) {
    const a = r.action_id ? actions.get(r.action_id) : undefined;
    const base = {
      id: r.id, who: r.who, time: r.time_label, text: r.text, ticket: r.ticket_id, action: a ? toView(a) : null, reactions: r.reactions ?? undefined,
      editedAt: r.edited_at ?? null, deletedAt: r.deleted_at ?? null, pinnedAt: r.pinned_at ?? null, pinnedBy: r.pinned_by ?? null,
    };
    if (!r.thread_id) {
      const m: Message = { ...base, replies: [] };
      roots.push(m);
      byId.set(r.id, m);
      continue;
    }
    // Threads are flat: older rows with a parent_id (nested replies) list in the thread
    // in conversation order like every other reply.
    byId.get(r.thread_id)?.replies.push(base);
  }
  return roots;
}

interface HitRow { id: string; chat_id: ChatId; thread_id: string | null; who: PersonId; text: string; time_label: string }
const toHit = (r: HitRow) => ({ chatId: r.chat_id, id: r.id, threadId: r.thread_id, who: r.who, time: r.time_label, text: r.text });

/** Rows per request (the API's cap) and how many recent conversations a chat loads. */
const PAGE = 1000;
const MESSAGE_WINDOW = 100;

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A store over one workspace's rows. Every query filters by workspace_id. */
export function supabaseStore(ws: string): Store {
  const isDemo = ws === DEMO_WORKSPACE_ID;
  return {
  kind: "supabase",
  async listTickets() {
    // Paged: the API returns at most 1,000 rows per request, so a big workspace would
    // otherwise silently lose its newest tickets.
    const rows: TicketRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = check(await sb().from("tickets").select("*").eq("workspace_id", ws).order("created_at").order("id").range(from, from + PAGE - 1), "list tickets") as TicketRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows.map(fromRow);
  },
  async getTicket(id) {
    const row = check(await sb().from("tickets").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle(), "get ticket") as TicketRow | null;
    return row ? fromRow(row) : null;
  },
  async nextTicketId() {
    return check(await sb().rpc("next_ticket_id", { p_ws: ws }), "next ticket id") as string;
  },
  async insertTicket(t) {
    check(await sb().from("tickets").insert({ ...toRow(t), workspace_id: ws }), "insert ticket");
  },
  async saveTicket(t) {
    check(await sb().from("tickets").update({ ...toRow(t), updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", t.id), "save ticket");
  },
  async deleteTicket(id) {
    check(await sb().from("tickets").delete().eq("workspace_id", ws).eq("id", id), "delete ticket");
  },
  async listMessages(chatId, opts) {
    // The latest conversations (top-level messages) with their replies and action cards,
    // in one round trip (public.chat_window): a chat's cost doesn't grow with its history.
    const data = check(
      await sb().rpc("chat_window", { p_ws: ws, p_chat: chatId, p_limit: opts?.limit ?? MESSAGE_WINDOW }),
      "list messages",
    ) as { rows: MessageRow[]; actions: ActionRow[] } | null;
    const acts = (data?.actions ?? []).map(actionFromRow);
    return toTree(data?.rows ?? [], new Map(acts.map((a) => [a.id, a])));
  },
  async appendMessage(chatId, msg, threadId) {
    const row = {
      workspace_id: ws, id: msg.id, chat_id: chatId, thread_id: threadId ?? null, parent_id: null,
      who: msg.who, text: msg.text, ticket_id: msg.ticket ?? null, time_label: msg.time, action_id: msg.actionId ?? null,
    };
    // One round trip: the foreign key rejects a reply to a thread that no longer
    // exists, and only then do we fall back (same behaviour as the memory store).
    let res = await sb().from("messages").insert(row);
    if (res.error?.code === "23503" && row.thread_id) res = await sb().from("messages").insert({ ...row, thread_id: null });
    check(res, "append message");
    return row.thread_id ? { ...msg } : { ...msg, replies: [] };
  },
  async searchMessages(terms, limit) {
    const q = terms.map((t) => t.replace(/[^\p{L}\p{N}-]/gu, "")).filter(Boolean).join(" or ");
    if (!q) return [];
    const rows = check(
      await sb()
        .from("messages")
        .select("id,chat_id,thread_id,who,text,time_label")
        .eq("workspace_id", ws)
        .textSearch("text", q, { type: "websearch", config: "english" })
        .order("seq", { ascending: false })
        .limit(limit * 3),
      "search messages",
    ) as HitRow[];
    return rows.map(toHit);
  },
  async messagesMentioning(ticketId, limit) {
    const key = ticketId.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!key) return [];
    const rows = check(
      await sb().from("messages").select("id,chat_id,thread_id,who,text,time_label").eq("workspace_id", ws).ilike("text", `%${key}%`).order("seq", { ascending: false }).limit(limit),
      "messages mentioning",
    ) as HitRow[];
    return rows.map(toHit);
  },
  async getMessageRefs(ids) {
    if (!ids.length) return {};
    const rows = check(await sb().from("messages").select("id,chat_id,thread_id").eq("workspace_id", ws).in("id", ids), "message refs") as {
      id: string; chat_id: ChatId; thread_id: string | null;
    }[];
    return Object.fromEntries(rows.map((r) => [r.id, { chatId: r.chat_id, threadId: r.thread_id }]));
  },
  async messagesSince(since, limit) {
    const rows = check(
      await sb().from("messages").select("id,chat_id,thread_id,who,text,time_label").eq("workspace_id", ws).gt("created_at", since).order("seq", { ascending: false }).limit(limit),
      "messages since",
    ) as HitRow[];
    return rows.reverse().map(toHit);
  },
  async readMarkers(userId) {
    const rows = check(await sb().from("read_markers").select("chat_id,last_read_at").eq("workspace_id", ws).eq("user_id", userId), "read markers") as {
      chat_id: ChatId; last_read_at: string;
    }[];
    return Object.fromEntries(rows.map((r) => [r.chat_id, r.last_read_at]));
  },
  async markRead(userId, chatId, at) {
    check(
      await sb().from("read_markers").upsert({ workspace_id: ws, user_id: userId, chat_id: chatId, last_read_at: at }, { onConflict: "workspace_id,user_id,chat_id" }),
      "mark read",
    );
  },
  async getSummary(key) {
    const r = check(await sb().from("summaries").select("text").eq("workspace_id", ws).eq("key", key).maybeSingle(), "get summary") as { text: string } | null;
    return r?.text ?? null;
  },
  async putSummary(key, chatId, text) {
    check(await sb().from("summaries").upsert({ workspace_id: ws, key, chat_id: chatId, text }, { onConflict: "workspace_id,key" }), "put summary");
  },
  async listMissions() {
    const rows = check(await sb().from("missions").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }), "missions") as MissionRow[];
    return rows.map(missionFrom);
  },
  async getMission(id) {
    const r = check(await sb().from("missions").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle(), "mission") as MissionRow | null;
    return r ? missionFrom(r) : null;
  },
  async saveMission(m) {
    check(
      await sb().from("missions").upsert({
        id: m.id, workspace_id: ws, title: m.title, goal: m.goal, chat_id: m.chatId, thread_id: m.threadId, status: m.status, deadline: m.deadline,
        plan: m.plan, summary: m.summary, health: m.health, created_by: m.createdBy, created_at: m.createdAt, launched_at: m.launchedAt, last_checkin_at: m.lastCheckinAt,
      }),
      "save mission",
    );
  },
  async listDecisions(filter = {}) {
    let q = sb().from("mission_decisions").select("*").eq("workspace_id", ws);
    if (filter.missionId) q = q.eq("mission_id", filter.missionId);
    if (filter.status) q = q.eq("status", filter.status);
    const rows = check(await q.order("created_at"), "decisions") as DecisionRow[];
    return rows.map(decisionFrom);
  },
  async saveDecision(x) {
    check(
      await sb().from("mission_decisions").upsert({
        id: x.id, workspace_id: ws, mission_id: x.missionId, question: x.question, options: x.options, context: x.context, status: x.status,
        answer: x.answer, answered_by: x.answeredBy, answered_at: x.answeredAt, created_at: x.createdAt, actions: x.actions ?? {},
      }),
      "save decision",
    );
  },
  async listTeamDecisions() {
    const rows = check(await sb().from("team_decisions").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(200), "team decisions") as TeamDecisionRow[];
    return rows.map(teamDecisionFrom);
  },
  async saveTeamDecision(x) {
    check(
      await sb().from("team_decisions").upsert({
        id: x.id, workspace_id: ws, topic: x.topic, statement: x.statement, rationale: x.rationale, rejected: x.rejected, deciders: x.deciders,
        chat_id: x.chatId, thread_id: x.threadId, message_id: x.messageId, status: x.status, superseded_by: x.supersededBy, flags: x.flags,
        last_flagged_at: x.lastFlaggedAt, source: x.source, created_at: x.createdAt,
      }),
      "save team decision",
    );
  },
  async addMissionEvent(e) {
    check(await sb().from("mission_events").insert({ workspace_id: ws, mission_id: e.missionId, kind: e.kind, actor: e.actor, text: e.text, at: e.at }), "mission event");
  },
  async listMissionEvents(missionId) {
    const rows = check(await sb().from("mission_events").select("mission_id,kind,actor,text,at").eq("workspace_id", ws).eq("mission_id", missionId).order("at"), "mission events") as {
      mission_id: string; kind: MissionEvent["kind"]; actor: string | null; text: string; at: string;
    }[];
    return rows.map((r) => ({ missionId: r.mission_id, kind: r.kind, actor: r.actor, text: r.text, at: r.at }));
  },
  async listAgentMemories() {
    const rows = check(await sb().from("agent_memories").select("id, agent_id, text, created_by, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(500), "agent memories") as MemoryRow[];
    return rows.map(memoryFrom);
  },
  async addAgentMemory(m) {
    check(await sb().from("agent_memories").insert({ id: m.id, workspace_id: ws, agent_id: m.agentId, text: m.text, created_by: m.createdBy, created_at: m.createdAt }), "add memory");
  },
  async deleteAgentMemory(id) {
    const rows = check(await sb().from("agent_memories").delete().eq("workspace_id", ws).eq("id", id).select("id"), "delete memory") as { id: string }[];
    return rows.length > 0;
  },
  async addReminder(r) {
    check(
      await sb().from("reminders").insert({
        id: r.id, workspace_id: ws, created_by: r.createdBy, target_kind: r.target.kind, target_id: r.target.id, text: r.text, due_at: r.dueAt,
        time_zone: r.timeZone, status: r.status, attempts: r.attempts, source_chat_id: r.source?.chatId ?? null, source_thread_id: r.source?.threadId ?? null,
        source_message_id: r.source?.messageId ?? null, created_at: r.createdAt, sent_at: r.sentAt,
      }),
      "add reminder",
    );
  },
  async listReminders(filter = {}) {
    let q = sb().from("reminders").select("*").eq("workspace_id", ws);
    if (filter.status) q = q.eq("status", filter.status);
    const rows = check(await q.order("due_at", { ascending: filter.status === "pending" }).limit(500), "list reminders") as ReminderRow[];
    return rows.map(reminderFrom);
  },
  async getReminder(id) {
    const r = check(await sb().from("reminders").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle(), "get reminder") as ReminderRow | null;
    return r ? reminderFrom(r) : null;
  },
  async claimDueReminders(now, limit) {
    // One UPDATE ... FOR UPDATE SKIP LOCKED in Postgres: each due reminder goes to one sweep.
    const rows = check(await sb().rpc("claim_due_reminders", { p_ws: ws, p_now: now, p_limit: limit }), "claim reminders") as ReminderRow[];
    return rows.map(reminderFrom);
  },
  async transitionReminder(id, from, to) {
    const rows = check(await sb().from("reminders").update({ status: to }).eq("workspace_id", ws).eq("id", id).in("status", from).select("id"), "transition reminder") as { id: string }[];
    return rows.length > 0;
  },
  async claimDigest(chatId, day, force) {
    return check(await sb().rpc("claim_channel_digest", { p_ws: ws, p_chat: chatId, p_day: day, p_force: !!force }), "claim digest") as boolean;
  },
  async lastDigests() {
    const rows = check(await sb().from("channel_digests").select("chat_id,last_digest_day").eq("workspace_id", ws), "last digests") as { chat_id: string; last_digest_day: string }[];
    return Object.fromEntries(rows.map((r) => [r.chat_id, r.last_digest_day]));
  },
  async timeZones() {
    const rows = check(await sb().from("member_time_zones").select("user_id,time_zone").eq("workspace_id", ws), "time zones") as { user_id: string; time_zone: string }[];
    return Object.fromEntries(rows.map((r) => [r.user_id, r.time_zone]));
  },
  async setTimeZone(userId, tz) {
    check(
      await sb().from("member_time_zones").upsert({ workspace_id: ws, user_id: userId, time_zone: tz, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id" }),
      "set time zone",
    );
  },
  async listOpenQuestions(filter = {}) {
    let q = sb().from("open_questions").select("*").eq("workspace_id", ws);
    if (filter.status) q = q.eq("status", filter.status);
    const rows = check(await q.order("asked_at", { ascending: false }).limit(200), "open questions") as QuestionRow[];
    return rows.map(questionFrom);
  },
  async saveOpenQuestion(x) {
    check(
      await sb().from("open_questions").upsert({
        id: x.id, workspace_id: ws, chat_id: x.chatId, thread_id: x.threadId, message_id: x.messageId, asker: x.asker, addressee: x.addressee,
        summary: x.summary, status: x.status, asked_at: x.askedAt, due_at: x.dueAt, follow_up_id: x.followUpId, resolved_at: x.resolvedAt, resolved_by: x.resolvedBy,
      }),
      "save question",
    );
  },
  async transitionQuestion(id, from, to, patch = {}) {
    const update: Record<string, unknown> = { status: to, resolved_at: new Date().toISOString() };
    if (patch.followUpId !== undefined) update.follow_up_id = patch.followUpId;
    if (patch.resolvedBy !== undefined) update.resolved_by = patch.resolvedBy;
    // Conditional update: only one caller can move it out of `from`.
    const rows = check(await sb().from("open_questions").update(update).eq("workspace_id", ws).eq("id", id).in("status", from).select("id"), "transition question") as { id: string }[];
    return rows.length > 0;
  },
  async addThreadLink(l) {
    const res = await sb().from("thread_links").insert({
      workspace_id: ws, key: l.key, chat_id: l.chatId, message_id: l.messageId, to_chat_id: l.toChatId, to_message_id: l.toMessageId, reply_id: l.replyId, created_at: l.createdAt,
    });
    if (res.error?.code === "23505") return false; // linked before
    check(res, "add thread link");
    return true;
  },
  async listThreadLinks() {
    const rows = check(await sb().from("thread_links").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(300), "thread links") as LinkRow[];
    return rows.map(linkFrom);
  },
  ...automationSupabase(ws),
  async deleteChatMessages(chatId) {
    // Replies first: they reference their thread roots.
    check(await sb().from("messages").delete().eq("workspace_id", ws).eq("chat_id", chatId).not("thread_id", "is", null), "delete replies");
    check(await sb().from("messages").delete().eq("workspace_id", ws).eq("chat_id", chatId), "delete messages");
  },
  async week() {
    const rows = check(await sb().from("week_activity").select("day,people,atlas").eq("workspace_id", ws).order("day"), "week") as { day: number; people: number; atlas: number }[];
    return DAY.map((d, i) => {
      const r = rows.find((x) => x.day === i);
      return { d, p: r?.people ?? 0, a: r?.atlas ?? 0 } satisfies WeekDay;
    });
  },
  async bumpWeek(kind) {
    check(await sb().rpc("bump_week", { p_ws: ws, p_day: todayIndex(), p_atlas: kind === "a" }), "bump week");
  },
  async logEvent(e) {
    check(
      await sb().from("events").insert({ workspace_id: ws, kind: e.kind, actor: e.actor, chat_id: e.chatId ?? null, ticket_id: e.ticketId ?? null, payload: e.payload ?? {} }),
      "log event",
    );
  },
  async insertAction(a) {
    check(
      await sb().from("agent_actions").insert({
        workspace_id: ws,
        id: a.id, chat_id: a.chatId, message_id: a.messageId, status: a.status, ops: a.ops, summary: a.summary,
        destructive: a.destructive, undo_until: a.undoUntil,
      }),
      "insert action",
    );
  },
  async getAction(id) {
    const row = check(await sb().from("agent_actions").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle(), "get action") as ActionRow | null;
    return row ? actionFromRow(row) : null;
  },
  async transitionAction(id, from, to, patch) {
    const update: Record<string, unknown> = { status: to, decided_at: new Date().toISOString() };
    if (patch && "undoUntil" in patch) update.undo_until = patch.undoUntil ?? null;
    // Conditional update: only one caller can move it out of `from`.
    const rows = check(await sb().from("agent_actions").update(update).eq("workspace_id", ws).eq("id", id).in("status", from).select("id"), "transition action") as { id: string }[];
    return rows.length > 0;
  },
  async enqueueRun(run) {
    const res = await sb().from("agent_runs").insert({
      workspace_id: ws, requester: run.requester, agent_id: run.agentId, trigger: run.trigger, depth: run.depth, parent_run_id: run.parentRunId,
      id: run.id, trigger_message_id: run.triggerMessageId, chat_id: run.chatId, thread_id: run.threadId,
      role: run.role, text: run.text, status: run.status, attempts: run.attempts, created_at: run.createdAt,
    });
    if (res.error?.code === "23505") {
      // Already enqueued for this message (a retried request): return that run.
      const row = check(await sb().from("agent_runs").select("*").eq("workspace_id", ws).eq("trigger_message_id", run.triggerMessageId).eq("agent_id", run.agentId).single(), "get run") as RunRow;
      return runFromRow(row);
    }
    check(res, "enqueue run");
    return run;
  },
  async claimRun(id) {
    // One conditional UPDATE in Postgres, so two workers can't both claim it.
    const rows = check(
      await sb().rpc("claim_agent_run", { p_ws: ws, p_id: id, p_stale_seconds: RUN_STALE_MS / 1000, p_max_attempts: RUN_MAX_ATTEMPTS }),
      "claim run",
    ) as RunRow[];
    return rows.length ? runFromRow(rows[0]) : null;
  },
  async finishRun(id, patch) {
    const update: Record<string, unknown> = { status: patch.status, finished_at: new Date().toISOString() };
    if ("error" in patch) update.error = patch.error;
    if ("result" in patch) update.result = patch.result;
    if ("trace" in patch) update.trace = patch.trace;
    check(await sb().from("agent_runs").update(update).eq("workspace_id", ws).eq("id", id), "finish run");
  },
  async countRunsSince(chatId, since) {
    const r = await sb().from("agent_runs").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("chat_id", chatId).gt("created_at", since);
    if (r.error) throw new Error(`count runs: ${r.error.message}`);
    return r.count ?? 0;
  },
  async react(messageId, emoji, who, on) {
    check(await sb().rpc("toggle_reaction", { p_ws: ws, p_id: messageId, p_emoji: emoji, p_who: who, p_on: on }), "react");
  },
  async getMessage(id) {
    const r = check(
      await sb().from("messages").select("id,chat_id,thread_id,who,text,time_label,edited_at,deleted_at,pinned_at").eq("workspace_id", ws).eq("id", id).maybeSingle(),
      "get message",
    ) as (HitRow & { edited_at: string | null; deleted_at: string | null; pinned_at: string | null }) | null;
    if (!r) return null;
    let replyCount = 0;
    if (!r.thread_id) {
      const c = await sb().from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("thread_id", id);
      if (c.error) throw new Error(`count replies: ${c.error.message}`);
      replyCount = c.count ?? 0;
    }
    return { ...toHit(r), replyCount, editedAt: r.edited_at, deletedAt: r.deleted_at, pinnedAt: r.pinned_at };
  },
  async updateMessage(id, patch) {
    const cols: Record<string, unknown> = {};
    if (patch.text !== undefined) cols.text = patch.text;
    if (patch.editedAt !== undefined) cols.edited_at = patch.editedAt;
    if (patch.deletedAt !== undefined) cols.deleted_at = patch.deletedAt;
    if (patch.pinnedAt !== undefined) cols.pinned_at = patch.pinnedAt;
    if (patch.pinnedBy !== undefined) cols.pinned_by = patch.pinnedBy;
    if (patch.clearReactions) cols.reactions = {};
    if (!Object.keys(cols).length) return;
    check(await sb().from("messages").update(cols).eq("workspace_id", ws).eq("id", id), "update message");
  },
  async removeMessage(id) {
    // Replies go with their root (thread_id cascades).
    check(await sb().from("messages").delete().eq("workspace_id", ws).eq("id", id), "remove message");
  },
  async listPinned(chatId, limit) {
    const rows = check(
      await sb()
        .from("messages")
        .select("id,chat_id,thread_id,who,text,time_label,pinned_at,pinned_by")
        .eq("workspace_id", ws)
        .eq("chat_id", chatId)
        .not("pinned_at", "is", null)
        .order("pinned_at", { ascending: false })
        .limit(limit),
      "list pinned",
    ) as (HitRow & { pinned_at: string; pinned_by: string | null })[];
    return rows.map((r) => ({ ...toHit(r), pinnedAt: r.pinned_at, pinnedBy: r.pinned_by }));
  },
  async listRecentRuns() {
    const since = new Date(Date.now() - RUN_RECENT_MS).toISOString();
    const cols = "id,trigger_message_id,chat_id,thread_id,requester,role,agent_id,trigger,depth,parent_run_id,text,status,attempts,error,result,created_at,started_at,finished_at";
    const rows = check(
      await sb().from("agent_runs").select(cols).eq("workspace_id", ws).or(`status.in.(queued,running),finished_at.gt.${since}`).order("created_at").limit(50),
      "list runs",
    ) as unknown as RunRow[];
    return rows.map((r) => runFromRow({ ...r, trace: null }));
  },
  async reset() {
    // Only the sample workspace can be put back to its seed data.
    if (!isDemo) throw new Error("Only the demo workspace can be reset");
    const db = sb();
    check(await db.from("agent_runs").delete().eq("workspace_id", ws).neq("id", ""), "clear runs");
    check(await db.from("agent_actions").delete().eq("workspace_id", ws).neq("id", ""), "clear actions");
    // Ticket ids restart from the seed: forget which were triaged or ran playbooks.
    check(await db.from("ticket_triages").delete().eq("workspace_id", ws).neq("ticket_id", ""), "clear triages");
    check(await db.from("playbook_runs").delete().eq("workspace_id", ws).neq("id", ""), "clear playbook runs");
    // Order matters: replies reference their thread roots.
    check(await db.from("events").delete().eq("workspace_id", ws).gte("id", 0), "clear events");
    check(await db.from("messages").delete().eq("workspace_id", ws).not("thread_id", "is", null), "clear replies");
    check(await db.from("messages").delete().eq("workspace_id", ws).neq("id", ""), "clear messages");
    check(await db.from("tickets").delete().eq("workspace_id", ws).neq("id", ""), "clear tickets");
    check(await db.from("week_activity").delete().eq("workspace_id", ws).gte("day", 0), "clear week");
    check(await db.rpc("reset_ticket_number", { p_ws: ws }), "reset numbering");

    check(await db.from("tickets").insert(SEED_TICKETS.map((t) => ({ ...toRow(t), workspace_id: ws }))), "seed tickets");
    const rows: MessageRow[] = [];
    for (const [chatId, msgs] of Object.entries(SEED_CHATS) as [ChatId, Message[]][]) {
      for (const m of msgs) {
        rows.push({ workspace_id: ws, id: m.id, chat_id: chatId, thread_id: null, parent_id: null, who: m.who, text: m.text, ticket_id: m.ticket ?? null, time_label: m.time });
        for (const n of m.replies)
          rows.push({ workspace_id: ws, id: n.id, chat_id: chatId, thread_id: m.id, parent_id: null, who: n.who, text: n.text, ticket_id: n.ticket ?? null, time_label: n.time });
      }
    }
    // Insert in order so seq preserves conversation order.
    for (let i = 0; i < rows.length; i += 200) check(await db.from("messages").insert(rows.slice(i, i + 200)), "seed messages");
    check(await db.from("week_activity").insert(SEED_WEEK.map((w, day) => ({ workspace_id: ws, day, people: w.p, atlas: w.a }))), "seed week");
  },
};
}
