import { currentDir } from "../context";
import { ATLAS_ID, personOf, teamName as teamNameIn } from "../directory";
import { canCreateIn, canDelete, canSee, roleLabel, viewerOf } from "../rbac";
import type { ChatId, PersonId, Role, Ticket, TicketStatus } from "../types";

/**
 * Atlas: the in-chat ticket agent.
 *
 * This is a deterministic, rule-based stand-in so the UI can be built and demoed
 * without a model. It is a pure function over the current tickets, so the real
 * implementation (an LLM with tool calls behind the API) can replace it without
 * touching the UI. It always acts with the caller's role.
 */
export interface AtlasInput {
  text: string;
  where: ChatId;
  role: Role;
  tickets: Ticket[];
  nextNum: number;
  now: string;
  uid: () => string;
}

export interface AtlasResult {
  reply: string;
  /** Ticket card to attach to Atlas's reply. */
  ticket: string | null;
  tickets: Ticket[];
  nextNum: number;
  /** Ticket to open in the side panel after replying. */
  open: string | null;
  /** Update to post in the ticket's watching channel. */
  broadcast: { chat: ChatId; thread: string | null; text: string } | null;
}

/** "me", a member's first name, or "atlas" → their id. */
function personFrom(word: string | undefined): PersonId | null {
  const dir = currentDir();
  const w = String(word || "").toLowerCase();
  if (["me", "myself"].includes(w)) return dir.me;
  return dir.personOrder.find((id) => id.toLowerCase() === w || personOf(dir, id).first.toLowerCase() === w) || null;
}

const teamName = (id: string | null | undefined) => teamNameIn(currentDir(), id);
const repo = () => currentDir().workspace.repo ?? "github";

function statusFrom(lower: string): TicketStatus | null {
  if (/review/.test(lower)) return "In review";
  if (/in progress|progress|\bstart/.test(lower)) return "In progress";
  if (/\b(done|complete|completed|close|closed|finish|finished)\b/.test(lower)) return "Done";
  if (/backburner|back burner|\bpark\b|\blater\b/.test(lower)) return "Backburner";
  if (/\b(to ?do|todo|reopen)\b/.test(lower)) return "To do";
  return null;
}

const nameOf = (p: PersonId) => (p === currentDir().me ? "you" : personOf(currentDir(), p).name);

