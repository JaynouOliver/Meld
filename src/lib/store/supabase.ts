import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { toView, type ActionRecord } from "../agent/actions";
import { todayIndex } from "../format";
import { SEED_CHATS, SEED_TICKETS, SEED_WEEK } from "../mock/seed";
import type { ChatId, Message, PersonId, ReplyNode, Ticket, WeekDay } from "../types";
import type { Store } from "./types";

/**
 * Postgres via supabase-js, using the service-role key. Server-only: the tables have
 * RLS on with no policies, so nothing else can read them.
 */
let client: SupabaseClient | null = null;
function sb() {
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

interface TicketRow {
  id: string; team: Ticket["team"]; title: string; description: string; status: Ticket["status"];
  priority: Ticket["priority"]; assignee: PersonId; reporter: PersonId; links: Ticket["links"];
  images: Ticket["images"]; watch: Ticket["watch"]; activity: Ticket["activity"]; updated: string;
}
const toRow = (t: Ticket): TicketRow => ({
  id: t.id, team: t.team, title: t.title, description: t.description, status: t.status, priority: t.priority,
  assignee: t.assignee, reporter: t.reporter, links: t.links, images: t.images, watch: t.watch,
  activity: t.activity, updated: t.updated,
});
const fromRow = (r: TicketRow): Ticket => ({ ...r });

interface MessageRow {
  id: string; chat_id: ChatId; thread_id: string | null; parent_id: string | null;
  who: PersonId; text: string; ticket_id: string | null; time_label: string; action_id?: string | null;
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
function toTree(rows: MessageRow[], actions: Map<string, ActionRecord> = new Map()): Message[] {
  const roots: Message[] = [];
  const byId = new Map<string, Message | ReplyNode>();
  for (const r of rows) {
    const a = r.action_id ? actions.get(r.action_id) : undefined;
    const base = { id: r.id, who: r.who, time: r.time_label, text: r.text, ticket: r.ticket_id, action: a ? toView(a) : null };
    if (!r.thread_id) {
      const m: Message = { ...base, replies: [] };
      roots.push(m);
      byId.set(r.id, m);
      continue;
    }
    const node: ReplyNode = { ...base, kids: [] };
    byId.set(r.id, node);
    const parent = byId.get(r.parent_id ?? r.thread_id);
    if (!parent) continue;
    if ("replies" in parent) parent.replies.push(node);
    else parent.kids.push(node);
  }
  return roots;
}

interface HitRow { id: string; chat_id: ChatId; thread_id: string | null; who: PersonId; text: string; time_label: string }
const toHit = (r: HitRow) => ({ chatId: r.chat_id, id: r.id, threadId: r.thread_id, who: r.who, time: r.time_label, text: r.text });

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const supabaseStore: Store = {
  kind: "supabase",
  async listTickets() {
    const rows = check(await sb().from("tickets").select("*").order("created_at").order("id"), "list tickets") as TicketRow[];
    return rows.map(fromRow);
  },
  async getTicket(id) {
    const row = check(await sb().from("tickets").select("*").eq("id", id).maybeSingle(), "get ticket") as TicketRow | null;
    return row ? fromRow(row) : null;
  },
  async nextTicketId() {
    return check(await sb().rpc("next_ticket_id"), "next ticket id") as string;
  },
  async insertTicket(t) {
    check(await sb().from("tickets").insert(toRow(t)), "insert ticket");
  },
  async saveTicket(t) {
    check(await sb().from("tickets").update({ ...toRow(t), updated_at: new Date().toISOString() }).eq("id", t.id), "save ticket");
  },
  async deleteTicket(id) {
    check(await sb().from("tickets").delete().eq("id", id), "delete ticket");
  },
  async listMessages(chatId) {
    const [msgRes, actRes] = await Promise.all([
      sb().from("messages").select("id,chat_id,thread_id,parent_id,who,text,ticket_id,time_label,action_id").eq("chat_id", chatId).order("seq"),
      sb().from("agent_actions").select("*").eq("chat_id", chatId),
    ]);
    const rows = check(msgRes, "list messages") as MessageRow[];
    const acts = (check(actRes, "list actions") as ActionRow[]).map(actionFromRow);
    return toTree(rows, new Map(acts.map((a) => [a.id, a])));
  },
  async appendMessage(chatId, msg, threadId, parentId) {
    const row = {
      id: msg.id, chat_id: chatId, thread_id: threadId ?? null, parent_id: threadId ? (parentId ?? null) : null,
      who: msg.who, text: msg.text, ticket_id: msg.ticket ?? null, time_label: msg.time, action_id: msg.actionId ?? null,
    };
    // One round trip: the foreign keys reject a reply to a thread/parent that no longer
    // exists, and only then do we fall back (same behaviour as the memory store).
    let res = await sb().from("messages").insert(row);
    if (res.error?.code === "23503" && row.parent_id) res = await sb().from("messages").insert({ ...row, parent_id: null });
    if (res.error?.code === "23503" && row.thread_id) res = await sb().from("messages").insert({ ...row, thread_id: null, parent_id: null });
    check(res, "append message");
    return row.thread_id ? { ...msg, kids: [] } : { ...msg, replies: [] };
  },
  async searchMessages(terms, limit) {
    const q = terms.map((t) => t.replace(/[^\p{L}\p{N}-]/gu, "")).filter(Boolean).join(" or ");
    if (!q) return [];
    const rows = check(
      await sb()
        .from("messages")
        .select("id,chat_id,thread_id,who,text,time_label")
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
      await sb().from("messages").select("id,chat_id,thread_id,who,text,time_label").ilike("text", `%${key}%`).order("seq", { ascending: false }).limit(limit),
      "messages mentioning",
    ) as HitRow[];
    return rows.map(toHit);
  },
  async getMessageRefs(ids) {
    if (!ids.length) return {};
    const rows = check(await sb().from("messages").select("id,chat_id,thread_id").in("id", ids), "message refs") as {
      id: string; chat_id: ChatId; thread_id: string | null;
    }[];
    return Object.fromEntries(rows.map((r) => [r.id, { chatId: r.chat_id, threadId: r.thread_id }]));
  },
  async week() {
    const rows = check(await sb().from("week_activity").select("day,people,atlas").order("day"), "week") as { day: number; people: number; atlas: number }[];
    return DAY.map((d, i) => {
      const r = rows.find((x) => x.day === i);
      return { d, p: r?.people ?? 0, a: r?.atlas ?? 0 } satisfies WeekDay;
    });
  },
  async bumpWeek(kind) {
    check(await sb().rpc("bump_week", { p_day: todayIndex(), p_atlas: kind === "a" }), "bump week");
  },
  async logEvent(e) {
    check(
      await sb().from("events").insert({ kind: e.kind, actor: e.actor, chat_id: e.chatId ?? null, ticket_id: e.ticketId ?? null, payload: e.payload ?? {} }),
      "log event",
    );
  },
  async insertAction(a) {
    check(
      await sb().from("agent_actions").insert({
        id: a.id, chat_id: a.chatId, message_id: a.messageId, status: a.status, ops: a.ops, summary: a.summary,
        destructive: a.destructive, undo_until: a.undoUntil,
      }),
      "insert action",
    );
  },
  async getAction(id) {
    const row = check(await sb().from("agent_actions").select("*").eq("id", id).maybeSingle(), "get action") as ActionRow | null;
    return row ? actionFromRow(row) : null;
  },
  async transitionAction(id, from, to, patch) {
    const update: Record<string, unknown> = { status: to, decided_at: new Date().toISOString() };
    if (patch && "undoUntil" in patch) update.undo_until = patch.undoUntil ?? null;
    // Conditional update: only one caller can move it out of `from`.
    const rows = check(await sb().from("agent_actions").update(update).eq("id", id).in("status", from).select("id"), "transition action") as { id: string }[];
    return rows.length > 0;
  },
  async reset() {
    const db = sb();
    check(await db.from("agent_actions").delete().neq("id", ""), "clear actions");
    // Order matters: replies reference their thread roots.
    check(await db.from("events").delete().gte("id", 0), "clear events");
    check(await db.from("messages").delete().not("thread_id", "is", null), "clear replies");
    check(await db.from("messages").delete().neq("id", ""), "clear messages");
    check(await db.from("tickets").delete().neq("id", ""), "clear tickets");
    check(await db.from("week_activity").delete().gte("day", 0), "clear week");
    check(await db.rpc("reset_ticket_number"), "reset numbering");

    check(await db.from("tickets").insert(SEED_TICKETS.map(toRow)), "seed tickets");
    const rows: MessageRow[] = [];
    for (const [chatId, msgs] of Object.entries(SEED_CHATS) as [ChatId, Message[]][]) {
      for (const m of msgs) {
        rows.push({ id: m.id, chat_id: chatId, thread_id: null, parent_id: null, who: m.who, text: m.text, ticket_id: m.ticket ?? null, time_label: m.time });
        const walk = (nodes: ReplyNode[], parent: string | null) =>
          nodes.forEach((n) => {
            rows.push({ id: n.id, chat_id: chatId, thread_id: m.id, parent_id: parent, who: n.who, text: n.text, ticket_id: n.ticket ?? null, time_label: n.time });
            walk(n.kids, n.id);
          });
        walk(m.replies, null);
      }
    }
    // Insert in order so seq preserves conversation order.
    for (let i = 0; i < rows.length; i += 200) check(await db.from("messages").insert(rows.slice(i, i + 200)), "seed messages");
    check(await db.from("week_activity").insert(SEED_WEEK.map((w, day) => ({ day, people: w.p, atlas: w.a }))), "seed week");
  },
};
