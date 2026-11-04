import { ApiError } from "@/lib/api/service";
import { currentCtx } from "@/lib/context";
import { agentsOf, personOf, type AgentInfo, type Directory } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import type { Decision, Mission } from "@/lib/missions";
import { digestDue, isStandupAgent, localDay, zonedParts } from "@/lib/scheduled";
import type { ChatId, Message, Ticket } from "@/lib/types";
import { ATLAS_MODEL, llm } from "../llm";
import { pingChanges } from "../realtime";
import { timeZoneFor } from "./reminders";

/**
 * Sunny's daily digest: each workday morning, in every channel the standup agent is in,
 * one post built from real data: what shipped, what's in progress, what's blocked and by
 * what, what's due or overdue (owners @mentioned), who looks overloaded, and what needs a
 * decision. The facts are assembled here, deterministically; one small model call adds a
 * "focus today" line, checked against the same data.
 */

/** Open work above either of these looks like too much for one person. */
const OVERLOAD_POINTS = 13;
const OVERLOAD_TICKETS = 4;

const OPEN = (t: Ticket) => t.status !== "Done" && t.status !== "Backburner";

export interface DigestData {
  channel: string;
  /** "Wed, Nov 4". */
  day: string;
  /** "yesterday", or "since Friday" on Mondays. */
  window: string;
  shipped: { id: string; owner: string }[];
  inProgress: { id: string; owner: string; status: string }[];
  blocked: { id: string; owner: string; by: { id: string; owner: string; status: string }[] }[];
  due: { id: string; owner: string; ownerId: string; due: string; daysLate: number }[];
  overloaded: { who: string; open: number; points: number; ids: string[] }[];
  decisions: { question: string; mission: string }[];
  logged: string[];
  missions: { title: string; deadline: string | null; health: string; done: number; total: number }[];
  /** Messages in the channel in the window. */
  messages: number;
}

const DAY_MS = 86400_000;

/** The standup agents in a channel (Sunny). */
export function standupAgentsIn(dir: Directory, chatId: ChatId): AgentInfo[] {
  const c = dir.chats[chatId];
  if (c?.kind !== "channel") return [];
  return agentsOf(dir).filter((a) => isStandupAgent(a) && c.agents?.some((x) => x.id === a.id));
}

/** Channels with a standup agent, and which one posts there. */
export function digestChannels(dir: Directory): { chatId: ChatId; agent: AgentInfo }[] {
  return dir.channels.flatMap((chatId) => {
    const [agent] = standupAgentsIn(dir, chatId);
    return agent ? [{ chatId, agent }] : [];
  });
}

/**
 * The facts for one channel's digest. Tickets in scope: the channel team's, those of
 * missions run from the channel, and those mentioned in it lately (all tickets for a
 * channel without a team). Workload counts everything a person has open.
 */
