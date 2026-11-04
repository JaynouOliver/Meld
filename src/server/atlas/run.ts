import "server-only";

import type OpenAI from "openai";

import { currentDir } from "@/lib/context";
import { ATLAS_AGENT, personOf, type AgentInfo } from "@/lib/directory";
import { MAX_AGENT_DEPTH } from "@/lib/agent/runs";
import { stamp, uid } from "@/lib/format";
import { applyOps, needsConfirmation, toView, summarize as summarizeOps, UNDO_WINDOW_MS, type ActionRecord, type TicketOp } from "@/lib/agent/actions";
import { getStore, type Store } from "@/lib/store";
import type { AskAtlasInput, AskAtlasResult } from "@/lib/api/service";
import type { ChatId, Message, ReplyNode } from "@/lib/types";
import { ATLAS_EFFORT, ATLAS_MODEL, llm } from "../llm";
import { buildContext, systemPromptFor, workspaceBlock } from "./prompt";
import { memoryBlock } from "../agents/memory";
import { clockBlock } from "../scheduled/reminders";
import { stepLabel, type Progress } from "./progress";
import { planToOps, runTool, toolsFor, type Effects } from "./tools";

const MAX_STEPS = 8;

export interface AtlasTrace {
  model: string;
  effort: string;
  steps: number;
  tools: { name: string; args: unknown; result: unknown }[];
  usage: { prompt: number; cached: number; completion: number; reasoning: number };
  ms: number;
  reply: string;
  error?: string;
  /** kept: shown; invalid: no such message (made up); overLimit: real but past the cap. */
  citations: { kept: string[]; invalid: string[]; overLimit: string[] };
  /** The model's reply before citations were verified. */
  rawReply?: string;
  /** The action this run produced, if it changed tickets. */
  action?: { id: string; status: ActionRecord["status"] } | null;
}

/**
 * Atlas on Meta's Model API: assemble context, run the tool loop, post the reply,
 * and announce ticket changes in the channels that follow those tickets.
 */
/**
 * Reasoning effort per request (evals/atlas.eval.ts): changing things (filing, assigning,
 * moving, deleting, missions) needs the default effort to reliably call its tools;
 * questions are answered as well at "minimal", about a third faster and cheaper.
 */
const WRITE_HINT =
  /\b(create|make|file|open|add|log|track|turn|convert|split|assign|reassign|give|move|set|mark|change|update|rename|close|reopen|finish|resolve|delete|remove|archive|link|unlink|block|unblock|prioriti[sz]e|start|plan|mission|undo|confirm)\b/i;
