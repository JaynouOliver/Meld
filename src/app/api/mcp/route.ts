import { ApiError } from "@/lib/api/service";
import type { AgentInfo } from "@/lib/directory";
import { agentFromToken, callTool, MCP_TOOLS, ToolError } from "@/server/agents/mcp";
import { runInCtx } from "@/server/context";
import { WorkspaceError } from "@/server/workspace";

/**
 * MCP server (Streamable HTTP, JSON responses, stateless): bring your own agent.
 *   claude mcp add --transport http meld https://<host>/api/mcp --header "Authorization: Bearer <token>"
 * The token belongs to one external agent in one workspace; every call runs as that agent.
 * See src/server/agents/mcp.ts and docs/agent-platform.md.
 */
export const maxDuration = 60;

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const INSTRUCTIONS =
  "You are connected to Meld, a team chat with built-in tickets, as an agent member of the team. " +
  "Start with get_inbox: it lists messages that @mention you, DMs, and hand-offs from other agents. Answer each with reply(item_id, text). " +
  "You can only read channels you've been added to (list_channels). @mention another agent in a reply to hand them part of the work. " +
  "Use the ticket tools to file and update work (status, owner, PR links, blockers).";

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const who = token ? await agentFromToken(token) : null;
  if (!who) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Missing or invalid agent token. Create an external agent in Meld (Agents → Add an agent → Your own agent) and use its token." } },
      { status: 401 },
    );
  }
  let body: RpcRequest | RpcRequest[];
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const batch = Array.isArray(body);
  const requests = batch ? (body as RpcRequest[]) : [body as RpcRequest];
  const responses = [];
  for (const r of requests) {
    const res = await runInCtx(who.ctx, () => handle(r, who.agent));
    if (r.id !== undefined && r.id !== null) responses.push({ jsonrpc: "2.0", id: r.id, ...res });
  }
  // Only notifications: accepted, nothing to say.
  if (!responses.length) return new Response(null, { status: 202 });
  return Response.json(batch ? responses : responses[0]);
}

/** No server-initiated stream: clients poll get_inbox. */
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}

async function handle(r: RpcRequest, agent: AgentInfo) {
  switch (r.method) {
    case "initialize": {
      const asked = String(r.params?.protocolVersion ?? "");
      return {
        result: {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "meld", title: "Meld", version: "1.0.0" },
          instructions: `${INSTRUCTIONS} You are @${agent.handle} (${agent.name}).`,
        },
      };
    }
    case "ping":
      return { result: {} };
    case "tools/list":
      return { result: { tools: MCP_TOOLS } };
    case "tools/call": {
      const name = String(r.params?.name ?? "");
      const args = (r.params?.arguments as Record<string, unknown>) ?? {};
      try {
        const text = await callTool(agent, name, args);
        return { result: { content: [{ type: "text", text }] } };
      } catch (e) {
        const known = e instanceof ToolError || e instanceof ApiError || e instanceof WorkspaceError;
        if (!known) console.error(`[mcp] ${agent.handle} ${name} failed:`, e);
        return { result: { content: [{ type: "text", text: known ? (e as Error).message : "Something went wrong in Meld." }], isError: true } };
      }
    }
    default:
      if (r.method.startsWith("notifications/")) return {};
      return { error: { code: -32601, message: `Method not found: ${r.method}` } };
  }
}