export function buildDigestData(input: {
  dir: Directory; chatId: ChatId; tickets: Ticket[]; messages: Message[]; missions: Mission[]; decisions: Decision[];
  logged: { statement: string; createdAt: string }[]; now: Date; tz: string;
}): DigestData {
  const { dir, chatId, tickets, messages, missions, decisions, now, tz } = input;
  const meta = dir.chats[chatId];
  const label = meta?.kind === "channel" ? meta.label : "channel";
  const team = meta?.kind === "channel" ? meta.team : null;
  const first = (id: string) => personOf(dir, id).first;
  const monday = zonedParts(now, tz).weekday === 1;
  const since = now.getTime() - (monday ? 3 : 1) * DAY_MS;
  const recent = messages.flatMap((m) => [m, ...m.replies]).filter((m) => Date.parse(m.time) > since);

  const prefix = dir.workspace.ticketPrefix;
  const mentioned = new Set(messages.slice(-60).flatMap((m) => [m, ...m.replies]).flatMap((m) => m.text.match(new RegExp(`\\b${prefix}-\\d+\\b`, "g")) ?? []));
  const ownMissions = new Set(missions.filter((m) => m.chatId === chatId).map((m) => m.id));
  const scoped = tickets.filter((t) => !team || t.team === team || (t.missionId && ownMissions.has(t.missionId)) || mentioned.has(t.id));
  const byId = new Map(tickets.map((t) => [t.id, t]));

  // Wins are news for everyone: shipped counts the whole workspace, not just the channel's scope.
  const shipped = tickets
    .filter((t) => t.status === "Done" && t.activity.some((a) => /\bDone\b/.test(a.text) && Date.parse(a.time) > since && Date.parse(a.time) <= now.getTime()))
    .map((t) => ({ id: t.id, owner: first(t.assignee) }))
    .slice(0, 8);
  const inProgress = scoped
    .filter((t) => t.status === "In progress" || t.status === "In review")
    .map((t) => ({ id: t.id, owner: first(t.assignee), status: t.status }));
  const blocked = scoped
    .filter(OPEN)
    .map((t) => ({
      id: t.id, owner: first(t.assignee),
      by: (t.blockedBy ?? []).map((b) => byId.get(b)).filter((b): b is Ticket => !!b && b.status !== "Done").map((b) => ({ id: b.id, owner: first(b.assignee), status: b.status })),
    }))
    .filter((t) => t.by.length);
  const today = localDay(now, tz);
  const due = scoped
    .filter((t) => OPEN(t) && t.due && t.due <= today)
    .map((t) => ({ id: t.id, owner: first(t.assignee), ownerId: t.assignee, due: t.due!, daysLate: Math.round((Date.parse(today) - Date.parse(t.due!)) / DAY_MS) }))
    .sort((a, b) => b.daysLate - a.daysLate);

  const load = new Map<string, Ticket[]>();
  for (const t of tickets.filter(OPEN)) {
    if (personOf(dir, t.assignee).isAgent) continue;
    load.set(t.assignee, [...(load.get(t.assignee) ?? []), t]);
  }
  const inScope = new Set(scoped.map((t) => t.assignee));
  const overloaded = [...load.entries()]
    .filter(([who]) => inScope.has(who))
    .map(([who, list]) => ({ who: first(who), open: list.length, points: list.reduce((s, t) => s + (t.estimate ?? 0), 0), ids: list.map((t) => t.id) }))
    .filter((x) => x.points >= OVERLOAD_POINTS || x.open >= OVERLOAD_TICKETS)
    .sort((a, b) => b.points - a.points);

  const live = missions.filter((m) => m.status === "active" || m.status === "at_risk");
  const missionTitle = new Map(missions.map((m) => [m.id, m.title]));
  return {
    channel: label,
    day: now.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }),
    window: monday ? "since Friday" : "yesterday",
    shipped, inProgress, blocked, due, overloaded,
    decisions: decisions.filter((d) => d.status === "open" && ownMissions.has(d.missionId)).map((d) => ({ question: d.question, mission: missionTitle.get(d.missionId) ?? "" })),
    logged: input.logged.filter((d) => Date.parse(d.createdAt) > since).map((d) => d.statement).slice(0, 3),
    missions: live.filter((m) => ownMissions.has(m.id)).map((m) => {
      const ids = m.plan.tasks.map((t) => t.ticketId).filter(Boolean) as string[];
      return { title: m.title, deadline: m.deadline, health: m.health, done: ids.filter((id) => byId.get(id)?.status === "Done").length, total: ids.length };
    }),
    messages: recent.length,
  };
}

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const lateness = (n: number) => (n <= 0 ? "due today" : n === 1 ? "1 day overdue" : `${n} days overdue`);

/** The digest post. Ticket ids render as chips, @First mentions notify owners of late work. */
export function renderDigest(d: DigestData, focus: string | null): string {
  const out: string[] = [`**Daily digest for #${d.channel}** · ${d.day}`];
  const section = (title: string, lines: string[]) => {
    if (lines.length) out.push(`**${title}**\n${lines.map((l) => `- ${l}`).join("\n")}`);
  };
  section(`Shipped ${d.window}`, d.shipped.map((t) => `${t.id} (${t.owner})`));
  section("In progress", d.inProgress.map((t) => `${t.id} ${t.owner}${t.status === "In review" ? ", in review" : ""}`));
  section("Blocked", d.blocked.map((t) => `${t.id} (${t.owner}) waits on ${t.by.map((b) => `${b.id} (${b.owner}, ${b.status.toLowerCase()})`).join(" and ")}`));
  section("Due today or overdue", d.due.map((t) => `${t.id} ${lateness(t.daysLate)}, @${t.owner}`));
  section("Looks overloaded", d.overloaded.map((p) => `${p.who}: ${p.open} open, ${p.points} points (${p.ids.join(", ")})`));
  section("Needs a decision", d.decisions.map((x) => `${x.question}${x.mission ? ` (${x.mission})` : ""}`));
  section("Decided", d.logged);
  if (out.length === 1) out.push("Quiet day: nothing shipped, blocked or due. Enjoy it.");
  if (d.missions.length) out.push(d.missions.map((m) => `Mission "${m.title}": ${m.done} of ${m.total} done${m.deadline ? `, due ${shortDay(m.deadline)}` : ""}. ${m.health}`).join("\n"));
  if (focus) out.push(`**Focus today:** ${focus}`);
  return out.join("\n\n");
}

/** A rule-based focus line, used when the model is off or says something we can't check. */
export function fallbackFocus(d: DigestData): string | null {
  const lateBlocker = d.blocked.flatMap((t) => t.by.map((b) => ({ t, b }))).find(({ b }) => d.due.some((x) => x.id === b.id && x.daysLate > 0));
  if (lateBlocker) return `${lateBlocker.b.id} is overdue and holds up ${lateBlocker.t.id}; unblocking it moves the most work.`;
  if (d.due[0]) return `Close out ${d.due[0].id} (${d.due[0].owner}), it's ${lateness(d.due[0].daysLate)}.`;
  if (d.blocked[0]) return `Unblock ${d.blocked[0].id}: it waits on ${d.blocked[0].by.map((b) => b.id).join(" and ")}.`;
  return null;
}