/** A reply that says something was (or will be, on confirm) created or changed. */
const CLAIMS_ACTION = /\b(once you confirm|confirm|created|filed|updated|assigned|moved|deleted|i'?ll (?:file|create|add|make|update|assign|move))\b/i;

export function effortFor(text: string): OpenAI.ReasoningEffort {
  if (process.env.ATLAS_REASONING_EFFORT) return ATLAS_EFFORT;
  return WRITE_HINT.test(text) ? "low" : "minimal";
}

export async function runAtlasAgent(
  input: AskAtlasInput & { replyId?: string; progress?: Progress; agent?: AgentInfo; depth?: number },
): Promise<AskAtlasResult & { trace: AtlasTrace; replyMessage?: Message | ReplyNode }> {
  const client = llm();
  if (!client) throw new Error("MODEL_API_KEY is not set");
  const started = Date.now();
  const where = input.chatId;
  const store = await getStore();
  const effects: Effects = { plan: new Map(), read: [] };
  const effort = effortFor(input.text);
  const trace: AtlasTrace = {
    model: ATLAS_MODEL, effort: String(effort), steps: 0, tools: [],
    usage: { prompt: 0, cached: 0, completion: 0, reasoning: 0 }, ms: 0, reply: "",
    citations: { kept: [], invalid: [], overLimit: [] },
  };

  const agent = input.agent ?? ATLAS_AGENT;
  const [tickets, chat] = await Promise.all([store.listTickets(), store.listMessages(where, { limit: 40 })]);
  // Handed over by another agent: the request text is that agent's message.
  const lastHop = (input.depth ?? 0) >= MAX_AGENT_DEPTH
    ? "\nThis is the last hand-off allowed in this chain: finish it yourself or hand back to a person; don't @mention other agents."
    : "";
  // What this agent was asked to remember in earlier conversations (src/server/agents/memory.ts).
  const memory = await memoryBlock(agent.id);
  // The requester's local time and zone, for "remind me tomorrow at 9" (src/server/scheduled).
  const clock = await clockBlock();
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: `${systemPromptFor(agent, currentDir())}\n\n${workspaceBlock(currentDir())}` },
    {
      role: "user",
      content: `${buildContext({ where, role: input.role, tickets, chat, threadId: input.threadId })}${memory ? `\n${memory}` : ""}\n${clock}

Request (on behalf of ${personOf(currentDir(), currentDir().me).name}): ${input.text}${lastHop}`,
    },
  ];

  const tools = toolsFor(currentDir(), agent.tools);
  const progress = input.progress;
  progress?.step(input.threadId ? "Reading the thread" : "Reading the conversation");
  let reply = "";
  const wantsWrite = WRITE_HINT.test(input.text);
  let nudged = false;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      trace.steps = step + 1;
      // Streamed, so the reply appears as it's written (tool calls arrive in pieces too).
      const stream = await client.chat.completions.create({
        model: ATLAS_MODEL,
        reasoning_effort: effort,
        messages,
        tools,
        stream: true,
        stream_options: { include_usage: true },
        // Same prefix (system prompt + tools) for every Atlas call: route to a warm cache.
        prompt_cache_key: `meld-atlas-v2-${currentDir().workspace.id}`,
      });
      let content = "";
      const parts: { id: string; name: string; args: string }[] = [];
      for await (const chunk of stream) {
        const d = chunk.choices[0]?.delta;
        if (d?.content) {
          content += d.content;
          if (!parts.length) progress?.draft(content);
        }
        for (const tc of d?.tool_calls ?? []) {
          const p = (parts[tc.index] ??= { id: "", name: "", args: "" });
          if (tc.id) p.id = tc.id;
          if (tc.function?.name) p.name += tc.function.name;
          if (tc.function?.arguments) p.args += tc.function.arguments;
        }
        const u = chunk.usage;
        if (u) {
          trace.usage.prompt += u.prompt_tokens ?? 0;
          trace.usage.cached += u.prompt_tokens_details?.cached_tokens ?? 0;
          trace.usage.completion += u.completion_tokens ?? 0;
          trace.usage.reasoning += u.completion_tokens_details?.reasoning_tokens ?? 0;
        }
      }

      // The model sometimes streams malformed tool arguments; echoing them back makes the
      // API reject the whole conversation (400). Send "{}" instead and tell it to retry.
      const validJson = (s: string) => {
        try {
          JSON.parse(s || "{}");
          return true;
        } catch {
          return false;
        }
      };
      const badArgs = new Set<string>();
      const calls: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall[] = parts
        .filter((p) => p.name)
        .map((p, i) => {
          const id = p.id || `call_${step}_${i}`;
          if (!validJson(p.args)) badArgs.add(id);
          return { id, type: "function", function: { name: p.name, arguments: badArgs.has(id) ? "{}" : p.args } };
        });
      if (!calls.length) {
        // Self-check: asked to change something, no change staged, yet the reply talks as
        // if it did (or will on confirm). Seen in evals at every effort: nudge it once.
        if (!nudged && wantsWrite && !effects.plan.size && CLAIMS_ACTION.test(content) && step < MAX_STEPS - 1) {
          nudged = true;
          messages.push({ role: "assistant", content });
          messages.push({
            role: "user",
            content: "(System check: you haven't called any tool, so nothing was created or changed and there is nothing to confirm. Call the tools now to do what was asked, then reply.)",
          });
          continue;
        }
        reply = content.trim();
        break;
      }
      // Text before the tool calls is Atlas saying what it's about to do: keep it on screen.
      if (content.trim()) progress?.note(content);
      messages.push({ role: "assistant", content: content || null, tool_calls: calls });
      // Parallel tool calls: run all of them, return all results.
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        let result: unknown;
        try {
          if (badArgs.has(call.id)) throw new Error("they weren't valid JSON; call the tool again with valid JSON arguments");
          args = JSON.parse(call.function.arguments || "{}");
          progress?.step(stepLabel(call.function.name, args));
          result = await runTool(call.function.name, args, { role: input.role, where, threadId: input.threadId, effects, store, allowed: agent.tools, agentId: agent.id });
        } catch (e) {
          result = { ok: false, error: `Invalid arguments: ${(e as Error).message}` };
        }
        trace.tools.push({ name: call.function.name, args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      progress?.step("Putting it together");
    }
    if (!reply) reply = summarize(planToOps(effects.plan)) || "I couldn't finish that. Could you rephrase or break it into smaller steps?";
  } catch (e) {
    // All or nothing: a run that fails part-way applies none of its staged changes.
    trace.error = (e as Error).message;
    reply = "Sorry, I couldn't reach my model just now, so nothing was changed. Please try again in a moment.";
  }

  // Only real messages can be cited: verify every [[id]] and drop the rest.
  trace.rawReply = reply;
  const caughtUp = trace.tools.some((t) => t.name === "catch_up");
  reply = await resolveCitations(reply, store, trace.citations, caughtUp ? MAX_CATCH_UP_CITATIONS : MAX_CITATIONS);

  // Apply the run's changes, or hold them for confirmation (deletes, bulk edits).
  const ops = trace.error ? [] : planToOps(effects.plan);
  const hold = needsConfirmation(ops);
  const messageId = input.replyId ?? uid();
  const touched = new Set<ChatId>([where]);
  let action: ActionRecord | null = null;
  if (ops.length) {
    action = {
      id: `act${uid()}`, chatId: where, messageId, status: hold ? "pending" : "applied", ops,
      summary: summarizeOps(ops), destructive: ops.some((o) => o.type === "delete"),
      undoUntil: hold ? null : new Date(Date.now() + UNDO_WINDOW_MS).toISOString(), createdAt: new Date().toISOString(),
    };
    if (!hold) for (const c of await applyOps(store, ops, where)) touched.add(c);
    await store.insertAction(action);
  }
  trace.action = action ? { id: action.id, status: action.status } : null;

  // Reply in the conversation, with a ticket card when an applied run centred on one ticket.
  const single = <T,>(xs: T[]) => (xs.length === 1 ? xs[0] : null);
  const created = ops.flatMap((o) => (o.type === "create" ? [o.after.id] : []));
  const updated = ops.flatMap((o) => (o.type === "update" ? [o.after.id] : []));
  const card = hold ? null : single(created) ?? (created.length ? null : single(updated) ?? single([...new Set(effects.read)]));
  const replyMessage = await store.appendMessage(
    where,
    { id: messageId, who: agent.id, time: stamp(), text: reply, ticket: card, actionId: action?.id ?? null },
    input.threadId,
  );

  trace.reply = reply;
  trace.ms = Date.now() - started;
  console.log(
    `[atlas] ${currentDir().workspace.id}/${where} ${trace.model}/${trace.effort} steps=${trace.steps} tools=${trace.tools.map((t) => t.name).join(",") || "-"} ` +
      `tokens in=${trace.usage.prompt} (cached ${trace.usage.cached}) out=${trace.usage.completion} (reasoning ${trace.usage.reasoning}) ${trace.ms}ms${trace.error ? ` ERROR ${trace.error}` : ""}`,
  );

  return {
    touchedChats: [...touched],
    openTicket: !hold && !input.threadId ? single(created) : null,
    deleted: hold ? [] : ops.flatMap((o) => (o.type === "delete" ? [o.before.id] : [])),
    trace,
    // With its action card, as the chat shows it (for the realtime payload).
    replyMessage: action ? { ...replyMessage, actionId: undefined, action: toView(action) } : replyMessage,
  };
}

