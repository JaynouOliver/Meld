import { agentById, agentsOf, ATLAS_ID, personOf, type Directory } from "../directory";
import type { PersonId, Ticket, TicketComment } from "../types";

/**
 * @mentions in ticket comments (src/server/agents/comment-mentions.ts acts on them):
 * people are told in their Atlas DM, agents get a run on the ticket. Names resolve like
 * the rest of the app: an agent by handle ("@agent" is Atlas), a person by full name
 * ("@Jonas Weber") or first name ("@jonas") when only one person has it. Unknown names,
 * emails and the comment's author are ignored, and each target counts once.
 */
export interface CommentMentions {
  people: PersonId[];
  agents: PersonId[];
}

// "@" not inside a word or email, a name, and maybe a second word (a last name).
const MENTION = /(^|[^\w@.])@([A-Za-z][\w-]*)(?:[ \t]+([A-Za-z][\w-]*))?/g;

export function parseCommentMentions(dir: Pick<Directory, "people" | "agents">, text: string, author: PersonId): CommentMentions {
  const people = Object.values(dir.people).filter((p) => !p.isAgent && !agentById(dir, p.id));
  const out: CommentMentions = { people: [], agents: [] };
  const add = (list: PersonId[], id: PersonId) => {
    if (id !== author && !list.includes(id)) list.push(id);
  };
  for (const m of String(text ?? "").matchAll(MENTION)) {
    const word = m[2].replace(/-+$/, "").toLowerCase();
    const next = m[3]?.toLowerCase();
    const full = next ? people.find((p) => p.name.toLowerCase() === `${word} ${next}`) : undefined;
    if (full) {
      add(out.people, full.id);
      continue;
    }
    const agent = word === "agent" ? ATLAS_ID : agentsOf(dir).find((a) => a.handle.toLowerCase() === word)?.id;
    if (agent) {
      add(out.agents, agent);
      continue;
    }
    const byFirst = people.filter((p) => p.first.toLowerCase() === word);
    if (byFirst.length === 1) add(out.people, byFirst[0].id);
  }
  return out;
}

/** Comments in `after` that weren't in `before` (by id), oldest first. */
export function newComments(before: Pick<Ticket, "comments"> | null, after: Pick<Ticket, "comments">): TicketComment[] {
  const had = new Set((before?.comments ?? []).map((c) => c.id));
  return (after.comments ?? []).filter((c) => !had.has(c.id));
}

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** The Atlas DM notice: "Alex Rivera mentioned you on ORB-4: “@Jonas can you check…”". The id renders as a ticket chip. */
export function mentionNotice(dir: Pick<Directory, "people">, author: PersonId, t: Pick<Ticket, "id">, text: string) {
  return `${personOf(dir, author).name} mentioned you on ${t.id}: “${clip(text, 280)}”`;
}