/** Every ticket id the digest mentions: the focus line may only use these. */
function idsIn(d: DigestData) {
  return new Set([
    ...d.shipped.map((t) => t.id), ...d.inProgress.map((t) => t.id), ...d.due.map((t) => t.id), ...d.overloaded.flatMap((p) => p.ids),
    ...d.blocked.flatMap((t) => [t.id, ...t.by.map((b) => b.id)]),
  ]);
}

/** One sentence on what matters most today, from the model; checked against the data. */
export function checkFocus(text: string, d: DigestData, prefix: string): string | null {
  const line = text.replace(/\s+/g, " ").replace(/^["'\s]*(focus today:?\s*)?/i, "").replace(/["'\s]+$/, "").trim();
  if (!line || line.length > 240 || /[*#`]/.test(line) || line.includes("@")) return null;
  const known = idsIn(d);
  const cited = line.match(new RegExp(`\\b${prefix}-\\d+\\b`, "g")) ?? [];
  return cited.every((id) => known.has(id)) ? line : null;
}

async function modelFocus(d: DigestData, prefix: string): Promise<string | null> {
  const client = llm();
  if (!client) return null;
  try {
    const res = await client.chat.completions.create(
      {
        model: ATLAS_MODEL,
        reasoning_effort: "minimal",
        prompt_cache_key: "meld-digest-focus-v1",
        messages: [
          {
            role: "system",
            content:
              "You write the last line of a team's daily standup digest: one plain sentence (at most 28 words) naming the single most important thing to do today and why, using only ticket ids and first names from the data. No preamble, no markdown, no @mentions, no ticket ids that aren't in the data.",
          },
          { role: "user", content: JSON.stringify(d) },
        ],
      },
      { timeout: 12_000, maxRetries: 0 },
    );
    return checkFocus(res.choices[0]?.message?.content ?? "", d, prefix);
  } catch (e) {
    console.error("[digest] focus line failed:", (e as Error).message);
    return null;
  }
}

/**
 * Post one channel's digest as its standup agent. `force` (Post digest now) skips the
 * once-a-day check but still records the day, so the morning sweep doesn't post twice.
 * Returns null when it wasn't this caller's turn (already posted today).
 */
export async function postDigest(chatId: ChatId, opts: { force?: boolean; now?: Date } = {}): Promise<{ messageId: string; text: string } | null> {
  const { dir, store } = currentCtx();
  const [agent] = standupAgentsIn(dir, chatId);
  if (!agent) throw new ApiError("No standup agent in this channel", 404);
  const now = opts.now ?? new Date();
  const { tz } = await timeZoneFor("*");
  if (!(await store.claimDigest(chatId, localDay(now, tz), opts.force))) return null;

  const [tickets, messages, missions, decisions, logged] = await Promise.all([
    store.listTickets(), store.listMessages(chatId, { limit: 60 }), store.listMissions(), store.listDecisions({ status: "open" }), store.listTeamDecisions(),
  ]);
  const data = buildDigestData({ dir, chatId, tickets, messages, missions, decisions, logged: logged.filter((x) => x.status === "active"), now, tz });
  const focus = (await modelFocus(data, dir.workspace.ticketPrefix)) ?? fallbackFocus(data);
  const text = renderDigest(data, focus);
  const saved = await store.appendMessage(chatId, { id: uid(), who: agent.id, time: stamp(), text });
  await pingChanges({ chats: [chatId], tickets: false, origin: null, workspaceId: dir.workspace.id, message: { chatId, threadId: null, message: saved } });
  return { messageId: saved.id, text };
}

/** Post today's digest in every standup channel that's due (after 9:00 workspace time, workdays). */
export async function deliverDueDigests(now = new Date()): Promise<ChatId[]> {
  const { dir, store } = currentCtx();
  const channels = digestChannels(dir);
  if (!channels.length) return [];
  const [{ tz }, last] = await Promise.all([timeZoneFor("*"), store.lastDigests()]);
  // Channels in parallel (each is one model call); the claim keeps each to one post.
  const posted = await Promise.all(
    channels.filter(({ chatId }) => digestDue(now, tz, last[chatId] ?? null)).map(async ({ chatId }) => {
      try {
        return (await postDigest(chatId, { now })) ? chatId : null;
      } catch (e) {
        console.error(`[digest] ${chatId} failed:`, (e as Error).message);
        return null;
      }
    }),
  );
  return posted.filter((c): c is ChatId => !!c);
}
