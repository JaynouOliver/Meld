import type { ChatId, PersonId, Priority, Ticket, TicketStatus } from "./types";

/**
 * Workflow automation (src/server/automation): auto-triage of new tickets and agent
 * playbooks. Shared by the server, the stores and the browser, so no server imports here.
 */

// ---------------------------------------------------------------- auto-triage

/** One triage per ticket, ever: claimed when it starts, so it can't run twice. */
export interface TicketTriage {
  ticketId: string;
  /** The agent that triaged it (Tess, or Atlas when there's no triage agent). */
  agentId: PersonId;
  /** The undoable action holding the changes (null when nothing changed). */
  actionId: string | null;
  status: "running" | "applied" | "skipped" | "undone" | "failed";
  /** "labels billing, bug · priority High · owner Jonas (owns webhooks)". */
  summary: string;
  /** One line on why, shown under the note. */
  reason: string;
  /** The person whose ticket it is (they can undo it). */
  by: PersonId;
  createdAt: string;
}

export type TriageField = "labels" | "priority" | "assignee" | "due";

/**
 * Fields the person already chose: triage only fills blanks and defaults. A value other
 * than the create default counts, and so does a person's own edit in the activity
 * (setting priority back to Medium is still a choice).
 */
export function explicitFields(t: Ticket, creator: PersonId, people: Record<PersonId, { name: string; isAgent?: boolean }>): Set<TriageField> {
  const out = new Set<TriageField>();
  const byPerson = (re: RegExp) => t.activity.some((a) => re.test(a.text) && Object.values(people).some((p) => !p.isAgent && p.name === a.who));
  if ((t.labels ?? []).length || byPerson(/^(added|removed) label/)) out.add("labels");
  if (t.priority !== "Medium" || byPerson(/^set priority to/)) out.add("priority");
  if (t.assignee !== creator || byPerson(/^assigned it to/)) out.add("assignee");
  if (t.due || byPerson(/^(set|cleared) the due date/)) out.add("due");
  return out;
}

export interface TriageProposal {
  labels?: string[];
  priority?: Priority;
  owner?: PersonId;
  ownerWhy?: string;
  due?: string;
  reason: string;
}

const PRIORITIES: Priority[] = ["Low", "Medium", "High"];
/** A due date is "obvious" only when the text names a time. */
const DATE_CUE = /\b(today|tonight|tomorrow|eod|eow|end of (the )?(day|week|month)|by (mon|tue|wed|thu|fri|sat|sun|next|the|\d)|before|deadline|due|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|release|launch day|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\d{1,2}\/\d{1,2}/i;
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/**
 * Check the model's answer against real data: labels the workspace already uses, a real
 * priority, an owner from the candidates, a near-future date only when the text has one.
 * Explicit fields and no-op values are dropped.
 */
export function validateTriage(
  raw: unknown,
  x: { labels: string[]; candidates: PersonId[]; explicit: Set<TriageField>; ticket: Ticket; today: string },
): TriageProposal {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: TriageProposal = { reason: clip(o.reason, 160) };
  const known = new Map(x.labels.map((l) => [l.toLowerCase(), l]));
  if (!x.explicit.has("labels") && Array.isArray(o.labels)) {
    const labels = [...new Set(o.labels.map((l) => known.get(String(l).toLowerCase().trim())).filter((l): l is string => !!l))].slice(0, 3);
    if (labels.length) out.labels = labels;
  }
  if (!x.explicit.has("priority") && PRIORITIES.includes(o.priority as Priority) && o.priority !== x.ticket.priority) out.priority = o.priority as Priority;
  if (!x.explicit.has("assignee") && typeof o.owner === "string" && x.candidates.includes(o.owner) && o.owner !== x.ticket.assignee) {
    out.owner = o.owner;
    out.ownerWhy = clip(o.ownerWhy, 48) || undefined;
  }
  const text = `${x.ticket.title} ${x.ticket.description}`;
  if (!x.explicit.has("due") && typeof o.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.due) && DATE_CUE.test(text)) {
    const days = (Date.parse(`${o.due}T12:00:00Z`) - Date.parse(`${x.today}T12:00:00Z`)) / 86400_000;
    if (Number.isFinite(days) && days >= 0 && days <= 90) out.due = o.due;
  }
  return out;
}