export function runAtlas(input: AtlasInput): AtlasResult {
  const { where, role, now, uid } = input;
  const dir = currentDir();
  const me = dir.me;
  const prefix = dir.workspace.ticketPrefix;
  const meta = dir.chats[where];
  const roleTxt = roleLabel(dir, role);
  const viewer = viewerOf(dir, role);
  const tickets: Ticket[] = structuredClone(input.tickets);
  const clean = input.text.replace(/@\w+/g, "").replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  const ids = (clean.match(new RegExp(`\\b${prefix}-\\d+\\b`, "gi")) || []).map((x) => x.toUpperCase());
  const out: AtlasResult = { reply: "", ticket: null, tickets, open: null, broadcast: null, nextNum: input.nextNum };
  const visible = (t: Ticket) => canSee(viewer, t);

  // ---- create ----
  const wantsCreate =
    /\b(create|make|open|add|file|log|raise|new)\b/.test(lower) && /\b(ticket|issue|task|bug)\b/.test(lower) && !ids.length;
  if (wantsCreate) {
    if (role === "guest") {
      out.reply = "Guests can’t create tickets. Ask an org owner or a team member to file it.";
      return out;
    }
    const am = clean.match(/assign(?:ed)?(?:\s+it)?\s+to\s+(\w+)/i);
    const assignee = (am && personFrom(am[1])) || me;
    const team =
      (meta?.kind === "channel" && meta.team) || personOf(dir, assignee).team || viewer.team || dir.teams[0]?.id || "general";
    if (!canCreateIn(viewer, team)) {
      out.reply = `Your role (${roleTxt}) can only create ${teamName(viewer.team)} tickets, and this would land in ${teamName(team)}. Ask a ${teamName(team)} member or an org owner.`;
      return out;
    }
    const tm = clean.match(/\b(?:ticket|issue|task|bug)\b\s*(?:for|to|about|on|regarding|:)?\s*(.+)$/i);
    let title = tm && tm[1] ? tm[1] : clean;
    title =
      title
        .replace(/\s*(,|\band\b)?\s*assign(ed)?(\s+it)?\s+to\s+\w+.*$/i, "")
        .replace(/[.!?]+$/, "")
        .trim() || "Untitled ticket";
    title = title.charAt(0).toUpperCase() + title.slice(1);
    if (title.length > 80) title = title.slice(0, 77) + "…";
    const links: Ticket["links"] = [];
    const pr = clean.match(/\bPR\s*#?(\d+)/i);
    if (pr) links.push({ id: uid(), kind: "PR", num: pr[1], repo: repo() });
    const id = `${prefix}-${out.nextNum}`;
    out.nextNum += 1;
    const src = meta.kind === "channel" ? `#${meta.label}` : "a DM with Atlas";
    tickets.push({
      id,
      team,
      title,
      status: "To do",
      priority: /\b(urgent|high priority|asap)\b/.test(lower) ? "High" : "Medium",
      assignee,
      reporter: ATLAS_ID,
      updated: "Just now",
      images: [],
      links,
      watch: meta.kind === "channel" ? { chat: where, thread: null } : null,
      description: `Requested by Suvra Das in ${src}:\n“${clean}”`,
      activity: [{ who: "Atlas", text: `created this ticket from ${src}`, time: now }],
    });
    out.reply = `Created ${id} in ${teamName(team)} and assigned it to ${nameOf(assignee)}${links.length ? `, with PR #${links[0].num} linked` : ""}.`;
    out.ticket = id;
    out.open = id;
    return out;
  }

  // ---- read / update / delete a specific ticket ----
  if (ids.length) {
    const id = ids[0];
    const t = tickets.find((x) => x.id === id);
    if (!t) {
      out.reply = `I couldn’t find ${id}. It may have been deleted.`;
      return out;
    }
    if (!visible(t)) {
      out.reply = `Your role (${roleTxt}) doesn’t have access to ${id}, so I can’t show or change it. Ask an org owner or someone on that team.`;
      return out;
    }

    if (/\b(delete|remove)\b/.test(lower)) {
      if (!canDelete(role)) {
        out.reply = `Only org owners can delete tickets. I can move ${id} to Backburner instead if you want.`;
        return out;
      }
      out.tickets = tickets.filter((x) => x.id !== id);
      out.reply = `Deleted ${id} (“${t.title}”). Mentions of it now show as plain text.`;
      return out;
    }

    const changes: string[] = [];
    const wantsUpdate = /\b(move|mark|set|change|update|close|reopen|assign|priority|link|start|park)\b/.test(lower);
    if (wantsUpdate) {
      const st = statusFrom(lower.replace(/assign.*$/, ""));
      if (st && st !== t.status) {
        changes.push(`status ${t.status} → ${st}`);
        t.status = st;
      }
      const am = clean.match(/assign(?:ed)?(?:\s+it)?(?:\s+[A-Z]+-\d+)?\s+to\s+(\w+)/i);
      const who = am && personFrom(am[1]);
      if (who && who !== t.assignee) {
        changes.push(`assignee → ${personOf(dir, who).name}`);
        t.assignee = who;
      }
      const pm = lower.match(/\b(high|medium|low)\b/);
      if (pm && /priority/.test(lower)) {
        const pv = (pm[1].charAt(0).toUpperCase() + pm[1].slice(1)) as Ticket["priority"];
        if (pv !== t.priority) {
          changes.push(`priority → ${pv}`);
          t.priority = pv;
        }
      }
      const pr = clean.match(/\bPR\s*#?(\d+)/i);
      if (pr && !t.links.some((l) => l.kind === "PR" && l.num === pr[1])) {
        changes.push(`linked PR #${pr[1]}`);
        t.links.push({ id: uid(), kind: "PR", num: pr[1], repo: repo() });
      }
      const im = clean.match(/\bissue\s*#?(\d+)/i);
      if (im && !t.links.some((l) => l.kind === "Issue" && l.num === im[1])) {
        changes.push(`linked Issue #${im[1]}`);
        t.links.push({ id: uid(), kind: "Issue", num: im[1], repo: repo() });
      }
    }
    if (changes.length) {
      t.updated = "Just now";
      t.activity.push({ who: "Atlas", text: `${changes.join(", ")} (asked by ${personOf(dir, me).name})`, time: now });
      out.reply = `Updated ${id}: ${changes.join(", ")}.`;
      out.ticket = id;
      if (t.watch && t.watch.chat !== where) {
        out.broadcast = {
          chat: t.watch.chat,
          thread: t.watch.thread,
          text: `Update on ${id}: ${changes.join(", ")} (via Atlas, asked by Suvra Das).`,
        };
        const wm = dir.chats[t.watch.chat];
        out.reply += ` I posted the update in #${wm.kind === "channel" ? wm.label : wm.id}.`;
      }
      return out;
    }
    if (wantsUpdate) {
      out.reply = `I didn’t catch what to change on ${id}. Try “move ${id} to In review”, “assign ${id} to Ravi” or “set priority high”.`;
      out.ticket = id;
      return out;
    }
    out.reply =
      `${id} is ${t.status}, assigned to ${nameOf(t.assignee)}, priority ${t.priority}, team ${teamName(t.team)}. ` +
      (t.links.length ? `Linked: ${t.links.map((l) => `${l.kind} #${l.num}`).join(", ")}.` : "No GitHub links yet.");
    out.ticket = id;
    return out;
  }

  // ---- my work ----
  if (/\b(my|plate|mine|assigned to me|on me)\b/.test(lower) || /what.*(do i have|should i)/.test(lower)) {
    const mine = tickets.filter(
      (t) => visible(t) && t.assignee === me && t.status !== "Done" && t.status !== "Backburner",
    );
    out.reply = mine.length
      ? `You have ${mine.length} open ticket${mine.length === 1 ? "" : "s"}:\n` +
        mine.map((t) => `• ${t.id} (${t.status})`).join("\n")
      : "Nothing open is assigned to you.";
    return out;
  }

  out.reply = `I can create, show, update and delete tickets, with the same access as your role (${roleTxt}). Try:\n• create a ticket for … and assign it to Ravi\n• move ${prefix}-12 to In progress\n• what’s on my plate?\n• delete ${prefix}-12`;
  return out;
}
