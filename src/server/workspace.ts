import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import type { SessionUser } from "@/lib/auth/shared";
import type { RequestCtx } from "@/lib/context";
import { ATLAS, ATLAS_AGENT, ATLAS_ID, makePerson, type AgentInfo, type Directory, type Team } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import { DEMO_PEOPLE } from "@/lib/mock/demo";
import { canManage } from "@/lib/rbac";
import { storeFor, usingSupabase } from "@/lib/store";
import type { AgentMode, ChatId, ChatMeta, Role } from "@/lib/types";
import { memoryRegistry } from "./registry/memory";
import { withAssignmentPickup } from "./agents/assignment";
import type { ChannelRow, Registry, WorkspaceRow } from "./registry/types";

export const ACTIVE_WS_COOKIE = "meld_ws";
const INVITE_TTL_DAYS = 14;

export class WorkspaceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function registry(): Promise<Registry> {
  return usingSupabase() ? (await import("./registry/supabase")).supabaseRegistry : memoryRegistry;
}

// ---------------------------------------------------------------- resolving the workspace

/** The workspace this person is working in: the one in their cookie, else their first. */
async function activeMembership(user: SessionUser) {
  const reg = await registry();
  const all = await reg.memberships(user.id);
  if (!all.length) return null;
  const wanted = (await cookies()).get(ACTIVE_WS_COOKIE)?.value;
  const current = all.find((m) => m.workspace.id === wanted) ?? all.find((m) => !m.workspace.demo) ?? all[0];
  return { ...current, all };
}

/**
 * Directories are rebuilt from the registry (3-4 queries), so each server instance keeps
 * them for a few seconds per person. Changes made here clear it at once; other instances
 * catch up within DIR_TTL_MS (and a chat it doesn't know yet forces a rebuild).
 */
const DIR_TTL_MS = 5_000;
const dirCache = new Map<string, { at: number; ctx: RequestCtx | null }>();
export function forgetDirectories() {
  dirCache.clear();
}

/** Request context for this person's active workspace, or null if they have none yet. */
export async function contextFor(user: SessionUser, opts: { fresh?: boolean } = {}): Promise<RequestCtx | null> {
  const wanted = (await cookies()).get(ACTIVE_WS_COOKIE)?.value ?? "";
  const key = `${user.id}|${wanted}`;
  const hit = dirCache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < DIR_TTL_MS) return hit.ctx;
  const m = await activeMembership(user);
  const ctx = m ? { dir: await buildDirectory(user.id, m.workspace, m.role, m.all), store: withAssignmentPickup(await storeFor(m.workspace)) } : null;
  dirCache.set(key, { at: Date.now(), ctx });
  if (dirCache.size > 500) dirCache.delete(dirCache.keys().next().value!);
  return ctx;
}

/** Context for background work (an Atlas run) on behalf of a member. */
export async function contextAs(workspaceId: string, userId: string): Promise<RequestCtx> {
  const reg = await registry();
  const ms = await reg.memberships(userId);
  const m = ms.find((x) => x.workspace.id === workspaceId);
  if (!m) throw new WorkspaceError("Not a member of this workspace", 403);
  return { dir: await buildDirectory(userId, m.workspace, m.role, ms), store: withAssignmentPickup(await storeFor(m.workspace)) };
}

