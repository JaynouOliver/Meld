import "server-only";

import { check, sb } from "@/lib/store/supabase";
import type { Role } from "@/lib/types";
import type { AgentRow, ChannelAgentRow, ChannelRow, InviteRow, MemberRow, Registry, WorkspaceRow } from "./types";

interface WsRow { id: string; name: string; slug: string; ticket_prefix: string; repo: string | null; teams: WorkspaceRow["teams"]; demo: boolean }
const wsFrom = (r: WsRow): WorkspaceRow => ({ id: r.id, name: r.name, slug: r.slug, ticketPrefix: r.ticket_prefix, repo: r.repo, teams: r.teams ?? [], demo: r.demo });

interface ChRow { id: string; workspace_id: string; kind: "channel" | "dm"; name: string | null; topic: string; team: string | null; members: string[] | null; created_by: string | null; created_at: string }
const chFrom = (r: ChRow): ChannelRow => ({
  id: r.id, workspaceId: r.workspace_id, kind: r.kind, name: r.name, topic: r.topic, team: r.team, members: r.members, createdBy: r.created_by, createdAt: r.created_at,
});

interface InvRow { token: string; workspace_id: string; role: Role; created_by: string; created_at: string; expires_at: string; revoked: boolean }
const invFrom = (r: InvRow): InviteRow => ({
  token: r.token, workspaceId: r.workspace_id, role: r.role, createdBy: r.created_by, createdAt: r.created_at, expiresAt: r.expires_at, revoked: r.revoked,
});

const WS_COLS = "id,name,slug,ticket_prefix,repo,teams,demo";

interface AgRow {
  id: string; workspace_id: string; handle: string; name: string; description: string; instructions: string; tools: AgentRow["tools"];
  kind: AgentRow["kind"]; color: string | null; token_hash: string | null; created_by: string | null; created_at: string;
}
const agFrom = (r: AgRow): AgentRow => ({
  id: r.id, workspaceId: r.workspace_id, handle: r.handle, name: r.name, description: r.description, instructions: r.instructions,
  tools: r.tools ?? ["read"], kind: r.kind, color: r.color, tokenHash: r.token_hash, createdBy: r.created_by, createdAt: r.created_at,
});

