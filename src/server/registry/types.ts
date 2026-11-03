import type { Team } from "@/lib/directory";
import type { ChatId, PersonId, Role, TeamId } from "@/lib/types";

/**
 * Accounts and workspaces: who belongs where, the channels in each workspace, and
 * invites. Workspace content (messages, tickets) lives in the per-workspace Store.
 */
export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  ticketPrefix: string;
  repo: string | null;
  teams: Team[];
  /** The sample workspace (Northwind): demo teammates answer DMs. */
  demo: boolean;
}

export interface Profile {
  id: PersonId;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface MemberRow extends Profile {
  role: Role;
  team: TeamId | null;
  title: string | null;
}

export interface ChannelRow {
  id: ChatId;
  workspaceId: string;
  /** channel: everyone in the workspace can see it. dm: only its two members. */
  kind: "channel" | "dm";
  name: string | null;
  topic: string;
  team: TeamId | null;
  /** DMs only: the two people in it (one may be "atlas"). */
  members: PersonId[] | null;
  createdBy: PersonId | null;
  createdAt: string;
}

export interface AgentRow {
  id: PersonId;
  workspaceId: string;
  handle: string;
  name: string;
  description: string;
  instructions: string;
  tools: ("read" | "write" | "delete")[];
  kind: "custom" | "external";
  color: string | null;
  tokenHash: string | null;
  createdBy: PersonId | null;
  createdAt: string;
}

export interface ChannelAgentRow {
  chatId: ChatId;
  agentId: PersonId;
  mode: "mention" | "lurk" | "active" | "off";
}

export interface InviteRow {
  token: string;
  workspaceId: string;
  role: Role;
  createdBy: PersonId;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

export interface Registry {
  upsertProfile(p: Profile): Promise<void>;
  memberships(userId: PersonId): Promise<{ workspace: WorkspaceRow; role: Role }[]>;
  workspace(id: string): Promise<WorkspaceRow | null>;
  slugTaken(slug: string): Promise<boolean>;
  /** Creates the workspace with `owner` as its first member (role owner). */
  createWorkspace(w: Omit<WorkspaceRow, "demo">, owner: PersonId): Promise<void>;
  updateWorkspace(id: string, patch: Partial<Pick<WorkspaceRow, "name" | "teams" | "repo">>): Promise<void>;
  members(workspaceId: string): Promise<MemberRow[]>;
  addMember(workspaceId: string, userId: PersonId, role: Role): Promise<void>;
  updateMember(workspaceId: string, userId: PersonId, patch: Partial<Pick<MemberRow, "role" | "team" | "title">>): Promise<void>;
  removeMember(workspaceId: string, userId: PersonId): Promise<void>;
  channels(workspaceId: string): Promise<ChannelRow[]>;
  createChannel(c: ChannelRow): Promise<void>;
  updateChannel(workspaceId: string, id: ChatId, patch: Partial<Pick<ChannelRow, "name" | "topic">>): Promise<void>;
  deleteChannel(workspaceId: string, id: ChatId): Promise<void>;
  agents(workspaceId: string): Promise<AgentRow[]>;
  agentByToken(tokenHash: string): Promise<AgentRow | null>;
  createAgent(a: AgentRow): Promise<void>;
  updateAgent(workspaceId: string, id: PersonId, patch: Partial<Pick<AgentRow, "name" | "handle" | "description" | "instructions" | "tools" | "tokenHash">>): Promise<void>;
  deleteAgent(workspaceId: string, id: PersonId): Promise<void>;
  channelAgents(workspaceId: string): Promise<ChannelAgentRow[]>;
  /** Set an agent's mode in a channel; null removes the row (back to the default). */
  setChannelAgent(workspaceId: string, chatId: ChatId, agentId: PersonId, mode: ChannelAgentRow["mode"] | null, by: PersonId): Promise<void>;
  createInvite(i: InviteRow): Promise<void>;
  invite(token: string): Promise<InviteRow | null>;
  invites(workspaceId: string): Promise<InviteRow[]>;
  revokeInvite(workspaceId: string, token: string): Promise<void>;
}
