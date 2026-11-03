import "server-only";

import { check, sb } from "@/lib/store/supabase";
import type { Role } from "@/lib/types";
import type { ChannelRow, InviteRow, MemberRow, Registry, WorkspaceRow } from "./types";

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
