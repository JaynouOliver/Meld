import "server-only";

import type OpenAI from "openai";

import { CHAT_META, PEOPLE } from "@/lib/constants";
import { clock, uid } from "@/lib/format";
import { appendMessage, db } from "@/lib/mock/db";
import type { AskAtlasInput, AskAtlasResult } from "@/lib/api/local";
import type { ChatId } from "@/lib/types";
import { ATLAS_EFFORT, ATLAS_MODEL, llm } from "../llm";
import { buildContext, SYSTEM_PROMPT } from "./prompt";
import { runTool, TOOLS, type Effects } from "./tools";

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
  const effects: Effects = { created: [], updated: new Map(), deleted: [], read: [] };
  const trace: AtlasTrace = {
    model: ATLAS_MODEL, effort: String(ATLAS_EFFORT), steps: 0, tools: [],
    usage: { prompt: 0, cached: 0, completion: 0, reasoning: 0 }, ms: 0, reply: "",
  };

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${buildContext({ where, role: input.role, tickets: db.tickets, chat: db.chats[where], threadId: input.threadId })}

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
          result = runTool(call.function.name, args, { role: input.role, where, effects });
        } catch (e) {
          result = { ok: false, error: `Invalid arguments: ${(e as Error).message}` };
        }
        trace.tools.push({ name: call.function.name, args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    if (!reply) reply = summarize(effects) || "I couldn't finish that. Could you rephrase or break it into smaller steps?";
  } catch (e) {
    trace.error = (e as Error).message;
    const did = summarize(effects);
    reply = `Sorry, I couldn't reach my model just now. ${did ? `Before that I ${did}` : "Please try again in a moment."}`;
  }

  // Reply in the conversation, with a ticket card when the run centred on one ticket.
  const single = <T,>(xs: T[]) => (xs.length === 1 ? xs[0] : null);
  const card =
    single(effects.created) ?? (effects.created.length ? null : single([...effects.updated.keys()]) ?? single([...new Set(effects.read)]));
  appendMessage(where, { id: uid(), who: "atlas", time: clock(), text: reply, ticket: card }, input.threadId, input.parentId);

  // Tell the channels that follow changed tickets, when that's not where we are.
  const touched = new Set<ChatId>([where]);
  for (const [id, changes] of effects.updated) {
    const t = db.tickets.find((x) => x.id === id);
    if (!t?.watch || t.watch.chat === where) continue;
    appendMessage(t.watch.chat, {
      id: uid(), who: "atlas", time: clock(),
      text: `Update on ${id}: ${changes.join(", ")} (via Atlas, asked by ${PEOPLE.me.name}).`,
    }, t.watch.thread);
    touched.add(t.watch.chat);
  }

  trace.reply = reply;
  trace.ms = Date.now() - started;
  console.log(
    `[atlas] ${CHAT_META[where].id} ${trace.model}/${trace.effort} steps=${trace.steps} tools=${trace.tools.map((t) => t.name).join(",") || "-"} ` +
      `tokens in=${trace.usage.prompt} (cached ${trace.usage.cached}) out=${trace.usage.completion} (reasoning ${trace.usage.reasoning}) ${trace.ms}ms${trace.error ? ` ERROR ${trace.error}` : ""}`,
  );

  return {
    touchedChats: [...touched],
    openTicket: !input.threadId ? single(effects.created) : null,
    deleted: effects.deleted,
    trace,
  };
}

function summarize(e: Effects) {
  const parts: string[] = [];
  if (e.created.length) parts.push(`created ${e.created.join(", ")}`);
  if (e.updated.size) parts.push(`updated ${[...e.updated.keys()].join(", ")}`);
  if (e.deleted.length) parts.push(`deleted ${e.deleted.join(", ")}`);
  return parts.length ? `${parts.join("; ")}.` : "";
}