export const supabaseRegistry: Registry = {
  async upsertProfile(p) {
    check(await sb().from("profiles").upsert({ id: p.id, name: p.name, email: p.email, avatar_url: p.avatarUrl }), "upsert profile");
  },
  async memberships(userId) {
    const rows = check(
      await sb().from("workspace_members").select(`role, workspaces(${WS_COLS})`).eq("user_id", userId).order("joined_at"),
      "memberships",
    ) as unknown as { role: Role; workspaces: WsRow | null }[];
    return rows.filter((r) => r.workspaces).map((r) => ({ role: r.role, workspace: wsFrom(r.workspaces!) }));
  },
  async workspace(id) {
    const r = check(await sb().from("workspaces").select(WS_COLS).eq("id", id).maybeSingle(), "workspace") as WsRow | null;
    return r ? wsFrom(r) : null;
  },
  async slugTaken(slug) {
    const r = check(await sb().from("workspaces").select("id").eq("slug", slug).maybeSingle(), "slug") as { id: string } | null;
    return !!r;
  },
  async createWorkspace(w, owner) {
    check(
      await sb().from("workspaces").insert({ id: w.id, name: w.name, slug: w.slug, ticket_prefix: w.ticketPrefix, repo: w.repo, teams: w.teams, created_by: owner }),
      "create workspace",
    );
    check(await sb().from("workspace_members").insert({ workspace_id: w.id, user_id: owner, role: "owner" }), "add owner");
  },
  async updateWorkspace(id, patch) {
    const u: Record<string, unknown> = {};
    if (patch.name !== undefined) u.name = patch.name;
    if (patch.teams !== undefined) u.teams = patch.teams;
    if (patch.repo !== undefined) u.repo = patch.repo;
    check(await sb().from("workspaces").update(u).eq("id", id), "update workspace");
  },
  async members(workspaceId) {
    const rows = check(
      await sb().from("workspace_members").select("user_id, role, team, title, profiles(name, email, avatar_url)").eq("workspace_id", workspaceId),
      "members",
    ) as unknown as { user_id: string; role: Role; team: string | null; title: string | null; profiles: { name: string; email: string | null; avatar_url: string | null } | null }[];
    return rows.map(
      (r): MemberRow => ({
        id: r.user_id, role: r.role, team: r.team, title: r.title,
        name: r.profiles?.name ?? "Unknown", email: r.profiles?.email ?? null, avatarUrl: r.profiles?.avatar_url ?? null,
      }),
    );
  },
  async addMember(workspaceId, userId, role) {
    const res = await sb().from("workspace_members").insert({ workspace_id: workspaceId, user_id: userId, role });
    if (res.error?.code === "23505") return; // already a member
    check(res, "add member");
  },
  async updateMember(workspaceId, userId, patch) {
    check(await sb().from("workspace_members").update(patch).eq("workspace_id", workspaceId).eq("user_id", userId), "update member");
  },
  async removeMember(workspaceId, userId) {
    check(await sb().from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId), "remove member");
  },
  async channels(workspaceId) {
    const rows = check(await sb().from("channels").select("*").eq("workspace_id", workspaceId).order("created_at"), "channels") as ChRow[];
    return rows.map(chFrom);
  },
  async createChannel(c) {
    check(
      await sb().from("channels").insert({
        id: c.id, workspace_id: c.workspaceId, kind: c.kind, name: c.name, topic: c.topic, team: c.team, members: c.members, created_by: c.createdBy, created_at: c.createdAt,
      }),
      "create channel",
    );
  },
  async updateChannel(workspaceId, id, patch) {
    check(await sb().from("channels").update(patch).eq("workspace_id", workspaceId).eq("id", id), "update channel");
  },
  async deleteChannel(workspaceId, id) {
    check(await sb().from("channels").delete().eq("workspace_id", workspaceId).eq("id", id), "delete channel");
  },
  async agents(workspaceId) {
    const rows = check(await sb().from("agents").select("*").eq("workspace_id", workspaceId).order("created_at"), "agents") as AgRow[];
    return rows.map(agFrom);
  },
  async agentByToken(tokenHash) {
    const r = check(await sb().from("agents").select("*").eq("token_hash", tokenHash).maybeSingle(), "agent by token") as AgRow | null;
    return r ? agFrom(r) : null;
  },
  async createAgent(a) {
    check(
      await sb().from("agents").insert({
        id: a.id, workspace_id: a.workspaceId, handle: a.handle, name: a.name, description: a.description, instructions: a.instructions,
        tools: a.tools, kind: a.kind, color: a.color, token_hash: a.tokenHash, created_by: a.createdBy, created_at: a.createdAt,
      }),
      "create agent",
    );
  },
  async updateAgent(workspaceId, id, patch) {
    const u: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) u[k === "tokenHash" ? "token_hash" : k] = v;
    check(await sb().from("agents").update(u).eq("workspace_id", workspaceId).eq("id", id), "update agent");
  },
  async deleteAgent(workspaceId, id) {
    check(await sb().from("channel_agents").delete().eq("workspace_id", workspaceId).eq("agent_id", id), "remove agent from channels");
    check(await sb().from("agents").delete().eq("workspace_id", workspaceId).eq("id", id), "delete agent");
  },
  async channelAgents(workspaceId) {
    const rows = check(await sb().from("channel_agents").select("chat_id,agent_id,mode").eq("workspace_id", workspaceId), "channel agents") as {
      chat_id: string; agent_id: string; mode: ChannelAgentRow["mode"];
    }[];
    return rows.map((r) => ({ chatId: r.chat_id, agentId: r.agent_id, mode: r.mode }));
  },
  async setChannelAgent(workspaceId, chatId, agentId, mode, by) {
    if (!mode) {
      check(await sb().from("channel_agents").delete().eq("workspace_id", workspaceId).eq("chat_id", chatId).eq("agent_id", agentId), "remove channel agent");
      return;
    }
    check(
      await sb().from("channel_agents").upsert({ workspace_id: workspaceId, chat_id: chatId, agent_id: agentId, mode, added_by: by }, { onConflict: "workspace_id,chat_id,agent_id" }),
      "set channel agent",
    );
  },
  async createInvite(i) {
    check(
      await sb().from("invites").insert({ token: i.token, workspace_id: i.workspaceId, role: i.role, created_by: i.createdBy, created_at: i.createdAt, expires_at: i.expiresAt }),
      "create invite",
    );
  },
  async invite(token) {
    const r = check(await sb().from("invites").select("*").eq("token", token).maybeSingle(), "invite") as InvRow | null;
    return r ? invFrom(r) : null;
  },
  async invites(workspaceId) {
    const rows = check(await sb().from("invites").select("*").eq("workspace_id", workspaceId).order("created_at"), "invites") as InvRow[];
    return rows.map(invFrom);
  },
  async revokeInvite(workspaceId, token) {
    check(await sb().from("invites").update({ revoked: true }).eq("workspace_id", workspaceId).eq("token", token), "revoke invite");
  },
};