/** "labels billing, bug · priority High · owner Jonas (owns webhooks) · due 2026-11-12" */
export function triageSummary(p: TriageProposal, nameOf: (id: PersonId) => string): string {
  return [
    p.labels?.length ? `labels ${p.labels.join(", ")}` : null,
    p.priority ? `priority ${p.priority}` : null,
    p.owner ? `owner ${nameOf(p.owner)}${p.ownerWhy ? ` (${p.ownerWhy})` : ""}` : null,
    p.due ? `due ${p.due}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------- playbooks

export type PlaybookTrigger =
  | { kind: "label"; label: string }
  | { kind: "status"; status: TicketStatus }
  /** A person's message in this channel containing the keyword or phrase (whole words, any case). */
  | { kind: "keyword"; chatId: ChatId; keyword: string };

export interface PlaybookStep {
  agentId: PersonId;
  instruction: string;
}

export interface Playbook {
  id: string;
  name: string;
  trigger: PlaybookTrigger;
  steps: PlaybookStep[];
  enabled: boolean;
  /** Where steps post when the ticket has no watch thread. */
  chatId: ChatId | null;
  createdBy: PersonId;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookRun {
  /** Derived from the playbook, ticket and event, so the same event can't start it twice. */
  id: string;
  playbookId: string;
  playbookName: string;
  /** The ticket it ran on; "" for a run started by a message (see messageId). */
  ticketId: string;
  chatId: ChatId;
  threadId: string | null;
  /** Index of the step running now; equals total when finished. */
  step: number;
  total: number;
  status: "running" | "done" | "failed";
  error: string | null;
  /** Agent run ids, one per started step. */
  runIds: string[];
  requester: PersonId;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  /** Keyword runs: the message that started it (its thread holds the steps), and what it said. */
  messageId?: string | null;
  messageText?: string | null;
  messageAuthor?: PersonId | null;
}

export const MAX_PLAYBOOK_STEPS = 5;
export const MAX_PLAYBOOKS = 20;

export const triggerLabel = (t: PlaybookTrigger) =>
  t.kind === "label" ? `Ticket labeled ${t.label}` : t.kind === "status" ? `Ticket moved to ${t.status}` : `Message containing "${t.keyword}"`;

/** Step header, posted by the step's agent before it works: "Playbook: Bug intake · step 2 of 3". */
export const stepHeader = (name: string, i: number, total: number) => `Playbook: ${name} · step ${i + 1} of ${total}`;

/**
 * Which enabled playbooks a ticket change starts, each with its idempotency key.
 * - label X: the ticket has a title and X, and just got one of them (created, labeled,
 *   or titled). Keyed per ticket, so it runs once per ticket however the label arrived
 *   (typed in the create form, or added by auto-triage).
 * - status Y: the ticket just moved to Y. Keyed by the ticket's history length, so the
 *   same save can't start it twice, but a later move back to Y can.
 */
export function matchPlaybooks(pbs: Playbook[], before: Ticket | null, after: Ticket): { pb: Playbook; key: string }[] {
  const out: { pb: Playbook; key: string }[] = [];
  for (const pb of pbs) {
    if (!pb.enabled || !pb.steps.length) continue;
    const tr = pb.trigger;
    if (tr.kind === "label") {
      const has = (t: Ticket | null) => !!t && !!t.title.trim() && (t.labels ?? []).includes(tr.label);
      if (has(after) && !has(before)) out.push({ pb, key: `${pb.id}|${after.id}|label` });
    } else if (tr.kind === "status" && before && before.status !== after.status && after.status === tr.status) {
      out.push({ pb, key: `${pb.id}|${after.id}|status|${after.activity.length}` });
    }
  }
  return out;
}

/**
 * A keyword or phrase as a case-insensitive whole-word match: "outage" matches "Outage!"
 * and "an outage:" but not "outages"; "login failing" allows any spacing between words.
 */
export function keywordRegex(keyword: string): RegExp | null {
  const words = keyword.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}_])${words.join("\\s+")}(?![\\p{L}\\p{N}_])`, "iu");
}

export interface PlaybookMessage {
  chatId: ChatId;
  /** The thread it was posted in, if it's a reply. */
  threadId: string | null;
  messageId: string;
  authorId: PersonId;
  text: string;
}

/**
 * Which enabled keyword playbooks a message starts, each with its key (one run per
 * message and playbook). Only messages from people count, so agents can't start them.
 */
