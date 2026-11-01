import type { ChannelId, ChatId, ChatMeta, DmId, Person, PersonId, Priority, TeamId, TicketStatus } from "./types";

export const WORKSPACE_NAME = "Northwind";
export const DEFAULT_REPO = "northwind/web";
export const CURRENT_USER: PersonId = "me";

export const PEOPLE: Record<PersonId, Person> = {
  me: { id: "me", name: "Suvra Das", first: "Suvra", initials: "SD", color: "#2F6FEB", team: "design" },
  aiko: { id: "aiko", name: "Aiko Tanaka", first: "Aiko", initials: "AT", color: "#C2410C", team: "design" },
  ravi: { id: "ravi", name: "Ravi Menon", first: "Ravi", initials: "RM", color: "#0F766E", team: "payments" },
  lena: { id: "lena", name: "Lena Park", first: "Lena", initials: "LP", color: "#BE185D", team: "payments" },
  diego: { id: "diego", name: "Diego Alvarez", first: "Diego", initials: "DA", color: "#4D7C0F", team: "platform" },
  atlas: { id: "atlas", name: "Atlas", first: "Atlas", initials: "A", color: "#5B21B6", team: null, isAgent: true },
};

export const PERSON_ORDER: PersonId[] = ["me", "aiko", "ravi", "lena", "diego", "atlas"];
export const MENTIONABLE: PersonId[] = ["atlas", "aiko", "ravi", "lena", "diego"];

export const CHANNELS: ChannelId[] = ["general", "design", "payments", "platform"];
export const DMS: DmId[] = ["aiko", "ravi", "atlas"];

export const CHAT_META: Record<ChatId, ChatMeta> = {
  general: { id: "general", kind: "channel", label: "general", topic: "Company-wide announcements", team: null, members: ["me", "aiko", "ravi", "lena", "diego", "atlas"] },
  design: { id: "design", kind: "channel", label: "product-design", topic: "Design reviews, specs and prototypes", team: "design", members: ["me", "aiko", "atlas"] },
  payments: { id: "payments", kind: "channel", label: "payments", topic: "Checkout, billing and payment providers", team: "payments", members: ["me", "ravi", "lena", "atlas"] },
  platform: { id: "platform", kind: "channel", label: "platform-eng", topic: "Infra, CI and internal APIs", team: "platform", members: ["me", "diego", "atlas"] },
  aiko: { id: "aiko", kind: "dm", who: "aiko", topic: "Product designer · Design" },
  ravi: { id: "ravi", kind: "dm", who: "ravi", topic: "Engineer · Payments" },
  atlas: { id: "atlas", kind: "dm", who: "atlas", topic: "Agent · works on tickets with your permissions" },
};

export function isChatId(x: string): x is ChatId {
  return x in CHAT_META;
}

export const TEAMS: TeamId[] = ["design", "payments", "platform"];
export function teamName(t: TeamId | null | undefined) {
  return t ? { design: "Design", payments: "Payments", platform: "Platform" }[t] : "No team";
}

export const STATUSES: TicketStatus[] = ["To do", "In progress", "In review", "Done", "Backburner"];
export const STATUS_ORDER: TicketStatus[] = ["To do", "In progress", "In review", "Backburner", "Done"];
export const OPEN_STATUSES: TicketStatus[] = ["To do", "In progress", "In review"];
export const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

/** [background, text, border, dot] for each status. */
export const STATUS_COLORS: Record<TicketStatus, [string, string, string, string]> = {
  "To do": ["#EEF0F3", "#3D4451", "#CDD2DA", "#8B95A5"],
  "In progress": ["#FFF4E0", "#8A5A00", "#F0C77A", "#D97706"],
  "In review": ["#F3E8FF", "#6B21A8", "#D8B4FE", "#8B5CF6"],
  Done: ["#DCFCE7", "#166534", "#86EFAC", "#16A34A"],
  Backburner: ["#F1F2F4", "#5B6472", "#D5D9E0", "#B8BEC8"],
};

export const PRIORITY_COLOR: Record<Priority, string> = { High: "#B42318", Medium: "#8A5A00", Low: "#5B6472" };

export const ACCENTS = [
  { value: "#2F6FEB", label: "Blue" },
  { value: "#0F766E", label: "Teal" },
  { value: "#7C3AED", label: "Violet" },
  { value: "#C2410C", label: "Orange" },
] as const;

export function isOpen(status: TicketStatus) {
  return OPEN_STATUSES.includes(status);
}