const MAX_CITATIONS = 3;
/** A catch-up covers several chats, so it may cite more. */
const MAX_CATCH_UP_CITATIONS = 8;

/**
 * The model cites messages as [[id]]. Keep the ones that exist (up to 3), rewritten
 * as [[cite:<chat>:<thread or ->:<id>]] so the UI can link straight to them; remove
 * the rest, so a made-up citation never reaches the chat.
 */
async function resolveCitations(text: string, store: Store, log: AtlasTrace["citations"], max = MAX_CITATIONS) {
  const ids = [...new Set([...text.matchAll(/\[\[([A-Za-z0-9_-]{1,40})\]\]/g)].map((m) => m[1]))];
  if (!ids.length) return text;
  const all = await store.getMessageRefs(ids);
  // Only messages the requester can open (not someone else's DM).
  const refs = Object.fromEntries(Object.entries(all).filter(([, r]) => !!currentDir().chats[r.chatId]));
  const kept = new Set(ids.filter((id) => refs[id]).slice(0, max));
  for (const id of ids) (kept.has(id) ? log.kept : refs[id] ? log.overLimit : log.invalid).push(id);
  return text
    .replace(/\s*\[\[([A-Za-z0-9_-]{1,40})\]\]/g, (_m, id: string) => {
      if (!kept.has(id)) return "";
      const r = refs[id];
      return ` [[cite:${r.chatId}:${r.threadId ?? "-"}:${id}]]`;
    })
    .replace(/ +([.,;:!?])/g, "$1")
    .trim();
}

function summarize(ops: TicketOp[]) {
  return ops.length ? `${summarizeOps(ops).join("; ")}.` : "";
}
