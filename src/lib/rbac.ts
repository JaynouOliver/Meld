import { teamName, type Directory } from "./directory";
import type { PersonId, Role, TeamId, Ticket } from "./types";

/**
 * Role-based ticket access. The server enforces it on every call; the client uses the
 * same rules only to render locked chips and hide rows.
 *
 * - owner:  every ticket; can delete.
 * - member: their team's tickets plus anything assigned to them (all tickets if they
 *           have no team); creates tickets in their team.
 * - guest:  only tickets assigned to them; can't create.
 */
export interface Viewer {
  role: Role;
  me: PersonId;
  team: TeamId | null;
}

export function viewerOf(dir: Pick<Directory, "me" | "people">, role: Role): Viewer {
  return { role, me: dir.me, team: dir.people[dir.me]?.team ?? null };
}

export function canSee(v: Viewer, t: Pick<Ticket, "team" | "assignee">) {
  if (v.role === "owner") return true;
  if (v.role === "member") return !v.team || t.team === v.team || t.assignee === v.me;
  return t.assignee === v.me;
}

export function canCreateIn(v: Viewer, team: TeamId) {
  if (v.role === "owner") return true;
  if (v.role === "member") return !v.team || team === v.team;
  return false;
}

export function canDelete(role: Role) {
  return role === "owner";
}

/** Owners manage channels, invites and members. */
export function canManage(role: Role) {
  return role === "owner";
}

const RANK: Record<Role, number> = { guest: 0, member: 1, owner: 2 };
/** Owners may preview the app as a lower role; nobody can act above their real role. */
export function clampRole(requested: Role | undefined, actual: Role): Role {
  return requested && RANK[requested] <= RANK[actual] ? requested : actual;
}

export function roleLabel(dir: Pick<Directory, "teams" | "people" | "me">, role: Role) {
  const team = dir.people[dir.me]?.team;
  if (role === "owner") return "Org owner";
  if (role === "member") return team ? `Team member · ${teamName(dir, team)}` : "Team member";
  return "Guest";
}

export function roleOptionLabel(dir: Pick<Directory, "teams" | "people" | "me">, role: Role) {
  const team = dir.people[dir.me]?.team;
  if (role === "owner") return "Org owner: all tickets";
  if (role === "member") return team ? `Team member: ${teamName(dir, team)} only` : "Team member";
  return "Guest: assigned to me only";
}

export function roleScope(dir: Pick<Directory, "teams" | "people" | "me" | "workspace">, role: Role) {
  const team = dir.people[dir.me]?.team;
  if (role === "owner") return `Org owner: you can see every ticket in ${dir.workspace.name}`;
  if (role === "member")
    return team ? `Team member: you see ${teamName(dir, team)} tickets plus anything assigned to you` : "Team member: you see every ticket";
  return "Guest: you only see tickets assigned to you";
}
