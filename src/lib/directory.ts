import type { ChatId, ChatMeta, Person, PersonId, Role, TeamId } from "./types";

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
