export type PersonId = "me" | "aiko" | "ravi" | "lena" | "diego" | "atlas";
export type TeamId = "design" | "payments" | "platform";
export type Role = "owner" | "member" | "guest";
export type TicketStatus = "To do" | "In progress" | "In review" | "Done" | "Backburner";
export type Priority = "Low" | "Medium" | "High";
export type ChannelId = "general" | "design" | "payments" | "platform";
export type DmId = "aiko" | "ravi" | "atlas";
export type ChatId = ChannelId | DmId;
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

export interface ReplyNode {
  id: string;
  who: PersonId;
  time: string;
  text: string;
  ticket?: string | null;
  kids: ReplyNode[];
}

export interface Message {
  id: string;
  who: PersonId;
  time: string;
  text: string;
  /** Ticket card attached to the message (Atlas confirmations). */
  ticket?: string | null;
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
