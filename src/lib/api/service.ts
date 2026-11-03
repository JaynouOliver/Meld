/**
 * The app API, implemented once over a Store (see src/lib/store):
 * - on the server, /api/rpc runs these against Supabase (or memory if not configured);
 * - in the single-file preview (NEXT_PUBLIC_DATA_MODE=local), the browser runs them in memory.
 * Signatures are the contract the UI depends on; see ./index.ts.
 */
import { runAtlas } from "../agent/atlas";
import { applyOps, permissionProblem, revertOps, UNDO_WINDOW_MS } from "../agent/actions";
import { toRunView, type RunResult, type RunView } from "../agent/runs";
import { currentDir } from "../context";
import { ATLAS_ID, personOf, type Directory } from "../directory";
import { stamp, uid } from "../format";
import { canCreateIn, canDelete, canSee, clampRole, viewerOf } from "../rbac";
import { getStore } from "../store";
import type { ChatId, GitHubLink, Message, PersonId, ReplyNode, Role, Ticket, TicketImage, WeekDay } from "../types";

// Simulated network latency only when running in the browser (preview mode).
const wait = (ms = 120) => (typeof window === "undefined" ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** The role to act with: what the UI asked for ("view as"), never above the real role. */
export function effectiveRole(requested?: Role): Role {
  return clampRole(requested, currentDir().role);
}

const viewer = (role?: Role) => viewerOf(currentDir(), effectiveRole(role));
const myName = () => personOf(currentDir(), currentDir().me).name;

/** Only chats this person can see (their workspace's channels, their own DMs). */
function requireChat(chatId: ChatId) {
  if (!currentDir().chats[chatId]) throw new ApiError("That conversation doesn't exist", 404);
}

// ---------------------------------------------------------------- workspace

/**
 * The signed-in person's workspace directory, or null if they haven't joined or created
 * one yet (the app then sends them to onboarding). The server version lives in the RPC
 * route; this one serves the browser preview (the Northwind demo).
 */
export async function getDirectory(): Promise<Directory | null> {
  return currentDir();
}

// ---------------------------------------------------------------- reads

export async function getMessages(chatId: ChatId): Promise<Message[]> {
  await wait();
  requireChat(chatId);
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
  /** Reply in this thread (threads are flat: there are no replies to replies). */
  threadId?: string | null;
  /** The sender's role; Atlas acts with it when the message is addressed to Atlas. */
  role?: Role;
}

/** The saved message, plus the Atlas run it started (server only: the reply arrives later). */
export type PostedMessage = (Message | ReplyNode) & { runId?: string | null };

export async function postMessage(input: PostMessageInput): Promise<PostedMessage> {
  await wait(60);
  requireChat(input.chatId);
  const text = input.text.trim().slice(0, 8000);
  if (!text) throw new ApiError("Message is empty");
  const store = await getStore();
  const me = currentDir().me;
  const msg = { id: uid(), who: me as PersonId, time: stamp(), text };
  const [saved] = await Promise.all([
    store.appendMessage(input.chatId, msg, input.threadId),
    store.logEvent({ kind: "message.posted", actor: me, chatId: input.chatId, payload: { id: msg.id, threadId: input.threadId } }),
  ]);
  return saved;
}

export interface AskAtlasInput extends PostMessageInput {
  role: Role;
}

export type AskAtlasResult = RunResult;

/** Atlas runs in progress or just finished, so every browser can show "Atlas is working…". */
export async function getAgentRuns(): Promise<RunView[]> {
  const store = await getStore();
  return (await store.listRecentRuns()).map(toRunView);
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
    text: input.text, where: input.chatId, role: effectiveRole(input.role), tickets: before,
    nextNum: Number(reserved.split("-").pop()), now: stamp(), uid,
  });
  const deleted = before.filter((t) => !out.tickets.some((x) => x.id === t.id)).map((t) => t.id);
  for (const id of deleted) await store.deleteTicket(id);
  for (const t of out.tickets) {
    const prev = before.find((b) => b.id === t.id);
    if (!prev) await store.insertTicket(t);
    else if (JSON.stringify(prev) !== JSON.stringify(t)) await store.saveTicket(t);
  }
  await store.appendMessage(input.chatId, { id: uid(), who: ATLAS_ID, time: stamp(), text: out.reply, ticket: out.ticket }, input.threadId);
  const touched: ChatId[] = [input.chatId];
  if (out.broadcast) {
    await store.appendMessage(out.broadcast.chat, { id: uid(), who: ATLAS_ID, time: stamp(), text: out.broadcast.text }, out.broadcast.thread);
    touched.push(out.broadcast.chat);
  }
  if (out.reply) await store.bumpWeek("a");
  return { touchedChats: touched, openTicket: out.open, deleted };
}

const TEAMMATE_LINES = ["Sounds good.", "Got it, I'll take a look.", "Makes sense. Let's talk it through on Thursday.", "Perfect, thanks!"];
let replyIdx = 0;

/** Demo workspace only: a sample teammate answers in a DM. */
export async function teammateReply(chatId: ChatId): Promise<void> {
  const dir = currentDir();
  const meta = dir.chats[chatId];
  if (!dir.demo || !meta || meta.kind !== "dm" || meta.who === ATLAS_ID) return;
  await new Promise((r) => setTimeout(r, 1600));
  const text = TEAMMATE_LINES[replyIdx++ % TEAMMATE_LINES.length];
  await (await getStore()).appendMessage(chatId, { id: uid(), who: meta.who, time: stamp(), text });
}

