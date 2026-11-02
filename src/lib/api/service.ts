/**
 * The app API, implemented once over a Store (see src/lib/store):
 * - on the server, /api/rpc runs these against Supabase (or memory if not configured);
 * - in the single-file preview (NEXT_PUBLIC_DATA_MODE=local), the browser runs them in memory.
 * Signatures are the contract the UI depends on; see ./index.ts.
 */
import { runAtlas } from "../agent/atlas";
import { CHAT_META, DEFAULT_REPO, PEOPLE } from "../constants";
import { stamp, uid } from "../format";
import { canDelete, canSee } from "../rbac";
import { getStore } from "../store";
import type { ChatId, GitHubLink, Message, PersonId, ReplyNode, Role, Ticket, TicketImage, WeekDay } from "../types";

// Simulated network latency only when running in the browser (preview mode).
const wait = (ms = 120) => (typeof window === "undefined" ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------- reads

export async function getMessages(chatId: ChatId): Promise<Message[]> {
  await wait();
  return (await getStore()).listMessages(chatId);
}

export async function getTickets(): Promise<Ticket[]> {
  await wait();
  return (await getStore()).listTickets();
}

export async function getWeekActivity(): Promise<WeekDay[]> {
  await wait();
  return (await getStore()).week();
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
  const store = await getStore();
  const msg = { id: uid(), who: "me" as PersonId, time: stamp(), text: input.text };
  const saved = await store.appendMessage(input.chatId, msg, input.threadId, input.parentId);
  await store.logEvent({ kind: "message.posted", actor: "me", chatId: input.chatId, payload: { id: msg.id, threadId: input.threadId, parentId: input.parentId } });
  return saved;
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

/**
 * The rule-based Atlas: used by the browser preview and when no model is configured.
 * The server normally runs the model-backed agent instead (src/server/atlas).
 */
export async function askAtlas(input: AskAtlasInput): Promise<AskAtlasResult> {
  await wait(1300);
  const store = await getStore();
  const before = await store.listTickets();
  const reserved = await store.nextTicketId(); // a number for a ticket it may create
  const out = runAtlas({
    text: input.text, where: input.chatId, role: input.role, tickets: before,
    nextNum: Number(reserved.slice(3)), now: stamp(), uid,
  });
  const deleted = before.filter((t) => !out.tickets.some((x) => x.id === t.id)).map((t) => t.id);
  for (const id of deleted) await store.deleteTicket(id);
  for (const t of out.tickets) {
    const prev = before.find((b) => b.id === t.id);
    if (!prev) await store.insertTicket(t);
    else if (JSON.stringify(prev) !== JSON.stringify(t)) await store.saveTicket(t);
  }
  await store.appendMessage(input.chatId, { id: uid(), who: "atlas", time: stamp(), text: out.reply, ticket: out.ticket }, input.threadId, input.parentId);
  const touched: ChatId[] = [input.chatId];
  if (out.broadcast) {
    await store.appendMessage(out.broadcast.chat, { id: uid(), who: "atlas", time: stamp(), text: out.broadcast.text }, out.broadcast.thread);
    touched.push(out.broadcast.chat);
  }
  if (out.reply) await store.bumpWeek("a");
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
  await (await getStore()).appendMessage(chatId, { id: uid(), who: meta.who, time: stamp(), text });
}

// ---------------------------------------------------------------- tickets

async function requireTicket(id: string, role: Role) {
  const t = await (await getStore()).getTicket(id);
  if (!t) throw new ApiError(`${id} not found`, 404);
  if (!canSee(role, t)) throw new ApiError(`No access to ${id}`, 403);
  return t;
}

export async function createTicket(preset: Partial<Ticket>, role: Role): Promise<Ticket> {
  await wait(80);
  if (role === "guest") throw new ApiError("Guests can't create tickets", 403);
  const store = await getStore();
  const id = await store.nextTicketId();
  const t: Ticket = {
    id, team: "design", title: "", description: "", status: "To do", priority: "Medium", assignee: "me", reporter: "me",
    updated: "Just now", images: [], links: [], watch: null,
    activity: [{ who: PEOPLE.me.name, text: "created this ticket", time: stamp() }],
    ...preset,
  };
  t.id = id;
  if (role === "member") t.team = "design";
  await store.insertTicket(t);
  await store.bumpWeek("p");
  await store.logEvent({ kind: "ticket.created", actor: "me", ticketId: id });
  return t;
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
  const store = await getStore();
  const t = await requireTicket(input.id, input.role);
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
  if (note) t.activity.push({ who: PEOPLE.me.name, text: note, time: stamp() });
  await store.saveTicket(t);
  if (note) {
    await store.bumpWeek("p");
    await store.logEvent({ kind: "ticket.updated", actor: "me", ticketId: t.id, payload: { note } });
  }
  let broadcastChat: ChatId | null = null;
  if (announce && t.watch) {
    await store.appendMessage(t.watch.chat, { id: uid(), who: "atlas", time: stamp(), text: `Update on ${t.id}: Suvra Das ${announce}.` }, t.watch.thread);
    broadcastChat = t.watch.chat;
  }
  return { ticket: t, broadcastChat };
}

export async function deleteTicket(id: string, role: Role): Promise<void> {
  await wait(80);
  if (!canDelete(role)) throw new ApiError("Only org owners can delete tickets", 403);
  await requireTicket(id, role);
  const store = await getStore();
  await store.deleteTicket(id);
  await store.bumpWeek("p");
  await store.logEvent({ kind: "ticket.deleted", actor: "me", ticketId: id });
}

/** Demo: put the workspace back to its seed state. */
export async function resetWorkspace(): Promise<void> {
  await (await getStore()).reset();
}