export async function buildDirectory(
  me: string,
  ws: WorkspaceRow,
  role: Role,
  memberships: { workspace: WorkspaceRow; role: Role }[],
): Promise<Directory> {
  const reg = await registry();
  const [members, channelRows, agentRows, channelAgents] = await Promise.all([
    reg.members(ws.id), reg.channels(ws.id), reg.agents(ws.id), reg.channelAgents(ws.id),
  ]);
  let channels = channelRows;

  // Everyone has a DM with Atlas; make it the first time it's needed.
  if (!channels.some((c) => c.kind === "dm" && c.members?.includes(me) && c.members.includes(ATLAS_ID))) {
    const dm: ChannelRow = {
      id: `dm${uid()}`, workspaceId: ws.id, kind: "dm", name: null, topic: ATLAS.title ?? "", team: null,
      members: [me, ATLAS_ID], createdBy: me, createdAt: new Date().toISOString(),
    };
    await reg.createChannel(dm);
    channels = [...channels, dm];
  }

  const people: Directory["people"] = { [ATLAS_ID]: ATLAS };
  // Agents the team made are members too: profile, DMs, mentions.
  const agents: AgentInfo[] = [
    ATLAS_AGENT,
    ...agentRows.map((a) => ({
      id: a.id, handle: a.handle, name: a.name, description: a.description, instructions: a.instructions,
      tools: a.tools, kind: a.kind, createdBy: a.createdBy,
    })),
  ];
  for (const a of agentRows) {
    people[a.id] = { ...makePerson({ id: a.id, name: a.name, title: a.description }), color: a.color ?? makePerson({ id: a.id, name: a.name }).color, isAgent: true };
  }
  const agentIds = new Set(agents.map((a) => a.id));
  /** Agents that can read a channel: explicit rows, plus Atlas unless it was removed. */
  const rosterOf = (chatId: string) => {
    const rows = channelAgents.filter((r) => r.chatId === chatId && agentIds.has(r.agentId));
    const list = rows.filter((r) => r.mode !== "off").map((r) => ({ id: r.agentId, mode: r.mode as AgentMode }));
    if (!rows.some((r) => r.agentId === ATLAS_ID)) list.unshift({ id: ATLAS_ID, mode: "mention" });
    return list;
  };
  for (const m of members) {
    // Demo teammates keep their designed colors.
    people[m.id] = ws.demo && DEMO_PEOPLE[m.id] ? DEMO_PEOPLE[m.id] : makePerson({ id: m.id, name: m.name, team: m.team, avatarUrl: m.avatarUrl, title: m.title }, m.id === me);
  }
  const teamOf = (id: string | null) => ws.teams.find((t) => t.id === id)?.name;

  const chats: Record<ChatId, ChatMeta> = {};
  const channelIds: ChatId[] = [];
  const dmIds: ChatId[] = [];
  for (const c of channels) {
    if (c.kind === "channel") {
      const roster = rosterOf(c.id);
      chats[c.id] = {
        id: c.id, kind: "channel", label: c.name ?? "channel", topic: c.topic, team: c.team, createdBy: c.createdBy,
        members: [...members.map((m) => m.id), ...roster.map((r) => r.id)], agents: roster,
      };
      channelIds.push(c.id);
    } else if (c.members?.includes(me)) {
      const who = c.members.find((x) => x !== me) ?? me;
      const p = people[who];
      const topic = who === ATLAS_ID ? c.topic : [p?.title, teamOf(p?.team ?? null)].filter(Boolean).join(" · ");
      chats[c.id] = { id: c.id, kind: "dm", who, topic };
      dmIds.push(c.id);
    }
  }
  // Teammate DMs by name, Atlas last (as in the design).
  dmIds.sort((a, b) => {
    const wa = (chats[a] as { who: string }).who, wb = (chats[b] as { who: string }).who;
    // Teammates by name, then agents, Atlas last.
    const rank = (id: string) => (id === ATLAS_ID ? 2 : people[id]?.isAgent ? 1 : 0);
    return rank(wa) - rank(wb) || (people[wa]?.name ?? "").localeCompare(people[wb]?.name ?? "");
  });

  const others = members.filter((m) => m.id !== me).sort((a, b) => a.name.localeCompare(b.name)).map((m) => m.id);
  const general = channelIds.find((id) => chats[id].kind === "channel" && (chats[id] as { label: string }).label === "general");
  return {
    workspace: { id: ws.id, name: ws.name, slug: ws.slug, ticketPrefix: ws.ticketPrefix, repo: ws.repo },
    me,
    role,
    roles: Object.fromEntries(members.map((m) => [m.id, m.role])),
    people,
    personOrder: [me, ...others, ATLAS_ID],
    teams: ws.teams,
    chats,
    channels: channelIds,
    dms: dmIds,
    home: ws.demo ? "design" : general ?? channelIds[0] ?? dmIds[0],
    memberships: memberships.map((x) => ({ id: x.workspace.id, name: x.workspace.name, role: x.role })),
    demo: ws.demo,
    agents,
  };
}

// ---------------------------------------------------------------- creating and joining

