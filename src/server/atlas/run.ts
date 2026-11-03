import "server-only";

import type OpenAI from "openai";

import { CHAT_META, PEOPLE } from "@/lib/constants";
import { stamp, uid } from "@/lib/format";
import { applyOps, needsConfirmation, summarize as summarizeOps, UNDO_WINDOW_MS, type ActionRecord, type TicketOp } from "@/lib/agent/actions";
import { getStore, type Store } from "@/lib/store";
import type { AskAtlasInput, AskAtlasResult } from "@/lib/api/service";
import type { ChatId } from "@/lib/types";
import { ATLAS_EFFORT, ATLAS_MODEL, llm } from "../llm";
import { buildContext, SYSTEM_PROMPT } from "./prompt";
import { planToOps, runTool, TOOLS, type Effects } from "./tools";

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
export async function runAtlasAgent(input: AskAtlasInput): Promise<AskAtlasResult & { trace: AtlasTrace }> {
  const client = llm();
  if (!client) throw new Error("MODEL_API_KEY is not set");
  const started = Date.now();
  const where = input.chatId;
  const store = await getStore();
  const effects: Effects = { plan: new Map(), read: [] };
  const trace: AtlasTrace = {
    model: ATLAS_MODEL, effort: String(ATLAS_EFFORT), steps: 0, tools: [],
    usage: { prompt: 0, cached: 0, completion: 0, reasoning: 0 }, ms: 0, reply: "",
    citations: { kept: [], invalid: [], overLimit: [] },
  };

  const [tickets, chat] = await Promise.all([store.listTickets(), store.listMessages(where)]);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${buildContext({ where, role: input.role, tickets, chat, threadId: input.threadId })}

Request from ${PEOPLE.me.name}: ${input.text}`,
    },
  ];

  let reply = "";
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      trace.steps = step + 1;
      const res = await client.chat.completions.create({
        model: ATLAS_MODEL,
        reasoning_effort: ATLAS_EFFORT,
        messages,
        tools: TOOLS,
        // Same prefix (system prompt + tools) for every Atlas call: route to a warm cache.
        prompt_cache_key: "meld-atlas-v1",
      });
      const u = res.usage;
      trace.usage.prompt += u?.prompt_tokens ?? 0;
      trace.usage.cached += u?.prompt_tokens_details?.cached_tokens ?? 0;
      trace.usage.completion += u?.completion_tokens ?? 0;
      trace.usage.reasoning += u?.completion_tokens_details?.reasoning_tokens ?? 0;

      const msg = res.choices[0]?.message;
      if (!msg) throw new Error("Empty response from the model");
      const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
      if (!calls.length) {
        reply = (msg.content ?? "").trim();
        break;
      }
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
      // Parallel tool calls: run all of them, return all results.
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        let result: unknown;
        try {
          args = JSON.parse(call.function.arguments || "{}");
          result = await runTool(call.function.name, args, { role: input.role, where, threadId: input.threadId, effects, store });
        } catch (e) {
          result = { ok: false, error: `Invalid arguments: ${(e as Error).message}` };
        }
        trace.tools.push({ name: call.function.name, args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    if (!reply) reply = summarize(planToOps(effects.plan)) || "I couldn't finish that. Could you rephrase or break it into smaller steps?";
  } catch (e) {
    // All or nothing: a run that fails part-way applies none of its staged changes.
    trace.error = (e as Error).message;
    reply = "Sorry, I couldn't reach my model just now, so nothing was changed. Please try again in a moment.";
  }

  // Only real messages can be cited: verify every [[id]] and drop the rest.
  trace.rawReply = reply;
  reply = await resolveCitations(reply, store, trace.citations);

  // Apply the run's changes, or hold them for confirmation (deletes, bulk edits).
  const ops = trace.error ? [] : planToOps(effects.plan);
  const hold = needsConfirmation(ops);
  const messageId = uid();
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
  await store.appendMessage(where, { id: messageId, who: "atlas", time: stamp(), text: reply, ticket: card, actionId: action?.id ?? null }, input.threadId, input.parentId);

  trace.reply = reply;
  trace.ms = Date.now() - started;
  console.log(
    `[atlas] ${CHAT_META[where].id} ${trace.model}/${trace.effort} steps=${trace.steps} tools=${trace.tools.map((t) => t.name).join(",") || "-"} ` +
      `tokens in=${trace.usage.prompt} (cached ${trace.usage.cached}) out=${trace.usage.completion} (reasoning ${trace.usage.reasoning}) ${trace.ms}ms${trace.error ? ` ERROR ${trace.error}` : ""}`,
  );

  return {
    touchedChats: [...touched],
    openTicket: !hold && !input.threadId ? single(created) : null,
    deleted: hold ? [] : ops.flatMap((o) => (o.type === "delete" ? [o.before.id] : [])),
    trace,
  };
}

const MAX_CITATIONS = 3;

/**
 * The model cites messages as [[id]]. Keep the ones that exist (up to 3), rewritten
 * as [[cite:<chat>:<thread or ->:<id>]] so the UI can link straight to them; remove
 * the rest, so a made-up citation never reaches the chat.
 */
async function resolveCitations(text: string, store: Store, log: AtlasTrace["citations"]) {
  const ids = [...new Set([...text.matchAll(/\[\[([A-Za-z0-9_-]{1,40})\]\]/g)].map((m) => m[1]))];
  if (!ids.length) return text;
  const refs = await store.getMessageRefs(ids);
  const kept = new Set(ids.filter((id) => refs[id]).slice(0, MAX_CITATIONS));
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
