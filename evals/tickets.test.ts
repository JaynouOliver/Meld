/**
 * Jira-style ticket fields (no model calls): npm run test:tickets
 * Comments (add, delete, permissions), labels / due / estimate validation, checklist
 * toggling, the label: and due: filters, and Atlas's comment and field changes with undo.
 */
import assert from "node:assert/strict";

import { applyOps, revertOps } from "../src/lib/agent/actions";
import { createTicket, updateTicket } from "../src/lib/api/service";
import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type Directory } from "../src/lib/directory";
import { matchQuery } from "../src/lib/query-language";
import { memoryStore } from "../src/lib/store/memory";
import { cleanEstimate, cleanLabels, isOverdue, isValidDue, normLabel } from "../src/lib/ticket-fields";
import type { Role, Ticket } from "../src/lib/types";
import { planToOps, runTool, type ToolCtx } from "../src/server/atlas/tools";

const person = (id: string, name: string, team: string | null = "eng") => ({ id, name, first: name, initials: name[0], color: "#000", team, isAgent: false });
const base: Directory = {
  workspace: { id: "ws-tk", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "u3", "atlas"],
  teams: [{ id: "eng", name: "Engineering" }, { id: "ops", name: "Ops" }] as Directory["teams"],
  people: { u1: person("u1", "Ada"), u2: person("u2", "Bo"), u3: person("u3", "Cy", "ops"), atlas: ATLAS },
  agents: [ATLAS_AGENT],
  chats: { eng: { id: "eng", kind: "channel", label: "eng", topic: "", team: null, members: [], agents: [{ id: "atlas", mode: "mention" }] } },
  channels: ["eng"], dms: [], home: "eng", memberships: [], demo: false,
};
const store = memoryStore("ws-tk", "T");
let ctx: RequestCtx = { dir: base, store };
setCtxProvider(() => ctx);
/** Act as someone else (their real role is `role`). */
const as = (me: string, role: Role) => (ctx = { dir: { ...base, me, role }, store });
const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const rejects = (p: Promise<unknown>, re: RegExp, msg?: string) => assert.rejects(p, re, msg);