export interface CreateWorkspaceInput {
  name: string;
  ticketPrefix?: string;
  teams?: string[];
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";

/** "Acme Robotics" → "AR"; "Northwind" → "NOR". */
export function suggestPrefix(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const p = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "T").slice(0, 3);
  return p.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) || "T";
}

async function setActive(workspaceId: string) {
  (await cookies()).set(ACTIVE_WS_COOKIE, workspaceId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

/**
 * Set up a company: the workspace, its teams, #general and #random, and a welcome from
 * Atlas. The creator becomes its owner.
 */
export async function createWorkspace(user: SessionUser, input: CreateWorkspaceInput) {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new WorkspaceError("Give your workspace a name");
  const prefix = (input.ticketPrefix?.trim() || suggestPrefix(name)).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  if (!prefix) throw new WorkspaceError("Ticket prefix needs letters or numbers");
  const teams: Team[] = [];
  for (const t of input.teams ?? []) {
    const n = t.trim().slice(0, 40);
    const id = slugify(n);
    if (n && !teams.some((x) => x.id === id)) teams.push({ id, name: n });
  }
  if (!teams.length) teams.push({ id: "general", name: "General" });

  const reg = await registry();
  await reg.upsertProfile({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl });
  let slug = slugify(name);
  for (let i = 2; await reg.slugTaken(slug); i++) slug = `${slugify(name)}-${i}`;
  const ws: Omit<WorkspaceRow, "demo"> = { id: `ws${uid()}`, name, slug, ticketPrefix: prefix, repo: null, teams };
  await reg.createWorkspace(ws, user.id);

  const now = new Date().toISOString();
  const general: ChannelRow = { id: `ch${uid()}`, workspaceId: ws.id, kind: "channel", name: "general", topic: "Company-wide announcements", team: null, members: null, createdBy: user.id, createdAt: now };
  const random: ChannelRow = { ...general, id: `ch${uid()}`, name: "random", topic: "Anything goes", createdAt: new Date(Date.now() + 1).toISOString() };
  await reg.createChannel(general);
  await reg.createChannel(random);

  const store = await storeFor(ws);
  await store.appendMessage(general.id, {
    id: uid(), who: ATLAS_ID, time: stamp(),
    text: `Welcome to ${name}! I'm Atlas. Tag @Atlas in any channel to create or update tickets (their ids start with ${prefix}-), ask where things stand, or turn a thread into tasks. I act with the permissions of whoever asks.`,
  });
  await setActive(ws.id);
  return { workspaceId: ws.id, home: general.id };
}

export async function switchWorkspace(user: SessionUser, workspaceId: string) {
  const ms = await (await registry()).memberships(user.id);
  if (!ms.some((m) => m.workspace.id === workspaceId)) throw new WorkspaceError("You're not a member of that workspace", 403);
  await setActive(workspaceId);
}

export async function createInvite(ctx: RequestCtx, role: Role) {
  if (!canManage(ctx.dir.role)) throw new WorkspaceError("Only owners can invite people", 403);
  const token = `${uid()}${uid()}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  const now = Date.now();
  await (await registry()).createInvite({
    token, workspaceId: ctx.dir.workspace.id, role, createdBy: ctx.dir.me,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + INVITE_TTL_DAYS * 86400_000).toISOString(), revoked: false,
  });
  return { token, role, expiresAt: new Date(now + INVITE_TTL_DAYS * 86400_000).toISOString() };
}

export async function listInvites(ctx: RequestCtx) {
  if (!canManage(ctx.dir.role)) throw new WorkspaceError("Only owners can see invites", 403);
  const all = await (await registry()).invites(ctx.dir.workspace.id);
  return all.filter((i) => !i.revoked && Date.parse(i.expiresAt) > Date.now()).map((i) => ({ token: i.token, role: i.role, expiresAt: i.expiresAt }));
}

export async function revokeInvite(ctx: RequestCtx, token: string) {
  if (!canManage(ctx.dir.role)) throw new WorkspaceError("Only owners can revoke invites", 403);
  await (await registry()).revokeInvite(ctx.dir.workspace.id, token);
}

/** What the join page shows for an invite link. */
export async function describeInvite(token: string, user: SessionUser | null) {
  const reg = await registry();
  const inv = await reg.invite(token);
  const valid = !!inv && !inv.revoked && Date.parse(inv.expiresAt) > Date.now();
  if (!inv || !valid) return { valid: false as const };
  const ws = await reg.workspace(inv.workspaceId);
  if (!ws) return { valid: false as const };
  const members = await reg.members(ws.id);
  const inviter = members.find((m) => m.id === inv.createdBy)?.name ?? null;
  const alreadyMember = !!user && members.some((m) => m.id === user.id);
  return { valid: true as const, workspaceName: ws.name, role: inv.role, inviter, memberCount: members.length, alreadyMember };
}

export async function acceptInvite(user: SessionUser, token: string) {
  const reg = await registry();
  const inv = await reg.invite(token);
  if (!inv || inv.revoked || Date.parse(inv.expiresAt) < Date.now()) throw new WorkspaceError("This invite link has expired or was revoked", 410);
  await reg.upsertProfile({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl });
  await reg.addMember(inv.workspaceId, user.id, inv.role);
  await setActive(inv.workspaceId);
  return { workspaceId: inv.workspaceId };
}

// ---------------------------------------------------------------- members

export async function updateMember(ctx: RequestCtx, input: { userId: string; role?: Role; team?: string | null; title?: string | null }) {
  const self = input.userId === ctx.dir.me;
  // Anyone can set their own team and title; owners can change anyone, including roles.
  if (!self && !canManage(ctx.dir.role)) throw new WorkspaceError("Only owners can change other members", 403);
  if (input.role && !canManage(ctx.dir.role)) throw new WorkspaceError("Only owners can change roles", 403);
  if (input.team && !ctx.dir.teams.some((t) => t.id === input.team)) throw new WorkspaceError("Unknown team");
  const reg = await registry();
  if (input.role && input.role !== "owner" && self) {
    const owners = (await reg.members(ctx.dir.workspace.id)).filter((m) => m.role === "owner");
    if (owners.length <= 1) throw new WorkspaceError("A workspace needs at least one owner");
  }
  const patch: { role?: Role; team?: string | null; title?: string | null } = {};
  if (input.role) patch.role = input.role;
  if (input.team !== undefined) patch.team = input.team;
  if (input.title !== undefined) patch.title = input.title?.slice(0, 60) ?? null;
  await reg.updateMember(ctx.dir.workspace.id, input.userId, patch);
}

export async function removeMember(ctx: RequestCtx, userId: string) {
  if (!canManage(ctx.dir.role) && userId !== ctx.dir.me) throw new WorkspaceError("Only owners can remove members", 403);
  const reg = await registry();
  const members = await reg.members(ctx.dir.workspace.id);
  if (members.find((m) => m.id === userId)?.role === "owner" && members.filter((m) => m.role === "owner").length <= 1) {
    throw new WorkspaceError("A workspace needs at least one owner");
  }
  await reg.removeMember(ctx.dir.workspace.id, userId);
}

export async function updateWorkspaceSettings(ctx: RequestCtx, input: { name?: string; teams?: string[]; repo?: string | null }) {
  if (!canManage(ctx.dir.role)) throw new WorkspaceError("Only owners can change workspace settings", 403);
  const patch: { name?: string; teams?: Team[]; repo?: string | null } = {};
  if (input.name?.trim()) patch.name = input.name.trim().slice(0, 60);
  if (input.repo !== undefined) patch.repo = input.repo?.trim() || null;
  if (input.teams) {
    // Keep ids of teams that still exist so tickets stay attached.
    patch.teams = input.teams.map((n) => n.trim()).filter(Boolean).map((n) => ctx.dir.teams.find((t) => t.name === n) ?? { id: slugify(n), name: n });
  }
  await (await registry()).updateWorkspace(ctx.dir.workspace.id, patch);
}

// ---------------------------------------------------------------- channels and DMs

/** Slack-style channel names: lowercase, dashes, no spaces. */
export function channelName(raw: string) {
  return raw.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Owners manage every channel; members manage the ones they created. */
function canEditChannel(ctx: RequestCtx, id: ChatId) {
  const c = ctx.dir.chats[id];
  return !!c && c.kind === "channel" && (canManage(ctx.dir.role) || c.createdBy === ctx.dir.me);
}

export async function createChannel(ctx: RequestCtx, input: { name: string; topic?: string; team?: string | null }) {
  if (ctx.dir.role === "guest") throw new WorkspaceError("Guests can't create channels", 403);
  const name = channelName(input.name);
  if (!name) throw new WorkspaceError("Channel names need letters or numbers");
  const taken = Object.values(ctx.dir.chats).some((c) => c.kind === "channel" && c.label === name);
  if (taken) throw new WorkspaceError(`#${name} already exists`, 409);
  const team = input.team && ctx.dir.teams.some((t) => t.id === input.team) ? input.team : null;
  const id = `ch${uid()}`;
  await (await registry()).createChannel({
    id, workspaceId: ctx.dir.workspace.id, kind: "channel", name, topic: input.topic?.trim().slice(0, 120) ?? "", team,
    members: null, createdBy: ctx.dir.me, createdAt: new Date().toISOString(),
  });
  return { id, name };
}

export async function updateChannel(ctx: RequestCtx, input: { id: ChatId; name?: string; topic?: string }) {
  if (!canEditChannel(ctx, input.id)) throw new WorkspaceError("Only owners and the channel's creator can edit it", 403);
  const patch: { name?: string; topic?: string } = {};
  if (input.name !== undefined) {
    const name = channelName(input.name);
    if (!name) throw new WorkspaceError("Channel names need letters or numbers");
    if (Object.values(ctx.dir.chats).some((c) => c.kind === "channel" && c.label === name && c.id !== input.id)) {
      throw new WorkspaceError(`#${name} already exists`, 409);
    }
    patch.name = name;
  }
  if (input.topic !== undefined) patch.topic = input.topic.trim().slice(0, 120);
  await (await registry()).updateChannel(ctx.dir.workspace.id, input.id, patch);
}

/** Delete a channel and its messages. The workspace's default channel stays. */
export async function deleteChannel(ctx: RequestCtx, id: ChatId) {
  if (!canEditChannel(ctx, id)) throw new WorkspaceError("Only owners and the channel's creator can delete it", 403);
  if (id === ctx.dir.home) throw new WorkspaceError("The default channel can't be deleted", 400);
  await ctx.store.deleteChatMessages(id);
  await (await registry()).deleteChannel(ctx.dir.workspace.id, id);
  return { home: ctx.dir.home };
}

/** The DM between me and another member (made the first time). */
export async function openDm(ctx: RequestCtx, userId: string) {
  if (userId === ctx.dir.me) throw new WorkspaceError("That's you");
  if (!ctx.dir.people[userId]) throw new WorkspaceError("Not a member of this workspace", 404);
  const existing = Object.values(ctx.dir.chats).find((c) => c.kind === "dm" && c.who === userId);
  if (existing) return { id: existing.id };
  const id = `dm${uid()}`;
  await (await registry()).createChannel({
    id, workspaceId: ctx.dir.workspace.id, kind: "dm", name: null, topic: "", team: null,
    members: [ctx.dir.me, userId], createdBy: ctx.dir.me, createdAt: new Date().toISOString(),
  });
  return { id };
}

// ---------------------------------------------------------------- agents

const RESERVED_HANDLES = new Set(["atlas", "agent", "here", "channel", "everyone", "me"]);
const AGENT_COLORS = ["#7C3AED", "#0EA5E9", "#059669", "#D97706", "#DB2777", "#4F46E5"];

export interface AgentInput {
  /** "external": an agent that connects over MCP with a token (Claude Code, Codex, your own). */
  kind?: "custom" | "external";
  name: string;
  handle?: string;
  description?: string;
  instructions?: string;
  tools?: ("read" | "write" | "delete")[];
}

function cleanHandle(raw: string) {
  return raw.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}

function checkHandle(ctx: RequestCtx, handle: string, self?: string) {
  if (!handle) throw new WorkspaceError("The handle needs letters or numbers");
  if (RESERVED_HANDLES.has(handle)) throw new WorkspaceError(`@${handle} is reserved`);
  const taken = (ctx.dir.agents ?? []).some((a) => a.handle === handle && a.id !== self);
  if (taken) throw new WorkspaceError(`@${handle} is already taken`, 409);
}

const toolsFrom = (t?: string[]) => {
  const ok = (t ?? ["read"]).filter((x): x is "read" | "write" | "delete" => x === "read" || x === "write" || x === "delete");
  return ok.length ? [...new Set<"read" | "write" | "delete">(["read", ...ok])] : (["read"] as ("read" | "write" | "delete")[]);
};

/** A random MCP token, and the hash we keep (the token itself is shown once). */
function newToken() {
  const token = `meld_${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** A new agent member. It starts in no channels: add it where it should read along. */
export async function createAgent(ctx: RequestCtx, input: AgentInput) {
  if (ctx.dir.role === "guest") throw new WorkspaceError("Guests can't add agents", 403);
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new WorkspaceError("Give the agent a name");
  const handle = cleanHandle(input.handle || name);
  checkHandle(ctx, handle);
  const id = `ag${uid()}`;
  const n = (ctx.dir.agents ?? []).length;
  const external = input.kind === "external";
  const tok = external ? newToken() : null;
  await (await registry()).createAgent({
    id, workspaceId: ctx.dir.workspace.id, handle, name, description: input.description?.trim().slice(0, 200) ?? "",
    instructions: input.instructions?.trim().slice(0, 4000) ?? "", tools: toolsFrom(input.tools), kind: external ? "external" : "custom",
    color: AGENT_COLORS[n % AGENT_COLORS.length], tokenHash: tok?.hash ?? null, createdBy: ctx.dir.me, createdAt: new Date().toISOString(),
  });
  return { id, handle, token: tok?.token ?? null };
}

function canEditAgent(ctx: RequestCtx, id: string) {
  const a = (ctx.dir.agents ?? []).find((x) => x.id === id);
  if (!a || a.kind === "builtin") throw new WorkspaceError("Atlas is built in and can't be edited", 400);
  if (!canManage(ctx.dir.role) && a.createdBy !== ctx.dir.me) throw new WorkspaceError("Only owners and whoever made this agent can change it", 403);
  return a;
}

export async function updateAgent(ctx: RequestCtx, input: AgentInput & { id: string }) {
  canEditAgent(ctx, input.id);
  const patch: Parameters<Registry["updateAgent"]>[2] = {};
  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 40) || undefined;
  if (input.handle !== undefined) {
    patch.handle = cleanHandle(input.handle);
    checkHandle(ctx, patch.handle, input.id);
  }
  if (input.description !== undefined) patch.description = input.description.trim().slice(0, 200);
  if (input.instructions !== undefined) patch.instructions = input.instructions.trim().slice(0, 4000);
  if (input.tools !== undefined) patch.tools = toolsFrom(input.tools);
  await (await registry()).updateAgent(ctx.dir.workspace.id, input.id, patch);
}

/** A new MCP token for an external agent (the old one stops working). */
export async function rotateAgentToken(ctx: RequestCtx, id: string) {
  const a = canEditAgent(ctx, id);
  if (a.kind !== "external") throw new WorkspaceError("Only agents that connect over MCP have tokens");
  const tok = newToken();
  await (await registry()).updateAgent(ctx.dir.workspace.id, id, { tokenHash: tok.hash });
  return { token: tok.token };
}

export async function deleteAgent(ctx: RequestCtx, id: string) {
  canEditAgent(ctx, id);
  await (await registry()).deleteAgent(ctx.dir.workspace.id, id);
}

/** Add an agent to a channel (with a mode), change its mode, or remove it ("off"). */
export async function setChannelAgent(ctx: RequestCtx, input: { chatId: ChatId; agentId: string; mode: AgentMode | "off" }) {
  if (ctx.dir.role === "guest") throw new WorkspaceError("Guests can't change who's in a channel", 403);
  const chat = ctx.dir.chats[input.chatId];
  if (!chat || chat.kind !== "channel") throw new WorkspaceError("Agents join channels, not DMs");
  if (!(ctx.dir.agents ?? []).some((a) => a.id === input.agentId)) throw new WorkspaceError("Unknown agent", 404);
  if (!["mention", "lurk", "active", "off"].includes(input.mode)) throw new WorkspaceError("Unknown mode");
  // Atlas is in every channel by default, so removing it needs an explicit "off" row.
  const mode = input.mode === "off" && input.agentId !== ATLAS_ID ? null : input.mode;
  await (await registry()).setChannelAgent(ctx.dir.workspace.id, input.chatId, input.agentId, mode, ctx.dir.me);
}
