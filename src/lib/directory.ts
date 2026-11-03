import type { AgentMode, ChatId, ChatMeta, Person, PersonId, Role, TeamId } from "./types";

/**
 * Everything the app needs to know about the signed-in person's workspace: who's in it,
 * its teams and channels, and their own role. The server builds it per request
 * (src/server/workspace.ts); the browser loads it once (useDirectory) and refetches when
 * channels or members change.
 */
export interface Team {
  id: TeamId;
  name: string;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  /** Ticket ids look like `${ticketPrefix}-123`. */
  ticketPrefix: string;
  /** Default GitHub repo for PR links (e.g. "acme/web"), if set. */
  repo: string | null;
}

/** What an agent may do: read (tickets, chat history), write (create/update tickets), delete. */
export type AgentTool = "read" | "write" | "delete";
export const AGENT_TOOLS: AgentTool[] = ["read", "write", "delete"];

/** An agent member of the workspace (Atlas is built in; others are made by the team). */
export interface AgentInfo {
  id: PersonId;
  /** Mention name, e.g. "triage" for @triage. */
  handle: string;
  name: string;
  /** Role, shown on its profile ("Triages bug reports and files tickets"). */
  description: string;
  /** The team's instructions for it (added to its system prompt). */
  instructions: string;
  tools: AgentTool[];
  kind: "builtin" | "custom" | "external";
  createdBy: PersonId | null;
}

export const ATLAS_AGENT: AgentInfo = {
  id: "atlas", handle: "atlas", name: "Atlas", kind: "builtin", createdBy: null, tools: ["read", "write", "delete"], instructions: "",
  description: "Files, updates and finds tickets; answers status questions; turns threads into tasks; catches you up.",
};

export interface Membership {
  id: string;
  name: string;
  role: Role;
}

export interface Directory {
  workspace: WorkspaceInfo;
  /** The signed-in person's id in this workspace. */
  me: PersonId;
  /** Their role, from their membership. */
  role: Role;
  /** Every member's role (for the members list). */
  roles?: Record<PersonId, Role>;
  /** Every member, plus "atlas". */
  people: Record<PersonId, Person>;
  /** Display order: me, other members by name, Atlas last. */
  personOrder: PersonId[];
  teams: Team[];
  /** Channels in the workspace, this person's DMs, and their Atlas DM. */
  chats: Record<ChatId, ChatMeta>;
  /** Sidebar order. */
  channels: ChatId[];
  dms: ChatId[];
  /** The default channel (#general): where new members land. */
  home: ChatId;
  /** All workspaces this person belongs to (workspace switcher). */
  memberships: Membership[];
  /** The Northwind sample workspace: demo teammates answer DMs. */
  demo: boolean;
  /** Agent members (Atlas first). Each is also in `people` with isAgent. */
  agents?: AgentInfo[];
}

export const agentsOf = (dir: Pick<Directory, "agents">) => dir.agents ?? [ATLAS_AGENT];
export const agentById = (dir: Pick<Directory, "agents">, id: PersonId) => agentsOf(dir).find((a) => a.id === id) ?? null;

/** The agent's mode in a channel, or null when it can't read it. DMs: only the agent in it. */
export function agentModeIn(dir: Pick<Directory, "chats">, chatId: ChatId, agentId: PersonId): AgentMode | null {
  const c = dir.chats[chatId];
  if (!c) return null;
  if (c.kind === "dm") return c.who === agentId ? "mention" : null;
  // The server lists every agent in the channel, Atlas included (unless removed).
  if (!c.agents) return agentId === ATLAS_ID ? "mention" : null;
  return c.agents.find((a) => a.id === agentId)?.mode ?? null;
}

/** Agents @mentioned in a message (by handle; "@agent" still means Atlas). */
export function mentionedAgents(dir: Pick<Directory, "agents">, text: string): PersonId[] {
  const handles = [...text.matchAll(/@([A-Za-z0-9_-]+)/g)].map((m) => m[1].toLowerCase());
  const out = new Set<PersonId>();
  for (const h of handles) {
    if (h === "agent") out.add(ATLAS_ID);
    const a = agentsOf(dir).find((x) => x.handle.toLowerCase() === h);
    if (a) out.add(a.id);
  }
  return [...out];
}

/** An agent's DM with me, if it exists. */
export function agentDmOf(dir: Pick<Directory, "chats">, agentId: PersonId): ChatId | null {
  return Object.values(dir.chats).find((c) => c.kind === "dm" && c.who === agentId)?.id ?? null;
}

export const ATLAS_ID: PersonId = "atlas";

export const ATLAS: Person = {
  id: ATLAS_ID, name: "Atlas", first: "Atlas", initials: "A", color: "var(--atlas)", team: null, isAgent: true,
  title: "Agent · works on tickets with your permissions",
};

/** A person by id; someone who left the workspace still renders. */
export function personOf(dir: Pick<Directory, "people">, id: PersonId): Person {
  return dir.people[id] ?? { id, name: "Former member", first: "Former member", initials: "?", color: "#6B7280", team: null };
}

export function teamName(dir: Pick<Directory, "teams">, id: TeamId | null | undefined) {
  if (!id) return "No team";
  return dir.teams.find((t) => t.id === id)?.name ?? id;
}

/** "#general", a teammate's name for a DM, or "Atlas". */
export function chatTitle(dir: Pick<Directory, "chats" | "people">, chatId: ChatId) {
  const meta = dir.chats[chatId];
  if (!meta) return "Unknown chat";
  return meta.kind === "channel" ? `#${meta.label}` : personOf(dir, meta.who).name;
}

/** The Atlas DM id for this person. */
export function atlasDmOf(dir: Pick<Directory, "chats">): ChatId | null {
  return Object.values(dir.chats).find((c) => c.kind === "dm" && c.who === ATLAS_ID)?.id ?? null;
}

const PALETTE = ["#C2410C", "#0F766E", "#BE185D", "#4D7C0F", "#1D4ED8", "#B45309", "#0E7490", "#9F1239"];

/** Stable color and initials for a member. */
export function makePerson(p: { id: PersonId; name: string; team?: TeamId | null; avatarUrl?: string | null; title?: string | null }, isMe = false): Person {
  const parts = p.name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  let h = 0;
  for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    id: p.id, name: p.name, first: parts[0] ?? p.name, initials, team: p.team ?? null,
    color: isMe ? "var(--brand)" : PALETTE[h % PALETTE.length], avatarUrl: p.avatarUrl ?? null, title: p.title ?? null,
  };
}
