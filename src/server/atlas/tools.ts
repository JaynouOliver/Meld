import type OpenAI from "openai";

import { CHAT_META, DEFAULT_REPO, PEOPLE, STATUSES, PRIORITIES, TEAMS, teamName } from "@/lib/constants";
import { displayTime, stamp, uid } from "@/lib/format";
import type { Store } from "@/lib/store";
import type { MessageHit } from "@/lib/store/types";
import { needsConfirmation, type TicketOp } from "@/lib/agent/actions";
import { matchQuery } from "@/lib/query-language";
import { canDelete, canSee } from "@/lib/rbac";
import type { ChatId, PersonId, Priority, Role, TeamId, Ticket, TicketStatus } from "@/lib/types";
import { ticketLine } from "./prompt";

/** Atlas's tools. Permissions are enforced here, in code; the prompt only explains them. */
const PERSON_IDS = ["me", "aiko", "ravi", "lena", "diego"] as const;

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
              'Optional filter. Free text matches title or ID; also supports status:review assignee:ravi team:payments priority:high is:agent is:draft, and "-" to negate (e.g. -status:done).',
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
      description: "Get one ticket's full details: description, GitHub links and recent activity.",
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
          team: { type: "string", enum: [...TEAMS] },
          assignee: { type: "string", enum: [...PERSON_IDS] },
          priority: { type: "string", enum: [...PRIORITIES] },
          description: { type: "string", description: "Optional: context, acceptance criteria" },
          pr_number: { type: "string", description: "Optional GitHub pull request number to link" },
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
          assignee: { type: "string", enum: [...PERSON_IDS] },
          priority: { type: "string", enum: [...PRIORITIES] },
          title: { type: "string" },
          description: { type: "string" },
          link_pr: { type: "string", description: "GitHub pull request number to link" },
          link_issue: { type: "string", description: "GitHub issue number to link" },
        },
        required: ["id"],
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
  effects: Effects;
  store: Store;
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
  if (!t || !canSee(ctx.role, t)) return err(`${key || "That ticket"} doesn't exist or the requester can't see it.`);
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
  const m = CHAT_META[where];
  return m.kind === "channel" ? `#${m.label}` : "a DM with Atlas";
}

/** One search hit for the model: where, message id (for citations), when, who, what. */
function hitLine(m: MessageHit) {
  const where = srcLabel(m.chatId).replace("a DM with Atlas", "DM with Atlas");
  return `${where}${m.threadId ? " (thread reply)" : ""} [${m.id} ${displayTime(m.time)}] ${PEOPLE[m.who].name}: ${m.text.slice(0, 280)}`;
}

export async function runTool(name: string, args: Args, ctx: ToolCtx): Promise<unknown> {
  const { role, effects, store } = ctx;
  switch (name) {
    case "list_tickets": {
      const q = str(args.query) ?? "";
      // Store tickets with this run's staged changes on top.
      const byId = new Map((await store.listTickets()).map((t) => [t.id, t] as [string, Ticket | null]));
      for (const [id, { after }] of effects.plan) byId.set(id, after);
      const rows = [...byId.values()].filter((t): t is Ticket => !!t && canSee(role, t) && matchQuery(t, q));
      return { ok: true, count: rows.length, tickets: rows.slice(0, 40).map(ticketLine) };
    }
    case "get_ticket": {
      const t = await findVisible(ctx, args.id);
      if ("ok" in t) return t;
      effects.read.push(t.id);
      return {
        ok: true,
        ticket: ticketLine(t),
        description: t.description || "(none)",
        reporter: PEOPLE[t.reporter].name,
        recent_activity: t.activity.slice(-5).map((a) => `${a.who} ${a.text} (${displayTime(a.time)})`),
      };
    }
    case "create_ticket": {
      if (role === "guest") return err("Guests can't create tickets.");
      const team = args.team as TeamId;
      if (!TEAMS.includes(team)) return err(`Unknown team ${String(args.team)}.`);
      if (role === "member" && team !== "design") return err("Team members can only create Design tickets.");
      const title = str(args.title);
      if (!title) return err("A title is required.");
      const assignee = (PERSON_IDS as readonly string[]).includes(String(args.assignee)) ? (args.assignee as PersonId) : "me";
      const priority = PRIORITIES.includes(args.priority as Priority) ? (args.priority as Priority) : "Medium";
      const id = await store.nextTicketId();
      const meta = CHAT_META[ctx.where];
      const pr = str(args.pr_number)?.replace(/\D/g, "");
      const t: Ticket = {
        id, team, assignee, priority, title: title.slice(0, 120), status: "To do", reporter: "atlas",
        description: str(args.description) ?? `Requested by ${PEOPLE.me.name} in ${srcLabel(ctx.where)}.`,
        links: pr ? [{ id: uid(), kind: "PR", num: pr, repo: DEFAULT_REPO }] : [],
        images: [], updated: "Just now",
        // Atlas posts later updates about this ticket where it was asked for.
        watch: meta.kind === "channel" ? { chat: ctx.where, thread: null } : null,
        activity: [{ who: "Atlas", text: `created this ticket from ${srcLabel(ctx.where)} (asked by ${PEOPLE.me.name})`, time: stamp() }],
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
      if (who && (PERSON_IDS as readonly string[]).includes(who) && who !== t.assignee) {
        changes.push(`assignee → ${PEOPLE[who].name}`);
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
          t.links.push({ id: uid(), kind, num, repo: DEFAULT_REPO });
          changes.push(`linked ${kind} #${num}`);
        }
      }
      if (!changes.length) return { ok: true, unchanged: true, ticket: ticketLine(t) };
      return { ok: true, changes, ticket: ticketLine(t), ...stage(ctx, t.id, before, t, changes) };
    }
    case "delete_ticket": {
      if (!canDelete(role)) return err("Only org owners can delete tickets. Moving it to Backburner is an alternative.");
      const t = await findVisible(ctx, args.id);
      if ("ok" in t) return t;
      return { ok: true, deleting: `${t.id} "${t.title}"`, ...stage(ctx, t.id, t, null, []) };
    }
    case "search_messages": {
      const terms = (str(args.query) ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      if (!terms.length) return err("Give a few keywords to search for.");
      const found = await store.searchMessages(terms, 8);
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
      const found = await store.messagesMentioning(t.id, 12);
      return { ok: true, ticket: ticketLine(t), messages: found.reverse().map(hitLine) };
    }
    default:
      return err(`Unknown tool ${name}.`);
  }
}

export { teamName };
