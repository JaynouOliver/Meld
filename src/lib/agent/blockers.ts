import { ATLAS_ID, personOf, type Directory } from "../directory";
import type { ChatId, PersonId, Ticket } from "../types";

/**
 * Blocker propagation. Tickets list what blocks them (ticket.blockedBy). When that
 * changes, or a blocker is finished, reopened, parked or deleted, the owner of each
 * affected ticket hears about it from Atlas, once per change. Notices are computed from
 * the ticket's state before and after the change, so repeating a no-op never re-notifies.
 */
export interface BlockerNotice {
  to: PersonId;
  /** The ticket the notice is about (the one that's blocked). */
  ticketId: string;
  text: string;
  /** Where to say it if the recipient can't get a DM (demo / preview): the ticket's channel. */
  fallbackChat: { chat: ChatId; thread: string | null } | null;
}

export const blockersOf = (t: Pick<Ticket, "blockedBy">) => t.blockedBy ?? [];
const isOpen = (t: Ticket | undefined) => !!t && t.status !== "Done";

/** Open tickets still blocking `t`. */
export function openBlockers(t: Ticket, all: Ticket[]) {
  return blockersOf(t).map((id) => all.find((x) => x.id === id)).filter((b): b is Ticket => isOpen(b));
}

/** Would "b blocks t" create a loop (t already blocks b, directly or through others)? */
export function createsCycle(t: string, b: string, all: Ticket[]) {
  const seen = new Set<string>();
  const stack = [b];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === t) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...blockersOf(all.find((x) => x.id === id) ?? {}));
  }
  return false;
}

/**
 * What to tell whom after one ticket changed. `all` is every ticket after the change;
 * `actor` made it and isn't told about their own change.
 */
export function blockerNotices(
  dir: Pick<Directory, "people">,
  before: Ticket | null,
  after: Ticket | null,
  all: Ticket[],
  actor: PersonId,
): BlockerNotice[] {
  const out: BlockerNotice[] = [];
  const name = (id: PersonId) => personOf(dir, id).name;
  // Ticket ids render as chips with the title in chat, so the id alone reads well.
  const label = (t: Ticket) => t.id;
  const add = (to: PersonId, about: Ticket, text: string) => {
    if (to === actor || to === ATLAS_ID || !dir.people[to]) return;
    if (out.some((n) => n.to === to && n.text === text)) return;
    out.push({ to, ticketId: about.id, text, fallbackChat: about.watch });
  };
  const stillBlocked = (d: Ticket, except: string) => {
    const rest = openBlockers(d, all).filter((b) => b.id !== except);
    return rest.length ? ` It's still blocked by ${rest.map((b) => b.id).join(", ")}.` : " Nothing else is blocking it.";
  };

  // New dependencies on this ticket: tell its owner, and the blocker's owner.
  if (after) {
    const was = new Set(before ? blockersOf(before) : []);
    for (const id of blockersOf(after).filter((x) => !was.has(x))) {
      const b = all.find((x) => x.id === id);
      if (!b) continue;
      add(after.assignee, after, `Heads up: ${label(after)} is now blocked by ${label(b)} (${b.status}, ${name(b.assignee)}).`);
      if (isOpen(b)) add(b.assignee, after, `${label(b)} is now blocking ${label(after)} (${name(after.assignee)}).`);
    }
    // Dependencies removed by someone else.
    const now = new Set(blockersOf(after));
    for (const id of [...was].filter((x) => !now.has(x))) {
      add(after.assignee, after, `${label(after)} is no longer blocked by ${id}.${stillBlocked(after, id)}`);
    }
  }

  // This ticket blocks others: its progress matters to their owners.
  const self = after ?? before!;
  const dependents = all.filter((d) => d.id !== self.id && blockersOf(d).includes(self.id) && d.status !== "Done");
  if (!dependents.length || !before) return out;
  for (const d of dependents) {
    if (!after) add(d.assignee, d, `${label(before)} was deleted. It was blocking ${label(d)}.${stillBlocked(d, before.id)}`);
    else if (after.status === "Done" && before.status !== "Done")
      add(d.assignee, d, `${label(after)} is done, so ${label(d)} is no longer waiting on it.${stillBlocked(d, after.id)}`);
    else if (before.status === "Done" && after.status !== "Done")
      add(d.assignee, d, `${label(after)} was reopened, so ${label(d)} is blocked by it again.`);
    else if (after.status === "Backburner" && before.status !== "Backburner")
      add(d.assignee, d, `${label(after)}, which ${label(d)} is waiting on, was moved to Backburner.`);
    else if (after.assignee !== before.assignee)
      add(d.assignee, d, `${label(after)}, which ${label(d)} is waiting on, is now with ${name(after.assignee)}.`);
  }
  return out;
}
