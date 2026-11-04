import "server-only";

import { after } from "next/server";

import { permissionProblem, summarize, toView, type ActionRecord, type TicketOp } from "@/lib/agent/actions";
import { RATE_ALL, RATE_WINDOW_MS, toRunView, type RunView } from "@/lib/agent/runs";
import { ApiError, effectiveRole, type AskAtlasInput, type AskAtlasResult } from "@/lib/api/service";
import { currentCtx } from "@/lib/context";
import { agentById, agentModeIn, ATLAS_ID, personOf, type Directory } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import { canCreateIn, canSee, viewerOf } from "@/lib/rbac";
import type { TeamDecision } from "@/lib/team-decisions";
import type { ChatId, Message, PersonId, ReplyNode, Role, Ticket } from "@/lib/types";
import { ATLAS_MODEL, llm } from "../llm";
import { pingChanges } from "../realtime";
import type { Progress } from "../atlas/progress";
import type { AtlasTrace } from "../atlas/run";
import { checkExtraction, extractRaw, MAX_NOTES, type NotesExtraction, type NotesWorld, type RawExtraction } from "./extract";

/**
 * Meeting notes to actions. Someone pastes notes or a transcript ("Add meeting notes" in
 * a channel, or "@atlas here are the notes from today's sync: …"); Atlas posts one message
 * with a summary, the decisions, the action items and the open questions, @mentioning
 * owners. Decisions go into the decision log (so the conflict guard knows them); action
 * items wait on a confirm card, so one click files them all as tickets, with Undo.
 */

export const MIN_NOTES = 40;
const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const today = () => new Date().toISOString().slice(0, 10);

/** The workspace as the notes reader sees it: open tickets the requester can see, and the decision log. */
export async function notesWorld(chatId: ChatId, role: Role): Promise<NotesWorld> {
  const { dir, store } = currentCtx();
  const viewer = viewerOf(dir, role);
  const [tickets, decisions] = await Promise.all([store.listTickets(), store.listTeamDecisions()]);
  const open = tickets.filter((t) => canSee(viewer, t) && t.status !== "Done" && t.status !== "Backburner");
  return { dir, chatId, open, decisions: decisions.filter((d) => !!dir.chats[d.chatId]), today: today() };
}

/** "@Maya" for people, "@tess" for agents: how the chat highlights a mention. */
export function mention(dir: Directory, id: PersonId) {
  const agent = agentById(dir, id);
  return agent ? `@${agent.handle}` : `@${personOf(dir, id).first}`;
}

export interface Applied {
  message: Message | ReplyNode;
  action: ActionRecord | null;
  decisions: TeamDecision[];
  /** Ticket ids proposed on the card, in the order of the action items that file them. */
  proposed: string[];
  reused: string[];
}

/**
 * Step 2: log the decisions, hold the action items for confirmation, post the message.
 * Called with a checked extraction (checkExtraction), so every id here is real.
 */
export async function applyMeetingNotes(
  ex: NotesExtraction,
  at: { chatId: ChatId; threadId: string | null; messageId: string; role: Role; who?: PersonId },
): Promise<Applied> {
  const { dir, store } = currentCtx();
  const viewer = viewerOf(dir, at.role);
  const where = dir.chats[at.chatId];
  const label = where?.kind === "channel" ? `#${where.label}` : "a direct message";
  const now = new Date().toISOString();

  // 1. Decisions: into the team's decision memory, linked to this message.
  const logged: TeamDecision[] = [];
  const existing = await store.listTeamDecisions();
  for (const d of ex.decisions) {
    const rec: TeamDecision = {
      id: `td${uid()}`, topic: d.topic, statement: d.statement, rationale: d.rationale, rejected: d.rejected, deciders: d.deciders,
      chatId: at.chatId, threadId: at.threadId, messageId: at.messageId, status: "active", supersededBy: null,
      flags: 0, lastFlaggedAt: null, source: "chat", createdAt: now,
    };
    await store.saveTeamDecision(rec);
    const old = d.replaces ? existing.find((x) => x.id === d.replaces && x.status === "active") : null;
    if (old) await store.saveTeamDecision({ ...old, status: "superseded", supersededBy: rec.id });
    logged.push(rec);
  }

  // 2. Action items: one create per new item, held on a confirm card. Items the
  // requester's role can't file in that team go to a team they can, or stay unfiled.
  const ops: TicketOp[] = [];
  const ticketFor = new Map<number, string>();
  for (const [i, a] of ex.actions.entries()) {
    if (a.existing) continue;
    const team = canCreateIn(viewer, a.team) ? a.team : canCreateIn(viewer, viewer.team ?? "") ? viewer.team! : null;
    if (!team) continue;
    const id = await store.nextTicketId();
    const ticket: Ticket = {
      id, team, title: a.title, status: "To do", priority: a.priority, assignee: a.owner, reporter: ATLAS_ID,
      description: `${a.description ? `${a.description}\n\n` : ""}From the meeting notes "${ex.title}" shared by ${personOf(dir, dir.me).name} in ${label}.`,
      links: [], images: [], updated: "Just now", blockedBy: [], due: a.due,
      watch: where?.kind === "channel" ? { chat: at.chatId, thread: at.threadId } : null,
      activity: [{ who: "Atlas", text: `created this from the meeting notes "${ex.title}" (shared by ${personOf(dir, dir.me).name})`, time: stamp() }],
    };
    const op: TicketOp = { type: "create", after: ticket };
    if (permissionProblem([op], viewer)) continue;
    ops.push(op);
    ticketFor.set(i, id);
  }
  let action: ActionRecord | null = null;
  if (ops.length) {
    // The card lists each ticket with its owner and date, so the click is an informed one.
    const lines = summarize(ops).map((s, i) => {
      const t = (ops[i] as Extract<TicketOp, { type: "create" }>).after;
      return t.due ? `${s}, due ${fmtDay(t.due)}` : s;
    });
    action = {
      id: `act${uid()}`, chatId: at.chatId, messageId: at.messageId, status: "pending", ops, summary: lines,
      destructive: false, undoUntil: null, createdAt: now,
    };
  }

  // 3. One message: summary, decisions, action items, open questions.
  const text = composeNotes(ex, dir, ticketFor, ops.length);
  if (action) await store.insertAction(action);
  const saved = await store.appendMessage(
    at.chatId,
    { id: at.messageId, who: at.who ?? ATLAS_ID, time: stamp(), text, actionId: action?.id ?? null },
    at.threadId,
  );
  return {
    message: action ? { ...saved, actionId: undefined, action: toView(action) } : saved,
    action,
    decisions: logged,
    proposed: [...ticketFor.values()],
    reused: ex.actions.flatMap((a) => (a.existing ? [a.existing] : [])),
  };
}

