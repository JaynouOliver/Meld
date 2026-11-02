/**
 * Local implementation of the app API over the in-memory db.
 * - On the server, the /api/rpc route runs these against the shared db.
 * - In the single-file preview (NEXT_PUBLIC_DATA_MODE=local), the browser runs them directly.
 * Signatures are the contract; see ./index.ts.
 */
import { runAtlas } from "../agent/atlas";
import { CHAT_META, DEFAULT_REPO, PEOPLE } from "../constants";
import { clock, uid } from "../format";
import { appendMessage, bumpWeek, db } from "../mock/db";
import { canDelete, canSee } from "../rbac";
import type { ChatId, GitHubLink, Message, PersonId, ReplyNode, Role, Ticket, TicketImage, WeekDay } from "../types";

// Simulated network latency only when running in the browser (preview mode).
const LATENCY = typeof window === "undefined" ? 0 : 120;
const wait = (ms = LATENCY) => (typeof window === "undefined" ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
const clone = <T,>(x: T): T => structuredClone(x);

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------- reads

export async function getMessages(chatId: ChatId): Promise<Message[]> {
  await wait();
  return clone(db.chats[chatId] ?? []);
}

export async function getTickets(): Promise<Ticket[]> {
  await wait();
  return clone(db.tickets);
}

export async function getWeekActivity(): Promise<WeekDay[]> {
  await wait();
  return clone(db.week);
}

// ---------------------------------------------------------------- messages

export interface PostMessageInput {
  chatId: ChatId;
  text: string;
  threadId?: string | null;
  parentId?: string | null;
}

export async function postMessage(input: PostMessageInput): Promise<Message | ReplyNode> {
  await wait(60);
  const msg = { id: uid(), who: "me" as PersonId, time: clock(), text: input.text };
  return clone(appendMessage(input.chatId, msg, input.threadId, input.parentId));
}

export interface AskAtlasInput extends PostMessageInput {
  role: Role;
}

export interface AskAtlasResult {
  /** Chats that received a new Atlas message. */
  touchedChats: ChatId[];
  /** Ticket Atlas wants opened (e.g. just created). */
  openTicket: string | null;
  /** Ticket ids that no longer exist after this action. */
  deleted: string[];
}

/** Ask the agent. Resolves once Atlas has posted its reply. */
export async function askAtlas(input: AskAtlasInput): Promise<AskAtlasResult> {
  await wait(1300);
  const out = runAtlas({
    text: input.text,
    where: input.chatId,
    role: input.role,
    tickets: db.tickets,
    nextNum: db.nextNum,
    now: clock(),
    uid,
  });
  const deleted = db.tickets.filter((t) => !out.tickets.some((x) => x.id === t.id)).map((t) => t.id);
  db.tickets = out.tickets;
  db.nextNum = out.nextNum;
  appendMessage(input.chatId, { id: uid(), who: "atlas", time: clock(), text: out.reply, ticket: out.ticket }, input.threadId, input.parentId);
  const touched: ChatId[] = [input.chatId];
  if (out.broadcast) {
    appendMessage(out.broadcast.chat, { id: uid(), who: "atlas", time: clock(), text: out.broadcast.text }, out.broadcast.thread);
    touched.push(out.broadcast.chat);
  }
  if (out.reply) bumpWeek("a");
  return { touchedChats: touched, openTicket: out.open, deleted };
}

const TEAMMATE_LINES = ["Sounds good.", "Got it, I'll take a look.", "Makes sense. Let's talk it through on Thursday.", "Perfect, thanks!"];
let replyIdx = 0;

/** Demo-only: a teammate answers in a DM. */
export async function teammateReply(chatId: ChatId): Promise<void> {
  const meta = CHAT_META[chatId];
  if (meta.kind !== "dm" || meta.who === "atlas") return;
  await new Promise((r) => setTimeout(r, 1600));
  const text = TEAMMATE_LINES[replyIdx++ % TEAMMATE_LINES.length];
  appendMessage(chatId, { id: uid(), who: meta.who, time: clock(), text });
}

// ---------------------------------------------------------------- tickets

function requireTicket(id: string, role: Role) {
  const t = db.tickets.find((x) => x.id === id);
  if (!t) throw new ApiError(`${id} not found`, 404);
  if (!canSee(role, t)) throw new ApiError(`No access to ${id}`, 403);
  return t;
}

export async function createTicket(preset: Partial<Ticket>, role: Role): Promise<Ticket> {
  await wait(80);
  if (role === "guest") throw new ApiError("Guests can't create tickets", 403);
  const id = `NW-${db.nextNum++}`;
  const t: Ticket = {
    id, team: "design", title: "", description: "", status: "To do", priority: "Medium", assignee: "me", reporter: "me",
    updated: "Just now", images: [], links: [], watch: null,
    activity: [{ who: PEOPLE.me.name, text: "created this ticket", time: clock() }],
    ...preset,
  };
  if (role === "member") t.team = "design";
  db.tickets.push(t);
  bumpWeek("p");
  return clone(t);
}

export type TicketPatch = Partial<Pick<Ticket, "title" | "description" | "status" | "priority" | "assignee">>;

export interface UpdateTicketInput {
  id: string;
  role: Role;
  patch?: TicketPatch;
  addLink?: Pick<GitHubLink, "kind" | "num">;
  removeLinkId?: string;
  addImage?: Omit<TicketImage, "id">;
  removeImageId?: string;
}

export interface UpdateTicketResult {
  ticket: Ticket;
  /** Chat where Atlas posted an update, if the ticket is watched. */
  broadcastChat: ChatId | null;
}

/**
 * Patch a ticket. Status, assignee and link changes are logged and, for watched
 * tickets, announced by Atlas in the watching channel. Title/description edits are silent.
 */
export async function updateTicket(input: UpdateTicketInput): Promise<UpdateTicketResult> {
  await wait(80);
  const t = requireTicket(input.id, input.role);
  let note: string | null = null;
  let announce: string | null = null;
  const p = input.patch ?? {};
  if (p.title !== undefined) t.title = p.title;
  if (p.description !== undefined) t.description = p.description;
  if (p.status && p.status !== t.status) {
    t.status = p.status;
    note = announce = `moved it to ${p.status}`;
  }
  if (p.priority && p.priority !== t.priority) {
    t.priority = p.priority;
    note = `set priority to ${p.priority}`;
  }
  if (p.assignee && p.assignee !== t.assignee) {
    t.assignee = p.assignee;
    note = announce = `assigned it to ${PEOPLE[p.assignee].name}`;
  }
  if (input.addLink) {
    const num = input.addLink.num.replace(/[^0-9]/g, "");
    if (!num) throw new ApiError("Link number is required");
    t.links.push({ id: uid(), kind: input.addLink.kind, num, repo: DEFAULT_REPO });
    note = announce = `linked ${input.addLink.kind} #${num}`;
  }
  if (input.removeLinkId) {
    const l = t.links.find((x) => x.id === input.removeLinkId);
    t.links = t.links.filter((x) => x.id !== input.removeLinkId);
    if (l) note = `unlinked ${l.kind} #${l.num}`;
  }
  if (input.addImage) {
    t.images.push({ id: uid(), ...input.addImage });
    note = `added image ${input.addImage.name}`;
  }
  if (input.removeImageId) {
    t.images = t.images.filter((x) => x.id !== input.removeImageId);
    note = "removed an image";
  }
  t.updated = "Just now";
  if (note) {
    t.activity.push({ who: PEOPLE.me.name, text: note, time: clock() });
    bumpWeek("p");
  }
  let broadcastChat: ChatId | null = null;
  if (announce && t.watch) {
    appendMessage(t.watch.chat, { id: uid(), who: "atlas", time: clock(), text: `Update on ${t.id}: Suvra Das ${announce}.` }, t.watch.thread);
    broadcastChat = t.watch.chat;
  }
  return { ticket: clone(t), broadcastChat };
}

export async function deleteTicket(id: string, role: Role): Promise<void> {
  await wait(80);
  if (!canDelete(role)) throw new ApiError("Only org owners can delete tickets", 403);
  requireTicket(id, role);
  db.tickets = db.tickets.filter((x) => x.id !== id);
  bumpWeek("p");
}