async function main() {
  // ---------------------------------------------------------------- pure rules
  assert.equal(normLabel("  Launch Prep! "), "launch-prep");
  assert.deepEqual(cleanLabels(["Bug", "bug", " billing "]), { labels: ["bug", "billing"] }, "normalized and de-duplicated");
  assert.ok("error" in cleanLabels(["!!!"]), "a label with nothing usable is rejected");
  assert.ok("error" in cleanLabels("bug"), "labels must be a list");
  assert.ok("error" in cleanLabels(Array.from({ length: 9 }, (_, i) => `l${i}`)), "at most 8 labels");
  assert.deepEqual(cleanEstimate(3), { estimate: 3 });
  assert.deepEqual(cleanEstimate("2.5"), { estimate: 2.5 });
  assert.deepEqual(cleanEstimate(null), { estimate: null });
  for (const bad of [-1, 101, 1.25, Number.NaN, "lots", true]) assert.ok("error" in cleanEstimate(bad), `estimate ${String(bad)} rejected`);
  assert.ok(isValidDue("2026-11-30"));
  assert.ok(!isValidDue("2026-02-31") && !isValidDue("11/30/2026") && !isValidDue(""), "only real YYYY-MM-DD dates");
  assert.ok(isOverdue({ due: day(-1), status: "To do" }));
  assert.ok(!isOverdue({ due: day(-1), status: "Done" }), "done work isn't overdue");
  assert.ok(!isOverdue({ due: day(0), status: "To do" }), "due today isn't overdue yet");

  // ---------------------------------------------------------------- comments
  as("u1", "owner");
  const t = await createTicket({ title: "Ship billing", team: "eng", assignee: "u2" }, "owner");
  let r = await updateTicket({ id: t.id, role: "owner", addComment: "  Looks good, see T-2 @Bo  " });
  assert.equal(r.ticket.comments?.length, 1);
  assert.deepEqual({ who: r.ticket.comments![0].who, text: r.ticket.comments![0].text }, { who: "u1", text: "Looks good, see T-2 @Bo" }, "trimmed, signed by the caller");
  await rejects(updateTicket({ id: t.id, role: "owner", addComment: "   " }), /empty/, "empty comment rejected");
  await rejects(updateTicket({ id: t.id, role: "owner", addComment: "x".repeat(4001) }), /limited/, "long comment rejected");

  as("u2", "member");
  r = await updateTicket({ id: t.id, role: "member", addComment: "On it." });
  const bosComment = r.ticket.comments!.at(-1)!;
  assert.equal(bosComment.who, "u2");
  const adas = r.ticket.comments![0].id;
  await rejects(updateTicket({ id: t.id, role: "member", removeCommentId: adas }), /your own/, "members can't delete others' comments");
  r = await updateTicket({ id: t.id, role: "member", removeCommentId: bosComment.id });
  assert.deepEqual(r.ticket.comments!.map((c) => c.id), [adas], "own comment deleted");

  as("u3", "member");
  await rejects(updateTicket({ id: t.id, role: "member", addComment: "hi" }), /No access/, "can't comment on a ticket you can't see");

  as("u1", "owner");
  await rejects(updateTicket({ id: t.id, role: "member", removeCommentId: "nope" }), /no longer exists/);
  await updateTicket({ id: t.id, role: "owner", addComment: "second" });
  // An owner previewing as a member is held to member rules.
  as("u2", "member");
  const ownerNote = (await store.getTicket(t.id))!.comments!.at(-1)!.id;
  await rejects(updateTicket({ id: t.id, role: "member", removeCommentId: ownerNote }), /your own/);
  as("u1", "owner");
  r = await updateTicket({ id: t.id, role: "owner", removeCommentId: adas });
  assert.equal(r.ticket.comments!.length, 1, "owners can remove any comment");

  // ---------------------------------------------------------------- labels, due, estimate
  r = await updateTicket({ id: t.id, role: "owner", patch: { labels: ["Billing", "launch", "billing"], due: day(-2), estimate: 5 } });
  assert.deepEqual(r.ticket.labels, ["billing", "launch"]);
  assert.equal(r.ticket.due, day(-2));
  assert.equal(r.ticket.estimate, 5);
  r = await updateTicket({ id: t.id, role: "owner", patch: { labels: ["billing", "launch", "api"] } });
  assert.match(r.ticket.activity.at(-1)!.text, /added label api/, "label change is logged");
  r = await updateTicket({ id: t.id, role: "owner", patch: { labels: ["billing", "launch"] } });
  await rejects(updateTicket({ id: t.id, role: "owner", patch: { due: "2026-13-01" } }), /real date/);
  await rejects(updateTicket({ id: t.id, role: "owner", patch: { estimate: -3 } }), /Estimate/);
  await rejects(updateTicket({ id: t.id, role: "owner", patch: { labels: ["%%%"] } }), /usable/);
  r = await updateTicket({ id: t.id, role: "owner", patch: { estimate: null } });
  assert.equal(r.ticket.estimate, null, "estimate cleared");

  // ---------------------------------------------------------------- checklist
  r = await updateTicket({ id: t.id, role: "owner", addChecklistItem: "Write tests" });
  r = await updateTicket({ id: t.id, role: "owner", addChecklistItem: "Ship" });
  const [a, b] = r.ticket.checklist!;
  assert.deepEqual(r.ticket.checklist!.map((i) => i.done), [false, false]);
  r = await updateTicket({ id: t.id, role: "owner", toggleChecklistId: a.id });
  assert.deepEqual(r.ticket.checklist!.map((i) => i.done), [true, false], "toggled on");
  r = await updateTicket({ id: t.id, role: "owner", toggleChecklistId: a.id });
  assert.equal(r.ticket.checklist![0].done, false, "toggled back off");
  r = await updateTicket({ id: t.id, role: "owner", removeChecklistId: b.id });
  assert.deepEqual(r.ticket.checklist!.map((i) => i.text), ["Write tests"]);
  await rejects(updateTicket({ id: t.id, role: "owner", toggleChecklistId: b.id }), /no longer exists/);
  await rejects(updateTicket({ id: t.id, role: "owner", addChecklistItem: " " }), /empty/);

  // ---------------------------------------------------------------- query filters
  const q = (tk: Ticket, query: string) => matchQuery(tk, query, ctx.dir);
  const cur = (await store.getTicket(t.id))!;
  assert.ok(q(cur, "label:billing") && q(cur, "label:Billing"), "label filter, case-insensitive");
  assert.ok(!q(cur, "label:bill"), "labels match whole, not by prefix");
  assert.ok(q(cur, "-label:bug"), "negated label");
  assert.ok(q(cur, "due:overdue") && !q(cur, "due:none"), "overdue");
  assert.ok(!q({ ...cur, status: "Done" }, "due:overdue"), "done tickets aren't overdue");
  assert.ok(q({ ...cur, due: day(3) }, "due:week") && !q({ ...cur, due: day(20) }, "due:week"));
  assert.ok(q({ ...cur, due: null }, "due:none"));
  assert.ok(q(cur, "label:launch due:overdue status:todo"), "combines with other tokens");

  // ---------------------------------------------------------------- Atlas: comment and fields, with undo
  const effects = { plan: new Map(), read: [] as string[] };
  const tctx: ToolCtx = { role: "owner", where: "eng", effects, store };
  const bad = (await runTool("update_ticket", { id: t.id, estimate: 1000 }, tctx)) as { ok: boolean };
  assert.equal(bad.ok, false, "invalid estimate refused");
  assert.equal(((await runTool("update_ticket", { id: t.id, due: "tomorrow" }, tctx)) as { ok: boolean }).ok, false, "invalid due refused");
  assert.equal(((await runTool("create_ticket", { title: "Thing", team: "eng", assignee: "u2", priority: "Low", labels: ["???"] }, tctx)) as { ok: boolean }).ok, false, "invalid label refused");
  await runTool("update_ticket", { id: t.id, labels_add: ["Bug"], labels_remove: ["launch"], due: "none", estimate: 3 }, tctx);
  const said = (await runTool("comment_on_ticket", { id: t.id, text: "Summary: blocked on T-9 until Friday." }, tctx)) as { ok: boolean; staged: boolean };
  assert.ok(said.ok && said.staged, "comment staged like other changes");
  const ops = planToOps(effects.plan);
  assert.equal(ops.length, 1, "one op per ticket");
  const before = (await store.getTicket(t.id))!;
  await applyOps(store, ops, "eng");
  let now = (await store.getTicket(t.id))!;
  assert.deepEqual(now.labels, ["billing", "bug"]);
  assert.equal(now.due, null);
  assert.equal(now.estimate, 3);
  assert.equal(now.comments!.at(-1)!.who, "atlas", "Atlas signs its comment");

  // Someone comments while the undo window is open; undo must keep that comment.
  await updateTicket({ id: t.id, role: "owner", addComment: "Thanks Atlas" });
  await revertOps(store, ops, "eng");
  now = (await store.getTicket(t.id))!;
  assert.deepEqual(now.labels, before.labels, "labels restored");
  assert.equal(now.due, before.due, "due restored");
  assert.equal(now.estimate, before.estimate, "estimate restored");
  assert.ok(!now.comments!.some((c) => c.who === "atlas"), "Atlas's comment removed");
  assert.ok(now.comments!.some((c) => c.text === "Thanks Atlas"), "a person's later comment survives undo");

  // get_ticket shows the latest comments; guests can't see hidden tickets' comments.
  const got = (await runTool("get_ticket", { id: t.id }, { ...tctx, effects: { plan: new Map(), read: [] } })) as { comments: string[]; labels: string[] };
  assert.ok(got.comments.some((c) => /Thanks Atlas/.test(c)), "get_ticket includes comments");
  as("u3", "guest");
  const hidden = (await runTool("comment_on_ticket", { id: t.id, text: "hi" }, { ...tctx, role: "guest", effects: { plan: new Map(), read: [] } })) as { ok: boolean };
  assert.equal(hidden.ok, false, "can't comment on a ticket the requester can't see");

  // A custom agent signs as itself and needs the write group.
  as("u1", "owner");
  const reader = (await runTool("comment_on_ticket", { id: t.id, text: "hi" }, { ...tctx, allowed: ["read"], effects: { plan: new Map(), read: [] } })) as { ok: boolean };
  assert.equal(reader.ok, false, "read-only agents can't comment");
  const e2 = { plan: new Map(), read: [] as string[] };
  await runTool("comment_on_ticket", { id: t.id, text: "Triage note" }, { ...tctx, agentId: "ag-triage", effects: e2 });
  assert.equal([...e2.plan.values()][0].after.comments.at(-1).who, "ag-triage");

  console.log("tickets: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