// ---------------------------------------------------------------- tickets

async function requireTicket(id: string, role: Role) {
  const t = await (await getStore()).getTicket(id);
  if (!t) throw new ApiError(`${id} not found`, 404);
  if (!canSee(viewer(role), t)) throw new ApiError(`No access to ${id}`, 403);
  return t;
}

export async function createTicket(preset: Partial<Ticket>, role: Role): Promise<Ticket> {
  await wait(80);
  const v = viewer(role);
  if (v.role === "guest") throw new ApiError("Guests can't create tickets", 403);
  const dir = currentDir();
  const team = preset.team && dir.teams.some((x) => x.id === preset.team) ? preset.team : v.team ?? dir.teams[0]?.id ?? "general";
  if (!canCreateIn(v, team)) throw new ApiError("Your role can only create tickets in your team", 403);
  if (preset.assignee && !dir.people[preset.assignee]) throw new ApiError("Assignee isn't in this workspace");
  const store = await getStore();
  const id = await store.nextTicketId();
  const t: Ticket = {
    id, team, title: "", description: "", status: "To do", priority: "Medium", assignee: dir.me, reporter: dir.me,
    updated: "Just now", images: [], links: [], watch: null,
    activity: [{ who: myName(), text: "created this ticket", time: stamp() }],
    ...preset,
  };
  t.id = id;
  t.team = team;
  t.reporter = dir.me;
  await store.insertTicket(t);
  await Promise.all([store.bumpWeek("p"), store.logEvent({ kind: "ticket.created", actor: dir.me, ticketId: id })]);
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
    if (!currentDir().people[p.assignee]) throw new ApiError("Assignee isn't in this workspace");
    t.assignee = p.assignee;
    note = announce = `assigned it to ${personOf(currentDir(), p.assignee).name}`;
  }
  if (input.addLink) {
    const num = input.addLink.num.replace(/[^0-9]/g, "");
    if (!num) throw new ApiError("Link number is required");
    t.links.push({ id: uid(), kind: input.addLink.kind, num, repo: currentDir().workspace.repo ?? "github" });
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
  if (note) t.activity.push({ who: myName(), text: note, time: stamp() });
  const writes: Promise<unknown>[] = [store.saveTicket(t)];
  if (note) writes.push(store.bumpWeek("p"), store.logEvent({ kind: "ticket.updated", actor: currentDir().me, ticketId: t.id, payload: { note } }));
  let broadcastChat: ChatId | null = null;
  if (announce && t.watch) {
    writes.push(store.appendMessage(t.watch.chat, { id: uid(), who: ATLAS_ID, time: stamp(), text: `Update on ${t.id}: ${myName()} ${announce}.` }, t.watch.thread));
    broadcastChat = t.watch.chat;
  }
  await Promise.all(writes);
  return { ticket: t, broadcastChat };
}

export async function deleteTicket(id: string, role: Role): Promise<void> {
  await wait(80);
  if (!canDelete(effectiveRole(role))) throw new ApiError("Only org owners can delete tickets", 403);
  await requireTicket(id, role);
  const store = await getStore();
  await Promise.all([store.deleteTicket(id), store.bumpWeek("p"), store.logEvent({ kind: "ticket.deleted", actor: currentDir().me, ticketId: id })]);
}

/** Demo: put the workspace back to its seed state. */
export async function resetWorkspace(): Promise<void> {
  if (!currentDir().demo) throw new ApiError("Only the sample workspace can be reset", 403);
  if (effectiveRole() !== "owner") throw new ApiError("Only owners can reset the workspace", 403);
  await (await getStore()).reset();
}

// ---------------------------------------------------------------- Atlas actions

export interface DecideActionInput {
  id: string;
  decision: "confirm" | "cancel" | "undo";
  role: Role;
}

export interface DecideActionResult {
  /** Chats whose messages changed (the card's chat, plus channels Atlas posted updates to). */
  chats: ChatId[];
  status: "applied" | "canceled" | "undone";
}

/**
 * Confirm, cancel or undo an Atlas action from its card. The clicker's role is
 * re-checked here, and each card can only be decided once.
 */
export async function decideAction(input: DecideActionInput): Promise<DecideActionResult> {
  await wait(80);
  const store = await getStore();
  const a = await store.getAction(input.id);
  if (!a) throw new ApiError("That action no longer exists", 404);
  if (input.decision !== "cancel") {
    const problem = permissionProblem(a.ops, viewer(input.role));
    if (problem) throw new ApiError(problem, 403);
  }
  const taken = () => new ApiError("Someone already decided this one", 409);

  if (input.decision === "cancel") {
    if (!(await store.transitionAction(a.id, ["pending"], "canceled"))) throw taken();
    return { chats: [a.chatId], status: "canceled" };
  }
  if (input.decision === "confirm") {
    const undoUntil = new Date(Date.now() + UNDO_WINDOW_MS).toISOString();
    if (!(await store.transitionAction(a.id, ["pending"], "applied", { undoUntil }))) throw taken();
    const posted = await applyOps(store, a.ops, a.chatId);
    return { chats: [a.chatId, ...posted], status: "applied" };
  }
  // undo
  if (a.status !== "applied") throw taken();
  if (!a.undoUntil || Date.parse(a.undoUntil) < Date.now()) throw new ApiError("The undo window has passed", 410);
  if (!(await store.transitionAction(a.id, ["applied"], "undone", { undoUntil: null }))) throw taken();
  await revertOps(store, a.ops, a.chatId);
  return { chats: [a.chatId], status: "undone" };
}
