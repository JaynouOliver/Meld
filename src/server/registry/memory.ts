import "server-only";

import { DEMO_CHATS, DEMO_PEOPLE, DEMO_ROLES, DEMO_TEAMS, DEMO_WORKSPACE_ID } from "@/lib/mock/demo";
import type { AgentRow, ChannelAgentRow, ChannelRow, InviteRow, MemberRow, Profile, Registry, WorkspaceRow } from "./types";

/** In-process registry for local dev and tests, seeded with the Northwind demo. */
interface Data {
  profiles: Map<string, Profile>;
  workspaces: Map<string, WorkspaceRow>;
  members: Map<string, Map<string, Omit<MemberRow, keyof Profile> & { id: string }>>;
  channels: ChannelRow[];
  invites: InviteRow[];
  agents: AgentRow[];
  channelAgents: (ChannelAgentRow & { workspaceId: string })[];
}

function seed(): Data {
  const d: Data = { profiles: new Map(), workspaces: new Map(), members: new Map(), channels: [], invites: [], agents: [], channelAgents: [] };
  d.workspaces.set(DEMO_WORKSPACE_ID, {
    id: DEMO_WORKSPACE_ID, name: "Northwind", slug: "northwind", ticketPrefix: "NW", repo: "northwind/web", teams: DEMO_TEAMS, demo: true,
  });
  const ms = new Map<string, Omit<MemberRow, keyof Profile> & { id: string }>();
  for (const [id, role] of Object.entries(DEMO_ROLES)) {
    const p = DEMO_PEOPLE[id];
    d.profiles.set(id, { id, name: p.name, email: null, avatarUrl: null });
    ms.set(id, { id, role, team: p.team, title: p.title ?? null });
  }
  d.members.set(DEMO_WORKSPACE_ID, ms);
  const at = "2026-10-28T09:00:00.000Z";
  for (const c of Object.values(DEMO_CHATS)) {
    d.channels.push(
      c.kind === "channel"
        ? { id: c.id, workspaceId: DEMO_WORKSPACE_ID, kind: "channel", name: c.label, topic: c.topic, team: c.team, members: null, createdBy: "me", createdAt: at }
        : { id: c.id, workspaceId: DEMO_WORKSPACE_ID, kind: "dm", name: null, topic: c.topic, team: null, members: ["me", c.who], createdBy: "me", createdAt: at },
    );
  }
  return d;
}

const g = globalThis as typeof globalThis & { __meldRegistry?: Data };
const data = (g.__meldRegistry ??= seed());
const clone = <T,>(x: T): T => structuredClone(x);

export const memoryRegistry: Registry = {
  async upsertProfile(p) {
    data.profiles.set(p.id, { ...data.profiles.get(p.id), ...p });
  },
  async memberships(userId) {
    const out = [];
    for (const [wsId, ms] of data.members) {
      const m = ms.get(userId);
      const ws = data.workspaces.get(wsId);
      if (m && ws) out.push({ workspace: clone(ws), role: m.role });
    }
    return out;
  },
  async workspace(id) {
    const w = data.workspaces.get(id);
    return w ? clone(w) : null;
  },
  async slugTaken(slug) {
    return [...data.workspaces.values()].some((w) => w.slug === slug);
  },
  async createWorkspace(w, owner) {
    data.workspaces.set(w.id, { ...clone(w), demo: false });
    data.members.set(w.id, new Map([[owner, { id: owner, role: "owner", team: null, title: null }]]));
  },
  async updateWorkspace(id, patch) {
    const w = data.workspaces.get(id);
    if (w) Object.assign(w, clone(patch));
  },
  async members(workspaceId) {
    return [...(data.members.get(workspaceId)?.values() ?? [])].map((m) => {
      const p = data.profiles.get(m.id) ?? { id: m.id, name: "Unknown", email: null, avatarUrl: null };
      return { ...p, role: m.role, team: m.team, title: m.title };
    });
  },
  async addMember(workspaceId, userId, role) {
    const ms = data.members.get(workspaceId);
    if (ms && !ms.has(userId)) ms.set(userId, { id: userId, role, team: null, title: null });
  },
  async updateMember(workspaceId, userId, patch) {
    const m = data.members.get(workspaceId)?.get(userId);
    if (m) Object.assign(m, patch);
  },
  async removeMember(workspaceId, userId) {
    data.members.get(workspaceId)?.delete(userId);
  },
  async channels(workspaceId) {
    return clone(data.channels.filter((c) => c.workspaceId === workspaceId));
  },
  async createChannel(c) {
    data.channels.push(clone(c));
  },
  async updateChannel(workspaceId, id, patch) {
    const c = data.channels.find((x) => x.workspaceId === workspaceId && x.id === id);
    if (c) Object.assign(c, patch);
  },
  async deleteChannel(workspaceId, id) {
    data.channels = data.channels.filter((c) => !(c.workspaceId === workspaceId && c.id === id));
  },
  async agents(workspaceId) {
    return clone(data.agents.filter((a) => a.workspaceId === workspaceId));
  },
  async agentByToken(tokenHash) {
    const a = data.agents.find((x) => x.tokenHash === tokenHash);
    return a ? clone(a) : null;
  },
  async createAgent(a) {
    data.agents.push(clone(a));
  },
  async updateAgent(workspaceId, id, patch) {
    const a = data.agents.find((x) => x.workspaceId === workspaceId && x.id === id);
    if (a) Object.assign(a, clone(patch));
  },
  async deleteAgent(workspaceId, id) {
    data.agents = data.agents.filter((x) => !(x.workspaceId === workspaceId && x.id === id));
    data.channelAgents = data.channelAgents.filter((x) => !(x.workspaceId === workspaceId && x.agentId === id));
  },
  async channelAgents(workspaceId) {
    return clone(data.channelAgents.filter((x) => x.workspaceId === workspaceId)).map(({ workspaceId: _w, ...r }) => (void _w, r));
  },
  async setChannelAgent(workspaceId, chatId, agentId, mode) {
    data.channelAgents = data.channelAgents.filter((x) => !(x.workspaceId === workspaceId && x.chatId === chatId && x.agentId === agentId));
    if (mode) data.channelAgents.push({ workspaceId, chatId, agentId, mode });
  },
  async createInvite(i) {
    data.invites.push(clone(i));
  },
  async invite(token) {
    const i = data.invites.find((x) => x.token === token);
    return i ? clone(i) : null;
  },
  async invites(workspaceId) {
    return clone(data.invites.filter((i) => i.workspaceId === workspaceId));
  },
  async revokeInvite(workspaceId, token) {
    const i = data.invites.find((x) => x.workspaceId === workspaceId && x.token === token);
    if (i) i.revoked = true;
  },
};
