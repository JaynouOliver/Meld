import type { ChannelId, ChatId, ChatMeta, DmId, Person, PersonId, Priority, TeamId, TicketStatus } from "./types";

export const WORKSPACE_NAME = "Northwind";
export const DEFAULT_REPO = "northwind/web";
export const CURRENT_USER: PersonId = "me";

export const PEOPLE: Record<PersonId, Person> = {
  me: { id: "me", name: "Suvra Das", first: "Suvra", initials: "SD", color: "var(--brand)", team: "design" },
  aiko: { id: "aiko", name: "Aiko Tanaka", first: "Aiko", initials: "AT", color: "#C2410C", team: "design" },
  ravi: { id: "ravi", name: "Ravi Menon", first: "Ravi", initials: "RM", color: "#0F766E", team: "payments" },
  lena: { id: "lena", name: "Lena Park", first: "Lena", initials: "LP", color: "#BE185D", team: "payments" },
  diego: { id: "diego", name: "Diego Alvarez", first: "Diego", initials: "DA", color: "#4D7C0F", team: "platform" },
  atlas: { id: "atlas", name: "Atlas", first: "Atlas", initials: "A", color: "var(--atlas)", team: null, isAgent: true },
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

/**
 * [background, text, border, dot] for each status, as CSS variables (see globals.css).
 * Violet is never used here: it belongs to Atlas.
 */
const statusVars = (k: string): [string, string, string, string] => [
  `var(--status-${k}-bg)`,
  `var(--status-${k}-fg)`,
  `var(--status-${k}-line)`,
  `var(--status-${k}-dot)`,
];
export const STATUS_COLORS: Record<TicketStatus, [string, string, string, string]> = {
  "To do": statusVars("todo"),
  "In progress": statusVars("progress"),
  "In review": statusVars("review"),
  Done: statusVars("done"),
  Backburner: statusVars("later"),
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  High: "var(--priority-high)",
  Medium: "var(--priority-medium)",
  Low: "var(--priority-low)",
};

export const DEFAULT_ACCENT = "#2952E3";

/** Workspace accents. All pass 4.5:1 with white text. Violet is reserved for Atlas. */
export const ACCENTS = [
  { value: DEFAULT_ACCENT, label: "Cobalt" },
  { value: "#0F766E", label: "Teal" },
  { value: "#374154", label: "Graphite" },
  { value: "#C2410C", label: "Orange" },
] as const;

export function isOpen(status: TicketStatus) {
  return OPEN_STATUSES.includes(status);
}
