/** A workspace member's user id ("atlas" for the agent; short ids like "aiko" in the demo). */
export type PersonId = string;
/** A team inside a workspace (workspace.teams). */
export type TeamId = string;
export type Role = "owner" | "member" | "guest";
export type TicketStatus = "To do" | "In progress" | "In review" | "Done" | "Backburner";
export type Priority = "Low" | "Medium" | "High";
export type ChannelId = string;
export type DmId = string;
/** A channel or DM id. Unique across workspaces. */
export type ChatId = string;
export type GroupBy = "assignee" | "status" | "team";
export type TicketScope = "all" | "mine";

export interface Person {
  id: PersonId;
  name: string;
  first: string;
  initials: string;
  color: string;
  team: TeamId | null;
  isAgent?: boolean;
  avatarUrl?: string | null;
  /** Job title shown in DMs, e.g. "Product designer". */
  title?: string | null;
}

export interface GitHubLink {
  id: string;
  kind: "PR" | "Issue";
  num: string;
  repo: string;
}

export interface TicketImage {
  id: string;
  src: string;
  name: string;
}

export interface Activity {
  who: string;
  text: string;
  time: string;
}

export interface Ticket {
  id: string;
  team: TeamId;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  assignee: PersonId;
  reporter: PersonId;
  links: GitHubLink[];
  images: TicketImage[];
  updated: string;
  /** Chat that Atlas posts updates to when this ticket changes. */
  watch: { chat: ChatId; thread: string | null } | null;
  activity: Activity[];
}

/** What the chat shows for an Atlas action (confirm card or undo). */
export interface ActionView {
  id: string;
  status: "pending" | "applied" | "canceled" | "undone";
  /** One line per change, e.g. "Delete NW-126 \u201cDark mode for settings\u201d". */
  summary: string[];
  destructive: boolean;
  /** ISO time until which an applied action can be undone. */
  undoUntil: string | null;
}

/** A reply in a thread. Threads are flat, like Slack: replies can't have replies. */
export interface ReplyNode {
  id: string;
  who: PersonId;
  time: string;
  text: string;
  ticket?: string | null;
  /** Internal link to an agent action (stores only). */
  actionId?: string | null;
  /** Filled in when listing messages. */
  action?: ActionView | null;
}

export interface Message {
  id: string;
  who: PersonId;
  time: string;
  text: string;
  /** Ticket card attached to the message (Atlas confirmations). */
  ticket?: string | null;
  /** Internal link to an agent action (stores only). */
  actionId?: string | null;
  /** Filled in when listing messages. */
  action?: ActionView | null;
  replies: ReplyNode[];
}

export type ChatMeta =
  | { id: ChannelId; kind: "channel"; label: string; topic: string; team: TeamId | null; members: PersonId[] }
  | { id: DmId; kind: "dm"; who: PersonId; topic: string };

export interface WeekDay {
  d: string;
  /** Ticket changes made by people. */
  p: number;
  /** Ticket changes made by Atlas. */
  a: number;
}
