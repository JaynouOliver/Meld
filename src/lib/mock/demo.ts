import { ATLAS, type Directory, type Team } from "../directory";
import type { ChatId, ChatMeta, Person, PersonId, Role } from "../types";

/**
 * Northwind: the sample workspace. Seeds the in-memory store (browser preview, evals,
 * local dev) and the "northwind" workspace in Supabase. "me" is Suvra Das, the owner.
 */
export const DEMO_WORKSPACE_ID = "northwind";

export const DEMO_TEAMS: Team[] = [
  { id: "design", name: "Design" },
  { id: "payments", name: "Payments" },
  { id: "platform", name: "Platform" },
];

export const DEMO_PEOPLE: Record<PersonId, Person> = {
  me: { id: "me", name: "Suvra Das", first: "Suvra", initials: "SD", color: "var(--brand)", team: "design", title: "Founder" },
  aiko: { id: "aiko", name: "Aiko Tanaka", first: "Aiko", initials: "AT", color: "#C2410C", team: "design", title: "Product designer" },
  ravi: { id: "ravi", name: "Ravi Menon", first: "Ravi", initials: "RM", color: "#0F766E", team: "payments", title: "Engineer" },
  lena: { id: "lena", name: "Lena Park", first: "Lena", initials: "LP", color: "#BE185D", team: "payments", title: "Engineer" },
  diego: { id: "diego", name: "Diego Alvarez", first: "Diego", initials: "DA", color: "#4D7C0F", team: "platform", title: "Engineer" },
  atlas: ATLAS,
};

/** Demo members' roles (everyone but Suvra is a member). */
export const DEMO_ROLES: Record<PersonId, Role> = { me: "owner", aiko: "member", ravi: "member", lena: "member", diego: "member" };

const everyone: PersonId[] = ["me", "aiko", "ravi", "lena", "diego", "atlas"];
export const DEMO_CHATS: Record<ChatId, ChatMeta> = {
  general: { id: "general", kind: "channel", label: "general", topic: "Company-wide announcements", team: null, members: everyone },
  design: { id: "design", kind: "channel", label: "product-design", topic: "Design reviews, specs and prototypes", team: "design", members: everyone },
  payments: { id: "payments", kind: "channel", label: "payments", topic: "Checkout, billing and payment providers", team: "payments", members: everyone },
  platform: { id: "platform", kind: "channel", label: "platform-eng", topic: "Infra, CI and internal APIs", team: "platform", members: everyone },
  aiko: { id: "aiko", kind: "dm", who: "aiko", topic: "Product designer · Design" },
  ravi: { id: "ravi", kind: "dm", who: "ravi", topic: "Engineer · Payments" },
  atlas: { id: "atlas", kind: "dm", who: "atlas", topic: "Agent · works on tickets with your permissions" },
};

/** The demo as Suvra sees it. */
export function demoDirectory(role: Role = "owner"): Directory {
  return {
    workspace: { id: DEMO_WORKSPACE_ID, name: "Northwind", slug: "northwind", ticketPrefix: "NW", repo: "northwind/web" },
    me: "me",
    role,
    roles: DEMO_ROLES,
    people: DEMO_PEOPLE,
    personOrder: everyone,
    teams: DEMO_TEAMS,
    chats: DEMO_CHATS,
    channels: ["general", "design", "payments", "platform"],
    dms: ["aiko", "ravi", "atlas"],
    home: "design",
    memberships: [{ id: DEMO_WORKSPACE_ID, name: "Northwind", role: "owner" }],
    demo: true,
  };
}
