import type { TeamDecision } from "@/lib/team-decisions";

/**
 * A free, instant check before the listener spends a model call: could this message
 * possibly settle a decision, go against one, report progress or commit to work?
 * Tuned for recall (when unsure, let the model look): it only skips messages with
 * none of the cues below, like "sounds good", "lunch?", "hi", "great work team".
 * Measured in evals/listener-prefilter.ts.
 */
const CUES =
  /\b(i'?ll|i will|i'?m going to|i am going to|we'?ll|will (?:do|have|finish|ship|land|send|write|build|be)|by (?:mon|tue|wed|thu|fri|sat|sun|tomorrow|tonight|today|eod|eow|end|next|the)|(?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|next week|done|finish(?:ed)?|ship(?:ped)?|merged|deployed|landed|live|fixed|review|ready|start(?:ed|ing)?|working on|block(?:ed|er|s)?|stuck|waiting on|can'?t|pushing|pushed|delay(?:ed)?|slip(?:ped)?|mov(?:e|ed|ing)|agreed?|decision|decided|decide|let'?s|go(?:ing)? with|instead|rather than|vote|option|keep|drop|cut|postpone|deadline|due|lock(?:ed)? in|final(?:ize|ized)?|approved?|sign(?:ed)? off|half done|remaining|left to do|feedback|mocks?|draft(?:ed)?|posted|shared|uploaded|pr|pull request|figma|staging|prod(?:uction)?)\b/i;

const STOP = new Set("about after again also because before being could does doing from have here into just like make more most much need only other over same should some still such than that their them then there these they this those very want what when where which while will with would your yours ours".split(" "));
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)?.filter((w) => !STOP.has(w)) ?? []);

export function mayMatter(text: string, decisions: Pick<TeamDecision, "topic" | "statement" | "rejected" | "status">[], ticketPrefix: string): boolean {
  if (CUES.test(text)) return true;
  // A ticket by id ("ORB-12", "orb 12").
  if (new RegExp(`\\b${ticketPrefix}[- ]?\\d+\\b`, "i").test(text)) return true;
  // Talks about the same thing as a decision in effect (2+ shared words): might contradict it.
  const mine = words(text);
  if (!mine.size) return false;
  for (const d of decisions) {
    if (d.status !== "active") continue;
    const theirs = words(`${d.topic} ${d.statement} ${d.rejected.join(" ")}`);
    let shared = 0;
    for (const w of mine) if (theirs.has(w) && ++shared >= 2) return true;
  }
  return false;
}
