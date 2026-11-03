import type { ActionRecord } from "../agent/actions";
import type { AgentRun } from "../agent/runs";
import type { Decision, Mission, MissionEvent } from "../missions";
import { todayIndex } from "../format";
import type { ChatId, Message, ReplyNode, Ticket, WeekDay } from "../types";
import { DEMO_WORKSPACE_ID } from "./demo";
import { SEED_CHATS, SEED_NEXT_NUM, SEED_TICKETS, SEED_WEEK } from "./seed";

/**
 * In-memory databases, one per workspace, for local dev, evals and the browser preview.
 * Runs in the Next.js server process (or in the browser for the preview). Restarting
 * resets everything. Only src/lib/store/memory.ts talks to this module.
 */
export interface Db {
  tickets: Ticket[];
  chats: Record<ChatId, Message[]>;
  week: WeekDay[];
  nextNum: number;
  actions: Map<string, ActionRecord>;
  runs: Map<string, AgentRun>;
  /** user id → chat id → last read (ISO). */
  reads: Map<string, Record<ChatId, string>>;
  summaries: Map<string, string>;
  missions: Map<string, Mission>;
  decisions: Map<string, Decision>;
  missionEvents: MissionEvent[];
}

const EMPTY_WEEK: WeekDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ d, p: 0, a: 0 }));

function seed(workspaceId: string): Db {
  const demo = workspaceId === DEMO_WORKSPACE_ID;
  return {
    tickets: demo ? structuredClone(SEED_TICKETS) : [],
    chats: demo ? structuredClone(SEED_CHATS) : {},
    week: structuredClone(demo ? SEED_WEEK : EMPTY_WEEK),
    nextNum: demo ? SEED_NEXT_NUM : 1,
    actions: new Map(),
    runs: new Map(),
    reads: new Map(),
    summaries: new Map(),
    missions: new Map(),
    decisions: new Map(),
    missionEvents: [],
  };
}

// One map per process: Next may load this module in several route bundles.
const g = globalThis as typeof globalThis & { __meldDbs?: Map<string, Db> };
const dbs = (g.__meldDbs ??= new Map());

export function dbFor(workspaceId: string): Db {
  let d = dbs.get(workspaceId);
  if (!d) dbs.set(workspaceId, (d = seed(workspaceId)));
  return d;
}

/** Back to seed data (used by evals and the demo reset). */
export function resetDb(workspaceId: string) {
  dbs.set(workspaceId, seed(workspaceId));
}

export function bumpWeek(db: Db, kind: "p" | "a") {
  db.week[todayIndex()][kind] += 1;
}

/** Append a message to a chat, or a reply to a thread (threads are flat). */
export function appendMessage(db: Db, chatId: ChatId, msg: Omit<Message, "replies">, threadId?: string | null) {
  const chat = (db.chats[chatId] ??= []);
  if (threadId) {
    const root = chat.find((x) => x.id === threadId);
    if (root) {
      const node: ReplyNode = { ...msg };
      root.replies.push(node);
      return node;
    }
  }
  const m: Message = { ...msg, replies: [] };
  chat.push(m);
  return m;
}