export function matchMessagePlaybooks(pbs: Playbook[], m: PlaybookMessage, authorIsAgent: boolean): { pb: Playbook; key: string }[] {
  if (authorIsAgent || !m.text.trim()) return [];
  const out: { pb: Playbook; key: string }[] = [];
  for (const pb of pbs) {
    const tr = pb.trigger;
    if (!pb.enabled || !pb.steps.length || tr.kind !== "keyword" || tr.chatId !== m.chatId) continue;
    if (keywordRegex(tr.keyword)?.test(m.text)) out.push({ pb, key: `${pb.id}|msg|${m.messageId}` });
  }
  return out;
}

/** Small stable hash for ids derived from keys. */
export function shortHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export const playbookRunId = (key: string) => `pr${shortHash(key)}${shortHash(`${key}#`)}`;
/** Agent run ids for playbook steps start with "pb": changes made inside them never start a playbook. */
export const stepRunId = (runId: string, i: number) => `pb${runId.slice(2)}s${i}`;
export function runIdOfStep(stepId: string) {
  const m = /^pb(.+)s(\d+)$/.exec(stepId);
  return m ? { runId: `pr${m[1]}`, step: Number(m[2]) } : null;
}
export const isPlaybookStep = (agentRunId: string | null | undefined) => !!agentRunId && /^pb.+s\d+$/.test(agentRunId);

/** Clean a playbook from the form; returns an error message instead when it's invalid. */
export function cleanPlaybook(
  input: { name?: unknown; trigger?: unknown; steps?: unknown; enabled?: unknown; chatId?: unknown },
  x: { agents: PersonId[]; statuses: readonly TicketStatus[]; chats: ChatId[] },
): { ok: Pick<Playbook, "name" | "trigger" | "steps" | "enabled" | "chatId"> } | { error: string } {
  const name = clip(input.name, 60);
  if (!name) return { error: "Give the playbook a name" };
  const tr = (input.trigger ?? {}) as Record<string, unknown>;
  let trigger: PlaybookTrigger;
  if (tr.kind === "label") {
    const label = clip(tr.label, 30).toLowerCase();
    if (!/^[a-z0-9][a-z0-9 _-]*$/.test(label)) return { error: "Pick a label for the trigger" };
    trigger = { kind: "label", label };
  } else if (tr.kind === "status" && x.statuses.includes(tr.status as TicketStatus)) {
    trigger = { kind: "status", status: tr.status as TicketStatus };
  } else if (tr.kind === "keyword") {
    if (typeof tr.chatId !== "string" || !x.chats.includes(tr.chatId)) return { error: "Pick the channel to listen in" };
    const keyword = clip(tr.keyword, 60);
    if (!keyword || !/[\p{L}\p{N}]/u.test(keyword)) return { error: "Write the keyword or phrase to listen for" };
    trigger = { kind: "keyword", chatId: tr.chatId, keyword };
  } else return { error: "Pick a trigger" };
  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  if (!rawSteps.length) return { error: "Add at least one step" };
  if (rawSteps.length > MAX_PLAYBOOK_STEPS) return { error: `A playbook can have at most ${MAX_PLAYBOOK_STEPS} steps` };
  const steps: PlaybookStep[] = [];
  for (const [i, s] of rawSteps.entries()) {
    const o = (s ?? {}) as Record<string, unknown>;
    if (typeof o.agentId !== "string" || !x.agents.includes(o.agentId)) return { error: `Step ${i + 1}: pick an agent` };
    const instruction = clip(o.instruction, 300);
    if (!instruction) return { error: `Step ${i + 1}: write what the agent should do` };
    steps.push({ agentId: o.agentId, instruction });
  }
  // Keyword runs work in the message's own thread, so they "post in" its channel.
  const chatId = trigger.kind === "keyword" ? trigger.chatId : typeof input.chatId === "string" && x.chats.includes(input.chatId) ? input.chatId : null;
  return { ok: { name, trigger, steps, enabled: input.enabled !== false, chatId } };
}

/** What the ticket panel shows: the triage note and this ticket's playbook runs. */
export interface TicketAutomationView {
  triage: (TicketTriage & { undoable: boolean }) | null;
  runs: PlaybookRun[];
}

/** A playbook with its latest runs (the Playbooks page). */
export interface PlaybookView extends Playbook {
  runs: PlaybookRun[];
}

/** The create / edit form. */
export interface PlaybookInput {
  id?: string;
  name: string;
  trigger: PlaybookTrigger;
  steps: PlaybookStep[];
  enabled?: boolean;
  chatId?: ChatId | null;
}
