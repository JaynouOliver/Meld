import type OpenAI from "openai";

import { PRIORITIES, STATUSES } from "@/lib/constants";
import { currentDir } from "@/lib/context";
import { ATLAS_ID, personOf, type AgentTool, type Directory } from "@/lib/directory";
import { displayTime, stamp, uid } from "@/lib/format";
import type { Store } from "@/lib/store";
import type { MessageHit } from "@/lib/store/types";
import { needsConfirmation, type TicketOp } from "@/lib/agent/actions";
import { blockersOf, createsCycle } from "@/lib/agent/blockers";
import { matchQuery } from "@/lib/query-language";
import { canCreateIn, canDelete, canSee, viewerOf } from "@/lib/rbac";
import { cleanEstimate, cleanLabels, isValidDue, MAX_COMMENT_LENGTH } from "@/lib/ticket-fields";
import type { ChatId, PersonId, Priority, Role, TeamId, Ticket, TicketStatus } from "@/lib/types";
import { catchUp } from "./catch-up";
import { ticketLine } from "./prompt";

/** Atlas's tools. Permissions are enforced here, in code; the prompt only explains them. */
const TEAMS_ENUM = "__TEAMS__";
const PEOPLE_ENUM = "__PEOPLE__";

/** Which permission group each tool needs (an agent's `tools`). */
const TOOL_GROUP: Record<string, AgentTool> = {
  list_tickets: "read", get_ticket: "read", ticket_discussion: "read", search_messages: "read", catch_up: "read", search_decisions: "read",
  create_ticket: "write", update_ticket: "write", comment_on_ticket: "write", delete_ticket: "delete", start_mission: "write",
};
export const toolAllowed = (name: string, allowed: AgentTool[] = ["read", "write", "delete"]) => allowed.includes(TOOL_GROUP[name] ?? "read");

