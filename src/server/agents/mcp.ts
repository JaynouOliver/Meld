import "server-only";

import { after } from "next/server";

import { currentCtx, type RequestCtx } from "@/lib/context";
import { agentById, chatTitle, personOf, type AgentInfo } from "@/lib/directory";
import { displayTime, stamp, uid } from "@/lib/format";
import { replyIdFor, type AgentRun } from "@/lib/agent/runs";
import { blockersOf } from "@/lib/agent/blockers";
import * as api from "@/lib/api/service";
import { matchQuery } from "@/lib/query-language";
import { canSee, viewerOf } from "@/lib/rbac";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import type { ChatId, Message, Priority, TicketStatus } from "@/lib/types";
import { processRun } from "../atlas/queue";
import { pingChanges } from "../realtime";
import { contextAs, hashToken, registry } from "../workspace";
import { dispatch, runsWeExecute, scopeFor } from "./dispatch";

/**
 * Meld as an MCP server for external agents (docs/agent-platform.md, phase 2). An agent
 * made in Meld with kind "external" gets a token; any MCP client (Claude Code, Codex, a
 * custom harness) connects with it and works as that agent: same inbox, same channel
 * scoping, same hand-off rules as built-in agents.
 */

/** The agent behind a token, and the context it works in (scoped to its channels). */
export async function agentFromToken(token: string): Promise<{ ctx: RequestCtx; agent: AgentInfo } | null> {
  const reg = await registry();
  const row = await reg.agentByToken(hashToken(token));
  if (!row || row.kind !== "external") return null;
  // The agent sees the workspace as its creator does, narrowed to its own channels, and
  // acts as itself with member permissions (no deletes).
  let base: RequestCtx;
  try {
    base = await contextAs(row.workspaceId, row.createdBy ?? "");
  } catch {
    const owner = (await reg.members(row.workspaceId)).find((m) => m.role === "owner");
    if (!owner) return null;
    base = await contextAs(row.workspaceId, owner.id);
  }
  const dir = { ...scopeFor(base.dir, row.id), me: row.id, role: "member" as const };
  const agent = agentById(dir, row.id);
  return agent ? { ctx: { dir, store: base.store, scopedTo: row.id }, agent } : null;
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const MCP_TOOLS = [
  {
    name: "get_inbox",
    description:
      "Work waiting for you in Meld: messages that @mention you, DMs to you, and hand-offs from other agents. Each item has the message, who asked, and recent conversation. Picking items up marks them 👀 for the team. Answer each with reply (or skip).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "reply",
    description:
      "Answer an inbox item. Posts your reply where you were asked (in its thread when there is one). @mention another agent (e.g. @reviewer) in the text to hand them part of the work.",
    inputSchema: {
      type: "object",
      properties: { item_id: { type: "string" }, text: { type: "string", description: "Your reply, plain text. Ticket ids like ORB-12 become links." } },
      required: ["item_id", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "skip",
    description: "Close an inbox item without replying (nothing for you to do).",
    inputSchema: { type: "object", properties: { item_id: { type: "string" } }, required: ["item_id"], additionalProperties: false },
  },
  {
    name: "list_channels",
    description: "Channels you can read (you've been added to) and your DMs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "read_channel",
    description: "Recent messages in a channel you can read, or one thread in it.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel name (#engineering) or id" },
        thread_id: { type: "string", description: "Optional: the thread's first message id" },
        limit: { type: "number", description: "How many messages (default 30, max 100)" },
      },
      required: ["channel"],
      additionalProperties: false,
    },
  },
  {
    name: "post_message",
    description: "Post a new message (or a thread reply) in a channel you're in. @mention people or agents as needed.",
    inputSchema: {
      type: "object",
      properties: { channel: { type: "string" }, text: { type: "string" }, thread_id: { type: "string" } },
      required: ["channel", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tickets",
    description: "Tickets, optionally filtered: free text, or status:review assignee:maya team:engineering priority:high is:blocked, - to negate.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "get_ticket",
    description: "One ticket: description, status, owner, links, what blocks it, recent activity.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "create_ticket",
    description: "Create a ticket (needs the write permission).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        assignee: { type: "string", description: "Person's name or first name; default: unassigned to you" },
        priority: { type: "string", enum: PRIORITIES },
        team: { type: "string", description: "Team name or id" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "update_ticket",
    description: "Update a ticket (needs the write permission): status, owner, priority, title, description, link a PR, mark what blocks it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: STATUSES },
        assignee: { type: "string" },
        priority: { type: "string", enum: PRIORITIES },
        title: { type: "string" },
        description: { type: "string" },
        link_pr: { type: "string", description: "Pull request number" },
        blocked_by: { type: "string", description: "Ticket id that blocks this one" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
] as const;

class ToolError extends Error {}

/** Run one tool as the agent (inside its context). Returns text for the MCP client. */
export async function callTool(agent: AgentInfo, name: string, args: Args): Promise<string> {
  const { dir, store } = currentCtx();
  const ws = dir.workspace.id;
  const name_ = (id: string) => personOf(dir, id).name;
  const line = (m: { id: string; who: string; time: string; text: string }) => `[${m.id} ${displayTime(m.time)}] ${name_(m.who)}: ${m.text}`;
  const findChat = (q: string): ChatId => {
    const key = q.replace(/^#/, "").toLowerCase();
    const id = dir.chats[q] ? q : Object.values(dir.chats).find((c) => c.kind === "channel" && c.label.toLowerCase() === key)?.id;
    if (!id) throw new ToolError(`You can't read ${q}: you're not in it (ask someone to add @${agent.handle} to that channel).`);
    return id;
  };
  const findPerson = (q: string) => {
    const k = q.replace(/^@/, "").toLowerCase();
    const id = dir.personOrder.find((p) => p.toLowerCase() === k || personOf(dir, p).name.toLowerCase() === k || personOf(dir, p).first.toLowerCase() === k);
    if (!id) throw new ToolError(`No one called ${q} in this workspace.`);
    return id;
  };
  const needWrite = () => {
    if (!agent.tools.includes("write")) throw new ToolError(`@${agent.handle} doesn't have permission to change tickets. An owner can grant it in the agent's settings.`);
  };
  const myRun = async (id: unknown) => {
    const r = (await store.listRecentRuns()).find((x) => x.id === id && x.agentId === agent.id);
    if (!r) throw new ToolError("No such inbox item (it may have been answered already).");
    return r;
  };
  const replyThread = (r: AgentRun) => r.threadId ?? (r.trigger === "proactive" ? r.triggerMessageId : null);
  /** Hand-offs and other agents' reactions to what this agent posted. */
  const handOff = async (msg: { id: string; text: string }, chatId: ChatId, threadId: string | null, parent: AgentRun | null) => {
    const next = await dispatch({
      chatId, threadId, messageId: msg.id, authorId: agent.id, text: msg.text,
      parent: parent ?? { id: `mcp-${msg.id}`, depth: 0, requester: agent.createdBy ?? dir.me, role: "member", triggerMessageId: msg.id },
    });
    const ours = runsWeExecute(next);
    if (ours.length) after(() => Promise.all(ours.map((r) => processRun(r.id))));
    return next.length;
  };

  switch (name) {
    case "get_inbox": {
      const waiting = (await store.listRecentRuns()).filter((r) => r.agentId === agent.id && (r.status === "queued" || r.status === "running")).slice(0, 10);
      if (!waiting.length) return "Your inbox is empty. Nothing is waiting for you.";
      const items = [];
      for (const r of waiting) {
        if (r.status === "queued") {
          await store.claimRun(r.id);
          await store.react(r.triggerMessageId, "👀", agent.id, true).catch(() => {});
          await pingChanges({ chats: [r.chatId], tickets: false, runs: true, origin: null, workspaceId: ws });
        }
        const list = await store.listMessages(r.chatId, { limit: 50 });
        const root = r.threadId ? list.find((m) => m.id === r.threadId) : null;
        const context = root ? [root, ...root.replies] : list.slice(-12);
        items.push({
          item_id: r.id,
          why: { mention: "you were @mentioned", dm: "a direct message to you", delegation: "another agent handed this to you", proactive: "posted in a channel you watch" }[r.trigger],
          where: dir.chats[r.chatId] ? chatTitle(dir, r.chatId) : r.chatId,
          from: name_(r.requester),
          message: r.text,
          conversation: (context as (Message | { id: string; who: string; time: string; text: string })[]).map(line),
        });
      }
      return JSON.stringify({ items, next: "Answer each item with reply(item_id, text), or skip(item_id)." }, null, 2);
    }
    case "reply": {
      const r = await myRun(args.item_id);
      if (r.status === "done" || r.status === "failed") throw new ToolError("That item is already closed.");
      const text = str(args.text);
      if (!text) throw new ToolError("The reply is empty.");
      const threadId = replyThread(r);
      const saved = await store.appendMessage(r.chatId, { id: replyIdFor(r.id), who: agent.id, time: stamp(), text: text.slice(0, 8000) }, threadId);
      await store.finishRun(r.id, { status: "done", result: { touchedChats: [r.chatId], openTicket: null, deleted: [] } });
      await store.react(r.triggerMessageId, "👀", agent.id, false).catch(() => {});
      await pingChanges({ chats: [r.chatId], tickets: false, runs: true, origin: null, workspaceId: ws, message: { chatId: r.chatId, threadId, message: saved } });
      const handed = await handOff({ id: saved.id, text }, r.chatId, threadId, r);
      return `Posted in ${chatTitle(dir, r.chatId)}${threadId ? " (thread)" : ""}.${handed ? ` Handed off to ${handed} agent(s) you mentioned.` : ""}`;
    }
    case "skip": {
      const r = await myRun(args.item_id);
      await store.finishRun(r.id, { status: "done", result: { touchedChats: [], openTicket: null, deleted: [] } });
      await store.react(r.triggerMessageId, "👀", agent.id, false).catch(() => {});
      await pingChanges({ chats: [r.chatId], tickets: false, runs: true, origin: null, workspaceId: ws });
      return "Skipped.";
    }
    case "list_channels": {
      const rows = [...dir.channels, ...dir.dms].map((c) => {
        const m = dir.chats[c];
        return m.kind === "channel" ? `#${m.label} (id ${c}): ${m.topic || "no topic"}` : `DM with ${name_(m.who)} (id ${c})`;
      });
      return rows.join("\n") || "You're not in any channels yet. Ask someone to add you.";
    }
    case "read_channel": {
      const chat = findChat(String(args.channel ?? ""));
      const list = await store.listMessages(chat, { limit: 50 });
      const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 100);
      if (str(args.thread_id)) {
        const root = list.find((m) => m.id === args.thread_id);
        if (!root) throw new ToolError("No such thread in that channel.");
        return [root, ...root.replies].map(line).join("\n");
      }
      return list.slice(-limit).map((m) => `${line(m)}${m.replies.length ? ` (${m.replies.length} replies, thread_id ${m.id})` : ""}`).join("\n") || "(no messages yet)";
    }
    case "post_message": {
      const chat = findChat(String(args.channel ?? ""));
      const text = str(args.text);
      if (!text) throw new ToolError("The message is empty.");
      const threadId = str(args.thread_id) ?? null;
      const saved = await store.appendMessage(chat, { id: uid(), who: agent.id, time: stamp(), text: text.slice(0, 8000) }, threadId);
      await pingChanges({ chats: [chat], tickets: false, runs: true, origin: null, workspaceId: ws, message: { chatId: chat, threadId, message: saved } });
      await handOff({ id: saved.id, text }, chat, threadId, null);
      return `Posted in ${chatTitle(dir, chat)} (message id ${saved.id}).`;
    }
    case "list_tickets": {
      const v = viewerOf(dir, "member");
      const rows = (await store.listTickets()).filter((t) => canSee(v, t) && matchQuery(t, str(args.query) ?? "", dir));
      return rows.slice(0, 50).map((t) => `${t.id} | ${t.status} | ${t.priority} | ${name_(t.assignee)} | ${t.title}`).join("\n") || "No tickets match.";
    }
    case "get_ticket": {
      const t = await store.getTicket(String(args.id ?? "").toUpperCase());
      if (!t) throw new ToolError("No such ticket.");
      return JSON.stringify(
        {
          id: t.id, title: t.title, status: t.status, priority: t.priority, team: t.team, assignee: name_(t.assignee), description: t.description,
          links: t.links.map((l) => `${l.kind} #${l.num} (${l.repo})`), blocked_by: blockersOf(t),
          activity: t.activity.slice(-6).map((a) => `${a.who} ${a.text}`),
        },
        null,
        2,
      );
    }
    case "create_ticket": {
      needWrite();
      const team = str(args.team) ? dir.teams.find((x) => x.id === str(args.team)?.toLowerCase() || x.name.toLowerCase() === str(args.team)?.toLowerCase())?.id : undefined;
      // Only fields the agent gave: missing ones keep Meld's defaults (assignee: this agent).
      const preset: Parameters<typeof api.createTicket>[0] = { title: str(args.title), description: str(args.description) ?? "" };
      if (team) preset.team = team;
      if (str(args.assignee)) preset.assignee = findPerson(String(args.assignee));
      if (PRIORITIES.includes(args.priority as Priority)) preset.priority = args.priority as Priority;
      const t = await api.createTicket(preset, "member");
      await pingChanges({ chats: [], tickets: true, origin: null, workspaceId: ws });
      return `Created ${t.id}: ${t.title} (assigned to ${name_(t.assignee)}).`;
    }
    case "update_ticket": {
      needWrite();
      const id = String(args.id ?? "").toUpperCase();
      const patch: api.TicketPatch = {};
      if (STATUSES.includes(args.status as TicketStatus)) patch.status = args.status as TicketStatus;
      if (PRIORITIES.includes(args.priority as Priority)) patch.priority = args.priority as Priority;
      if (str(args.assignee)) patch.assignee = findPerson(String(args.assignee));
      if (str(args.title)) patch.title = str(args.title);
      if (str(args.description)) patch.description = str(args.description);
      const pr = str(args.link_pr)?.replace(/\D/g, "");
      const res = await api.updateTicket({ id, role: "member", patch, addLink: pr ? { kind: "PR", num: pr } : undefined, addBlocker: str(args.blocked_by) });
      await pingChanges({ chats: [...(res.broadcastChat ? [res.broadcastChat] : []), ...res.notified], tickets: true, origin: null, workspaceId: ws });
      return `Updated ${id}: ${res.ticket.status}, ${res.ticket.priority}, ${name_(res.ticket.assignee)}${res.ticket.links.length ? `, links: ${res.ticket.links.map((l) => `${l.kind} #${l.num}`).join(", ")}` : ""}.`;
    }
    default:
      throw new ToolError(`Unknown tool ${name}.`);
  }
}

export { ToolError };
