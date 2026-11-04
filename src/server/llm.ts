import "server-only";

import OpenAI from "openai";

/**
 * Meta Model API client. It's OpenAI-compatible (Chat Completions), so we use the
 * OpenAI SDK with Meta's base URL. Server-only: the key must never reach the browser.
 */
export const MODEL_API_BASE = process.env.MODEL_API_BASE ?? "https://api.meta.ai/v1";

let client: OpenAI | null = null;
export function llm(): OpenAI | null {
  if (!process.env.MODEL_API_KEY) return null;
  // Latency on the API varies a lot (the same call took 4s and 42s in testing):
  // give up on a slow attempt and retry rather than leave the chat waiting.
  client ??= new OpenAI({ baseURL: MODEL_API_BASE, apiKey: process.env.MODEL_API_KEY, timeout: 15_000, maxRetries: 2 });
  return client;
}

/** Atlas defaults: Muse Spark 1.3 at low effort keeps chat replies fast; override per deploy. */
export const ATLAS_MODEL = process.env.ATLAS_MODEL ?? "muse-spark-1.3";
/**
 * Fast model for the per-message checks (listener, proactive triage): same accuracy as
 * 1.3 on those evals (evals/listener-eval.ts: 28/28 both) at ~2.3x the speed. Not for
 * Atlas itself: it failed a permissions case there (evals/atlas.eval.ts).
 */
export const FAST_MODEL = process.env.FAST_MODEL ?? "muse-spark-1.2";
export const ATLAS_EFFORT = (process.env.ATLAS_REASONING_EFFORT ?? "low") as OpenAI.ReasoningEffort;