/** The tools this agent may use, with this workspace's teams and people filled into the enums. */
export function toolsFor(dir: Directory, allowed?: AgentTool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const teams = dir.teams.map((t) => t.id);
  const people = dir.personOrder.filter((id) => id !== ATLAS_ID);
  const all: OpenAI.Chat.Completions.ChatCompletionTool[] = JSON.parse(
    JSON.stringify(TOOLS).replaceAll(`["${TEAMS_ENUM}"]`, JSON.stringify(teams)).replaceAll(`["${PEOPLE_ENUM}"]`, JSON.stringify(people)),
  );
  return all.filter((t) => t.type === "function" && toolAllowed(t.function.name, allowed));
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_tickets",
      description:
        "List tickets the requester can see, optionally filtered. Use to find tickets by topic, assignee, status or team before acting.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'Optional filter. Free text matches title or ID; also supports status:review assignee:ravi team:payments priority:high label:billing due:overdue due:week is:agent is:draft is:blocked, and "-" to negate (e.g. -status:done).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ticket",
      description: "Get one ticket's full details: description, labels, due date, estimate, checklist, GitHub links, latest comments and recent activity.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "Ticket ID, e.g. NW-130" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_ticket",
      description: "Create a ticket.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short imperative title, sentence case, under 80 characters" },
          allow_duplicate: {
            type: "boolean",
            description: "Only set true when the requester explicitly wants a new ticket despite a similar existing one.",
          },
          team: { type: "string", enum: [TEAMS_ENUM] },
          assignee: { type: "string", enum: [PEOPLE_ENUM] },
          priority: { type: "string", enum: [...PRIORITIES] },
          description: { type: "string", description: "Optional: context, acceptance criteria" },
          pr_number: { type: "string", description: "Optional GitHub pull request number to link" },
          labels: { type: "array", items: { type: "string" }, description: 'Optional short lowercase tags, e.g. ["billing", "bug"]. Reuse labels the team already uses.' },
          due: { type: "string", description: "Optional due date, YYYY-MM-DD" },
          estimate: { type: "number", description: "Optional story points (0-100, whole or half points)" },
        },
        required: ["title", "team", "assignee", "priority"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_ticket",
      description: "Change a ticket. Only include the fields that should change.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: [...STATUSES] },
          assignee: { type: "string", enum: [PEOPLE_ENUM] },
          priority: { type: "string", enum: [...PRIORITIES] },
          title: { type: "string" },
          description: { type: "string" },
          link_pr: { type: "string", description: "GitHub pull request number to link" },
          link_issue: { type: "string", description: "GitHub issue number to link" },
          blocked_by_add: {
            type: "array",
            items: { type: "string" },
            description: 'Ticket IDs that block this one ("NW-131 blocks NW-130" → update NW-130 with blocked_by_add ["NW-131"]). Owners are notified automatically.',
          },
          blocked_by_remove: { type: "array", items: { type: "string" }, description: "Ticket IDs that no longer block this one" },
          labels_add: { type: "array", items: { type: "string" }, description: "Labels to add, e.g. [\"bug\"]" },
          labels_remove: { type: "array", items: { type: "string" }, description: "Labels to remove" },
          due: { type: "string", description: 'Due date YYYY-MM-DD, or "none" to clear it' },
          estimate: { type: "number", description: "Story points (0-100, whole or half points)" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comment_on_ticket",
      description:
        "Add a comment to a ticket, signed by you: a status note, a question for the assignee, or a summary of a discussion. Mention people as @first-name. Use update_ticket for field changes, not comments.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Ticket ID, e.g. NW-130" },
          text: { type: "string", description: "The comment, plain text, a few sentences at most" },
        },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_mission",
      description:
        'Start a mission: a goal with a deadline that you plan into owned, dated, dependent tasks the team can launch. Use when someone asks for a mission, or to plan and drive a multi-step outcome ("make sure the pricing page ships by Friday"). Not for single tickets.',
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The outcome, in the requester's words" },
          deadline: { type: "string", description: "YYYY-MM-DD if the requester gave a date or day; omit otherwise" },
        },
        required: ["goal"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_decisions",
      description:
        'The team\'s decision log: decisions settled in conversation (and answered on missions), with why, what was rejected, who decided and when. Use for "why did we…?", "what did we decide about…?", or before proposing something that may already be decided. Cite the source message id as [[id]].',
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Words about the topic, e.g. 'onboarding checklist modal'" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "catch_up",
      description:
        'What the requester missed: new messages in chats they can see since they last opened each one (busy chats come summarized), things addressed to them, and changes others made to their tickets. Use for "what did I miss?", "catch me up", "what happened in #x today?".',
      parameters: {
        type: "object",
        properties: {
          since_hours: { type: "number", description: 'Only when the requester names a window ("today" ≈ 12, "this week" ≈ 168). Otherwise omit: it uses their read position.' },
          chat: { type: "string", description: "Optional: one channel (#name) or a person's DM to focus on" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_ticket",
      description: "Permanently delete a ticket. Org owners only. Only when the requester explicitly asks to delete.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ticket_discussion",
      description:
        "Recent chat messages that mention a ticket (by ID), across channels, DMs and threads. Use it to find decisions, blockers and context behind a ticket's status.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "Ticket ID, e.g. NW-130" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_messages",
      description: "Search chat history across channels and DMs for a topic. Returns matching messages with where and when.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Changes staged during one Atlas run, keyed by ticket. Nothing is written until the
 * run ends; then the server applies the batch (with undo) or holds it for the
 * requester to confirm (deletes, bulk edits). See src/lib/agent/actions.ts.
 */
export type Plan = Map<string, { before: Ticket | null; after: Ticket | null; changes: string[] }>;

export interface Effects {
  plan: Plan;
  read: string[];
}

/** The net changes of a run, one op per ticket. */
export function planToOps(plan: Plan): TicketOp[] {
  const ops: TicketOp[] = [];
  for (const { before, after, changes } of plan.values()) {
    if (!before && after) ops.push({ type: "create", after });
    else if (before && !after) ops.push({ type: "delete", before });
    else if (before && after && changes.length) ops.push({ type: "update", before, after, changes });
  }
  return ops;
}

export interface ToolCtx {
  role: Role;
  where: ChatId;
  /** Set when Atlas was asked inside a thread: new tickets report back to it. */
  threadId?: string | null;
  effects: Effects;
  store: Store;
  /** The running agent's tool groups (Atlas: all). */
  allowed?: AgentTool[];
  /** Who signs comments: the running agent (Atlas when not given). */
  agentId?: PersonId;
}

const STOP = new Set(["the", "a", "an", "to", "for", "of", "on", "in", "and", "or", "with", "add", "fix", "make", "new"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** An existing visible ticket whose title overlaps heavily with this one, if any. */
function likelyDuplicate(title: string, tickets: Ticket[]): Ticket | null {
  const a = words(title);
  if (a.size < 2) return null;
  let best: { t: Ticket; score: number } | null = null;
  for (const t of tickets) {
    const b = words(t.title);
    const inter = [...a].filter((w) => b.has(w)).length;
    const score = inter / Math.min(a.size, b.size || 1);
    if (score >= 0.6 && inter >= 2 && (!best || score > best.score)) best = { t, score };
  }
  return best?.t ?? null;
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const err = (message: string) => ({ ok: false as const, error: message });
const clone = <T,>(x: T): T => structuredClone(x);

/** A ticket as this run sees it: staged state first, then the store. */
async function current(ctx: ToolCtx, id: string): Promise<Ticket | null> {
  const staged = ctx.effects.plan.get(id);
  if (staged) return staged.after ? clone(staged.after) : null;
  return ctx.store.getTicket(id);
}

async function findVisible(ctx: ToolCtx, id: unknown): Promise<Ticket | { ok: false; error: string }> {
  const key = String(id ?? "").toUpperCase().trim();
  const t = key ? await current(ctx, key) : null;
  // Same answer for missing and hidden tickets, so Atlas can't leak that a hidden one exists.
  if (!t || !canSee(viewer(ctx.role), t)) return err(`${key || "That ticket"} doesn't exist or the requester can't see it.`);
  return t;
}

/** Record a staged change and tell the model what happens next. */
function stage(ctx: ToolCtx, id: string, before: Ticket | null, after: Ticket | null, changes: string[]) {
  const prev = ctx.effects.plan.get(id);
  ctx.effects.plan.set(id, { before: prev ? prev.before : before, after, changes: [...(prev?.changes ?? []), ...changes] });
  const confirm = needsConfirmation(planToOps(ctx.effects.plan));
  return {
    staged: true,
    needs_confirmation: confirm,
    note: confirm
      ? "Held for confirmation: nothing changes until the requester confirms in the card under your reply."
      : "Applied when you finish your reply (the requester can undo it).",
  };
}

function srcLabel(where: ChatId) {
  const dir = currentDir();
  const m = dir.chats[where];
  if (!m) return "a chat";
  return m.kind === "channel" ? `#${m.label}` : m.who === ATLAS_ID ? "a DM with Atlas" : `a DM with ${personOf(dir, m.who).name}`;
}

const repo = () => currentDir().workspace.repo ?? "github";
const viewer = (role: Role) => viewerOf(currentDir(), role);
const isMember = (id: string) => id !== ATLAS_ID && !!currentDir().people[id];
/** Only messages from chats the requester can see (channels, their own DMs). */
const visibleHits = (hits: MessageHit[]) => hits.filter((m) => !!currentDir().chats[m.chatId]);

/** One search hit for the model: where, message id (for citations), when, who, what. */
function hitLine(m: MessageHit) {
  const where = srcLabel(m.chatId).replace("a DM with Atlas", "DM with Atlas");
  return `${where}${m.threadId ? " (thread reply)" : ""} [${m.id} ${displayTime(m.time)}] ${personOf(currentDir(), m.who).name}: ${m.text.slice(0, 280)}`;
}

export async function runTool(name: string, args: Args, ctx: ToolCtx): Promise<unknown> {
  const { role, effects, store } = ctx;
  if (!toolAllowed(name, ctx.allowed)) return err(`You don't have the ${TOOL_GROUP[name]} permission for ${name}. Ask a teammate or @atlas.`);
  switch (name) {
    case "list_tickets": {
      const q = str(args.query) ?? "";
      // Store tickets with this run's staged changes on top.
      const byId = new Map((await store.listTickets()).map((t) => [t.id, t] as [string, Ticket | null]));
      for (const [id, { after }] of effects.plan) byId.set(id, after);
      const rows = [...byId.values()].filter((t): t is Ticket => !!t && canSee(viewer(role), t) && matchQuery(t, q, currentDir()));
      return { ok: true, count: rows.length, tickets: rows.slice(0, 40).map(ticketLine) };
    }
    case "get_ticket": {
      const t = await findVisible(ctx, args.id);
      if ("ok" in t) return t;
      effects.read.push(t.id);
      const everyone = await store.listTickets();
      return {
        ok: true,
        ticket: ticketLine(t),
        blocked_by: blockersOf(t).map((id) => {
          const b = everyone.find((x) => x.id === id);
          return b && canSee(viewer(ctx.role), b) ? ticketLine(b) : `${id} (not visible or deleted)`;
        }),
        blocks: everyone.filter((d) => blockersOf(d).includes(t.id) && canSee(viewer(ctx.role), d)).map(ticketLine),
        description: t.description || "(none)",
        labels: t.labels ?? [],
        due: t.due ?? null,
        estimate: t.estimate ?? null,
        checklist: (t.checklist ?? []).map((c) => `[${c.done ? "x" : " "}] ${c.text}`),
        comments: (t.comments ?? []).slice(-5).map((c) => `${personOf(currentDir(), c.who).name} (${displayTime(c.time)}): ${c.text.slice(0, 500)}`),
        reporter: personOf(currentDir(), t.reporter).name,
        recent_activity: t.activity.slice(-5).map((a) => `${a.who} ${a.text} (${displayTime(a.time)})`),
      };
    }
    case "create_ticket": {
      if (role === "guest") return err("Guests can't create tickets.");
      const team = args.team as TeamId;
      if (!currentDir().teams.some((x) => x.id === team)) return err(`Unknown team ${String(args.team)}.`);
      if (!canCreateIn(viewer(role), team)) return err("Team members can only create tickets in their own team.");
      const title = str(args.title);
      if (!title) return err("A title is required.");
      const assignee = isMember(String(args.assignee)) ? (args.assignee as PersonId) : currentDir().me;
      const priority = PRIORITIES.includes(args.priority as Priority) ? (args.priority as Priority) : "Medium";
      const fields = ticketFields(args);
      if ("error" in fields) return err(fields.error);
      // Duplicate check against what the requester can see (including this run's staged tickets).
      if (args.allow_duplicate !== true) {
        const byId = new Map((await store.listTickets()).map((t) => [t.id, t] as [string, Ticket | null]));
        for (const [sid, { after }] of effects.plan) byId.set(sid, after);
        const visible = [...byId.values()].filter((t): t is Ticket => !!t && canSee(viewer(role), t) && t.status !== "Done");
        const dup = likelyDuplicate(title, visible);
        if (dup) {
          return err(
            `Possible duplicate of ${ticketLine(dup)}. Prefer updating that ticket (e.g. add to its description). Only create a new one if the requester clearly wants a separate ticket; then call again with allow_duplicate: true.`,
          );
        }
      }
      const id = await store.nextTicketId();
      const meta = currentDir().chats[ctx.where];
      const pr = str(args.pr_number)?.replace(/\D/g, "");
      const t: Ticket = {
        id, team, assignee, priority, title: title.slice(0, 120), status: "To do", reporter: ATLAS_ID,
        description: str(args.description) ?? `Requested by ${personOf(currentDir(), currentDir().me).name} in ${srcLabel(ctx.where)}.`,
        links: pr ? [{ id: uid(), kind: "PR", num: pr, repo: repo() }] : [],
        images: [], updated: "Just now", ...fields,
        // Atlas posts later updates about this ticket where it was asked for.
        watch: meta?.kind === "channel" ? { chat: ctx.where, thread: ctx.threadId ?? null } : null,
        activity: [{ who: "Atlas", text: `created this ticket from ${srcLabel(ctx.where)} (asked by ${personOf(currentDir(), currentDir().me).name})`, time: stamp() }],
      };
      return { ok: true, created: ticketLine(t), ...stage(ctx, id, null, t, []) };
    }
    case "update_ticket": {
      const found = await findVisible(ctx, args.id);
      if ("ok" in found) return found;
      const before = clone(found);
      const t = found;
      const changes: string[] = [];
      const status = args.status as TicketStatus | undefined;
      if (status && STATUSES.includes(status) && status !== t.status) {
        changes.push(`status ${t.status} → ${status}`);
        t.status = status;
      }
      const who = args.assignee as PersonId | undefined;
      if (who && isMember(who) && who !== t.assignee) {
        changes.push(`assignee → ${personOf(currentDir(), who).name}`);
        t.assignee = who;
      }
      const pr = args.priority as Priority | undefined;
      if (pr && PRIORITIES.includes(pr) && pr !== t.priority) {
        changes.push(`priority → ${pr}`);
        t.priority = pr;
      }
      const title = str(args.title);
      if (title && title !== t.title) {
        changes.push("title updated");
        t.title = title.slice(0, 120);
      }
      const desc = str(args.description);
      if (desc && desc !== t.description) {
        changes.push("description updated");
        t.description = desc;
      }
      for (const [key, kind] of [["link_pr", "PR"], ["link_issue", "Issue"]] as const) {
        const num = str(args[key])?.replace(/\D/g, "");
        if (num && !t.links.some((l) => l.kind === kind && l.num === num)) {
          t.links.push({ id: uid(), kind, num, repo: repo() });
          changes.push(`linked ${kind} #${num}`);
        }
      }
      const visibleNow = async () => {
        const byId = new Map((await store.listTickets()).map((x) => [x.id, x] as [string, Ticket | null]));
        for (const [sid, { after }] of effects.plan) byId.set(sid, after);
        return [...byId.values()].filter((x): x is Ticket => !!x);
      };
      const adds = Array.isArray(args.blocked_by_add) ? args.blocked_by_add.map((x) => String(x).toUpperCase().trim()) : [];
      const removes = Array.isArray(args.blocked_by_remove) ? args.blocked_by_remove.map((x) => String(x).toUpperCase().trim()) : [];
      if (adds.length) {
        const all = await visibleNow();
        for (const id of adds) {
          const b = all.find((x) => x.id === id);
          if (!b || !canSee(viewer(role), b)) return err(`${id} doesn't exist or the requester can't see it.`);
          if (id === t.id) return err("A ticket can't block itself.");
          if (createsCycle(t.id, id, all.map((x) => (x.id === t.id ? t : x)))) return err(`${t.id} already blocks ${id} (directly or through other tickets), so ${id} can't block it.`);
          if (!blockersOf(t).includes(id)) {
            t.blockedBy = [...blockersOf(t), id];
            changes.push(`blocked by ${id}`);
          }
        }
      }
      for (const id of removes) {
        if (blockersOf(t).includes(id)) {
          t.blockedBy = blockersOf(t).filter((x) => x !== id);
          changes.push(`no longer blocked by ${id}`);
        }
      }
      if (Array.isArray(args.labels_add) || Array.isArray(args.labels_remove)) {
        const drop = cleanLabels(Array.isArray(args.labels_remove) ? args.labels_remove : []);
        const add = cleanLabels([...(t.labels ?? []), ...(Array.isArray(args.labels_add) ? args.labels_add : [])]);
        if ("error" in drop) return err(drop.error);
        if ("error" in add) return err(add.error);
        const next = add.labels.filter((l) => !drop.labels.includes(l));
        const added = next.filter((l) => !(t.labels ?? []).includes(l));
        const removed = (t.labels ?? []).filter((l) => !next.includes(l));
        if (added.length) changes.push(`label +${added.join(", +")}`);
        if (removed.length) changes.push(`label -${removed.join(", -")}`);
        t.labels = next;
      }
      if (args.due !== undefined) {
        const due = String(args.due ?? "").trim();
        const next = !due || due.toLowerCase() === "none" ? null : due;
        if (next && !isValidDue(next)) return err("due must be a real date in YYYY-MM-DD form, or \"none\".");
        if (next !== (t.due ?? null)) {
          changes.push(next ? `due ${next}` : "due date cleared");
          t.due = next;
        }
      }
      if (args.estimate !== undefined) {
        const r = cleanEstimate(args.estimate);
        if ("error" in r) return err(`${r.error}.`);
        if (r.estimate !== (t.estimate ?? null)) {
          changes.push(r.estimate === null ? "estimate cleared" : `estimate ${r.estimate} pts`);
          t.estimate = r.estimate;
        }
      }
      if (!changes.length) return { ok: true, unchanged: true, ticket: ticketLine(t) };
      return { ok: true, changes, ticket: ticketLine(t), ...stage(ctx, t.id, before, t, changes) };
    }
    case "comment_on_ticket": {
      const found = await findVisible(ctx, args.id);
      if ("ok" in found) return found;
      const text = str(args.text);
      if (!text) return err("The comment is empty.");
      if (text.length > MAX_COMMENT_LENGTH) return err(`Keep comments under ${MAX_COMMENT_LENGTH} characters.`);
      const before = clone(found);
      const t = found;
      t.comments = [...(t.comments ?? []), { id: uid(), who: ctx.agentId ?? ATLAS_ID, text, time: stamp() }];
      const change = `commented “${text.length > 60 ? `${text.slice(0, 57)}…` : text}”`;
      return { ok: true, ticket: ticketLine(t), ...stage(ctx, t.id, before, t, [change]) };
    }
    case "delete_ticket": {
      if (!canDelete(role)) return err("Only org owners can delete tickets. Moving it to Backburner is an alternative.");
      const t = await findVisible(ctx, args.id);
      if ("ok" in t) return t;
      return { ok: true, deleting: `${t.id} "${t.title}"`, ...stage(ctx, t.id, t, null, []) };
    }
    case "start_mission": {
      const goal = str(args.goal);
      if (!goal) return err("Say what the mission should achieve.");
      if (currentDir().chats[ctx.where]?.kind !== "channel") return err("Missions start in a channel, so the team can follow along. Ask in one.");
      const { createMission } = await import("../missions");
      const m = await createMission({ goal, deadline: str(args.deadline) ?? null, chatId: ctx.where, role });
      return {
        ok: true, mission: m.goal, deadline: m.deadline, board: `/missions/${m.id}`,
        note: "The plan is being drafted now, live on the mission board and in the mission's own thread; someone reviews and launches it there. Tell the requester that in one sentence; don't invent tasks.",
      };
    }
    case "search_decisions": {
      const { searchTeamDecisions } = await import("../listener/decisions");
      const found = await searchTeamDecisions(str(args.query) ?? "");
      return { decisions: found, note: found.length ? "Answer from these; say if one was reopened or replaced." : "Nothing logged for this yet. It may only have been discussed: call search_messages next and answer from those messages, citing them." };
    }
    case "catch_up":
      return catchUp({ role, sinceHours: typeof args.since_hours === "number" ? args.since_hours : undefined, chat: str(args.chat) });
    case "search_messages": {
      const terms = (str(args.query) ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      if (!terms.length) return err("Give a few keywords to search for.");
      const found = visibleHits(await store.searchMessages(terms, 8));
      const hits = found.map((m) => {
        const lower = m.text.toLowerCase();
        return { score: terms.filter((w) => lower.includes(w)).length, line: hitLine(m) };
      });
      hits.sort((a, b) => b.score - a.score);
      return { ok: true, results: hits.slice(0, 8).map((h) => h.line) };
    }
    case "ticket_discussion": {
      const t = await findVisible(ctx, args.id);
      if ("ok" in t) return t;
      const found = visibleHits(await store.messagesMentioning(t.id, 12));
      return { ok: true, ticket: ticketLine(t), messages: found.reverse().map(hitLine) };
    }
    default:
      return err(`Unknown tool ${name}.`);
  }
}


/** Optional labels, due date and estimate from create_ticket's arguments, validated. */
function ticketFields(args: Args): Pick<Ticket, "labels" | "due" | "estimate"> | { error: string } {
  const out: Pick<Ticket, "labels" | "due" | "estimate"> = {};
  if (args.labels !== undefined) {
    const r = cleanLabels(args.labels);
    if ("error" in r) return { error: `${r.error}.` };
    out.labels = r.labels;
  }
  const due = str(args.due);
  if (due && due.toLowerCase() !== "none") {
    if (!isValidDue(due)) return { error: "due must be a real date in YYYY-MM-DD form." };
    out.due = due;
  }
  if (args.estimate !== undefined && args.estimate !== null) {
    const r = cleanEstimate(args.estimate);
    if ("error" in r) return { error: `${r.error}.` };
    out.estimate = r.estimate;
  }
  return out;
}
