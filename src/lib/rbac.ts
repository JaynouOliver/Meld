import type { Role, Ticket } from "./types";

/**
 * Role-based ticket visibility. This mirrors what the backend must enforce;
 * the client uses it only to render locked chips and hide rows.
 */
export function canSee(role: Role, t: Pick<Ticket, "team" | "assignee">) {
  if (role === "owner") return true;
  if (role === "member") return t.team === "design" || t.assignee === "me";
  return t.assignee === "me";
}

export function canDelete(role: Role) {
  return role === "owner";
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Org owner",
  member: "Team member · Design",
  guest: "Guest",
};

export const ROLE_OPTION_LABEL: Record<Role, string> = {
  owner: "Org owner: all tickets",
  member: "Team member: Design only",
  guest: "Guest: assigned to me only",
};

export const ROLE_SCOPE: Record<Role, string> = {
  owner: "Org owner: you can see every ticket in Northwind",
  member: "Team member: you see Design tickets plus anything assigned to you",
  guest: "Guest: you only see tickets assigned to you",
};
