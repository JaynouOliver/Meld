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
  createInvite(i: InviteRow): Promise<void>;
  invite(token: string): Promise<InviteRow | null>;
  invites(workspaceId: string): Promise<InviteRow[]>;
  revokeInvite(workspaceId: string, token: string): Promise<void>;
}
