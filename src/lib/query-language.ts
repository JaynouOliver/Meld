import { ATLAS_ID, personOf, teamName, type Directory } from "./directory";
import type { Ticket } from "./types";

type QueryDir = Pick<Directory, "people" | "teams" | "me">;

/**
 * Ticket filter language used in the tickets view.
 *   status:review  assignee:ravi  team:payments  priority:high
 *   is:draft | is:linked | is:agent    -status:done (negation)    free text
 * All tokens must match (AND). Names resolve through the workspace directory.
 */
export function matchQuery(t: Ticket, q: string, dir: QueryDir) {
  const norm = (x: unknown) => String(x ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  const toks = String(q || "").trim().split(/\s+/).filter(Boolean);
  return toks.every((tok) => {
    const neg = tok.startsWith("-");
    const body = neg ? tok.slice(1) : tok;
    const m = body.match(/^(status|assignee|team|priority|is):(.*)$/i);
    let hit: boolean;
    if (m) {
      const k = m[1].toLowerCase();
      const v = norm(m[2]);
      if (!v) return true;
      if (k === "status") hit = norm(t.status).includes(v);
      else if (k === "assignee") hit = norm(personOf(dir, t.assignee).name).includes(v) || (v === "me" && t.assignee === dir.me);
      else if (k === "team") hit = norm(t.team).includes(v) || norm(teamName(dir, t.team)).includes(v);
      else if (k === "priority") hit = norm(t.priority).includes(v);
      else hit = (v === "draft" && !t.links.length) || (v === "linked" && t.links.length > 0) || (v === "agent" && t.reporter === ATLAS_ID);
    } else {
      hit = norm(t.title).includes(norm(body)) || norm(t.id).includes(norm(body));
    }
    return neg ? !hit : hit;
  });
}

export const DEFAULT_TICKET_QUERY = "-status:Done -status:Backburner";