/** The message Atlas posts. Markdown the chat renders: bold headings and "- " lists. */
export function composeNotes(ex: NotesExtraction, dir: Directory, ticketFor: Map<number, string>, filing: number) {
  const out: string[] = [`**Notes: ${ex.title}**`];
  if (ex.summary.length) out.push(ex.summary.join("\n"));
  out.push(`From notes shared by ${personOf(dir, dir.me).name}.`);
  if (ex.decisions.length) {
    out.push(
      `**Decisions** (logged to the decision log)\n` +
        ex.decisions
          .map((d) => {
            const who = d.deciders.map((p) => personOf(dir, p).first).join(", ");
            const statement = /[.!?]$/.test(d.statement) ? d.statement : `${d.statement}.`;
            return `- ${statement}${d.rationale ? ` Why: ${d.rationale}` : ""}${who ? ` (${who})` : ""}`;
          })
          .join("\n"),
    );
  }
  if (ex.actions.length) {
    out.push(
      `**Action items**\n` +
        ex.actions
          .map((a, i) => {
            const owner = a.ownerNamed || a.existing ? mention(dir, a.owner) : `${mention(dir, a.owner)} (no owner named)`;
            const due = a.due ? `, due ${fmtDay(a.due)}` : "";
            if (a.existing) return `- ${owner} ${a.title}${due}: already tracked in ${a.existing}`;
            return `- ${owner} ${a.title}${due}${ticketFor.has(i) ? "" : " (not filed: your role can't create tickets for it)"}`;
          })
          .join("\n"),
    );
  }
  if (ex.questions.length) {
    out.push(`**Open questions**\n` + ex.questions.map((q) => `- ${q.ask ? `${mention(dir, q.ask)} ` : ""}${q.question}`).join("\n"));
  }
  if (!ex.decisions.length && !ex.actions.length && !ex.questions.length) out.push("I didn't find decisions, action items or open questions in these notes.");
  if (filing) out.push(`Confirm below to file ${filing === 1 ? "the ticket" : `all ${filing} tickets`} with owners and dates.`);
  return out.join("\n\n");
}

/** Both steps: read the notes, check, apply. Shared by the dialog's run and Atlas's tool. */
export async function processMeetingNotes(input: {
  text: string;
  title?: string;
  chatId: ChatId;
  threadId?: string | null;
  role: Role;
  messageId?: string;
  who?: PersonId;
  progress?: Progress;
}): Promise<Applied & { extraction: NotesExtraction }> {
  const { dir } = currentCtx();
  const text = input.text.trim();
  if (text.length < MIN_NOTES) throw new ApiError("Paste the meeting notes or transcript first (a few lines at least).");
  input.progress?.step("Reading the notes");
  const world = await notesWorld(input.chatId, input.role);
  const raw: RawExtraction = await extractRaw({
    text: text.slice(0, MAX_NOTES), title: input.title, world,
    onCount: (c) => {
      const parts = [c.decisions && `${c.decisions} decision${c.decisions > 1 ? "s" : ""}`, c.actions && `${c.actions} action item${c.actions > 1 ? "s" : ""}`].filter(Boolean);
      if (parts.length) input.progress?.step(`Reading the notes: ${parts.join(", ")} so far`);
    },
  });
  input.progress?.step("Checking owners, dates and open tickets");
  const extraction = checkExtraction(raw, world, { title: input.title, requester: dir.me });
  const applied = await applyMeetingNotes(extraction, {
    chatId: input.chatId, threadId: input.threadId ?? null, messageId: input.messageId ?? uid(), role: input.role, who: input.who,
  });
  return { ...applied, extraction };
}

// ---------------------------------------------------------------- the dialog, as an agent run

const TITLE_LINE = "Meeting notes: ";
const fnv = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
/** A run carries the title on its first line, then the notes. */
export const encodeNotes = (title: string, text: string) => `${TITLE_LINE}${title.replace(/\s+/g, " ").trim().slice(0, 80)}\n\n${text}`;
export function decodeNotes(runText: string) {
  if (!runText.startsWith(TITLE_LINE)) return { title: "", text: runText };
  const nl = runText.indexOf("\n");
  return { title: runText.slice(TITLE_LINE.length, nl < 0 ? undefined : nl).trim(), text: nl < 0 ? "" : runText.slice(nl).trim() };
}

/**
 * "Add meeting notes" in a channel: queued as an Atlas run (trigger "notes"), so the
 * channel shows Atlas working live, then the notes message lands in its place.
 */
export async function queueMeetingNotes(input: { chatId: ChatId; text: string; title?: string; role?: Role }): Promise<RunView> {
  const { dir, store } = currentCtx();
  const role = effectiveRole(input.role);
  const meta = dir.chats[input.chatId];
  if (!meta || meta.kind !== "channel") throw new ApiError("Meeting notes go in a channel", 404);
  if (role === "guest") throw new ApiError("Guests can't add meeting notes", 403);
  if (!agentModeIn(dir, input.chatId, ATLAS_ID)) throw new ApiError("Atlas isn't in this channel. Add it in the channel settings to process notes.", 403);
  if (!llm()) throw new ApiError("Processing notes needs the model, which isn't configured here.", 503);
  const text = String(input.text ?? "").trim();
  if (text.length < MIN_NOTES) throw new ApiError("Paste the meeting notes or transcript first (a few lines at least).");
  if (text.length > MAX_NOTES) throw new ApiError(`That's longer than ${MAX_NOTES.toLocaleString("en-US")} characters. Paste the part with the decisions and next steps.`);
  if ((await store.countRunsSince(input.chatId, new Date(Date.now() - RATE_WINDOW_MS).toISOString())) >= RATE_ALL)
    throw new ApiError("Atlas is busy in this channel right now. Try again in a few minutes.", 429);

  // Same notes within a minute (a double click) → the same run.
  const key = `notes${fnv(`${dir.workspace.id}|${input.chatId}|${input.title ?? ""}|${text}`)}${Math.floor(Date.now() / 60_000).toString(36)}`;
  const run = await store.enqueueRun({
    id: `run${key}${Date.now().toString(36)}`, triggerMessageId: key, chatId: input.chatId, threadId: null, agentId: ATLAS_ID, trigger: "notes",
    depth: 0, parentRunId: null, requester: dir.me, role, text: encodeNotes(input.title ?? "", text),
    status: "queued", attempts: 0, error: null, result: null, trace: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
  });
  if (run.status === "queued") {
    after(async () => {
      const { processRun } = await import("../atlas/queue");
      await processRun(run.id);
    });
  }
  return toRunView(run);
}

/** The run itself (called by the queue in place of the agent loop). */
export async function runNotes(
  input: AskAtlasInput & { replyId?: string; progress?: Progress },
): Promise<AskAtlasResult & { trace: AtlasTrace; replyMessage?: Message | ReplyNode }> {
  const { dir, store } = currentCtx();
  const started = Date.now();
  const trace: AtlasTrace = {
    model: ATLAS_MODEL, effort: "low", steps: 1, tools: [], usage: { prompt: 0, cached: 0, completion: 0, reasoning: 0 },
    ms: 0, reply: "", citations: { kept: [], invalid: [], overLimit: [] },
  };
  const { title, text } = decodeNotes(input.text);
  let replyMessage: Message | ReplyNode;
  try {
    const out = await processMeetingNotes({ text, title, chatId: input.chatId, threadId: input.threadId ?? null, role: input.role, messageId: input.replyId, progress: input.progress });
    replyMessage = out.message;
    trace.reply = out.message.text;
    trace.action = out.action ? { id: out.action.id, status: out.action.status } : null;
    if (out.decisions.length) await pingChanges({ chats: [], tickets: false, decisions: true, origin: null, workspaceId: dir.workspace.id });
  } catch (e) {
    trace.error = (e as Error).message;
    replyMessage = await store.appendMessage(
      input.chatId,
      { id: input.replyId ?? uid(), who: ATLAS_ID, time: stamp(), text: "Sorry, I couldn't process those notes just now, so nothing was logged or filed. Please try again in a moment." },
      input.threadId,
    );
  }
  trace.ms = Date.now() - started;
  console.log(`[notes] ${dir.workspace.id}/${input.chatId} ${trace.ms}ms${trace.error ? ` ERROR ${trace.error}` : ""}`);
  return { touchedChats: [input.chatId], openTicket: null, deleted: [], trace, replyMessage };
}
