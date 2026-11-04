/**
 * The listener's actions, without a model: npm run test:listener
 * Given an analysis of a message, it logs / replaces decisions, flags conflicts (not in
 * the deciding thread), updates the speaker's tickets and tracks commitments as one
 * undoable action, respects roles, and replies once in the message's thread.
 */
import assert from "node:assert/strict";

import { decideAction } from "../src/lib/api/service";
import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type Directory } from "../src/lib/directory";
import { memoryStore } from "../src/lib/store/memory";
import type { Ticket } from "../src/lib/types";
import { NOTHING, type Analysis } from "../src/server/listener/analyze";
import { respond, type Heard } from "../src/server/listener";

const person = (id: string, name: string) => ({ id, name, first: name, initials: name[0], color: "#000", team: "eng", isAgent: false });
const dir: Directory = {
  workspace: { id: "ws-listen", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "atlas"], teams: [{ id: "eng", name: "Engineering" }] as Directory["teams"],
  people: { u1: person("u1", "Ada"), u2: person("u2", "Bo"), atlas: ATLAS },
  agents: [ATLAS_AGENT],
  chats: {
    eng: { id: "eng", kind: "channel", label: "eng", topic: "", team: null, members: [], agents: [{ id: "atlas", mode: "mention" }] },
    design: { id: "design", kind: "channel", label: "design", topic: "", team: null, members: [], agents: [{ id: "atlas", mode: "mention" }] },
  },
  channels: ["eng", "design"], dms: [], home: "eng", memberships: [], demo: false,
};
const ctx: RequestCtx = { dir, store: memoryStore("ws-listen", "T") };
setCtxProvider(() => ctx);

const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const ticket = (id: string, assignee: string, extra: Partial<Ticket> = {}): Ticket => ({
  id, team: "eng", title: `Ticket ${id}`, description: "", status: "To do", priority: "Medium", assignee, reporter: "u1",
  links: [], images: [], updated: "Today", watch: null, blockedBy: [], activity: [], ...extra,
});

async function post(chatId: string, text: string, who = "u1", threadId: string | null = null) {
  return ctx.store.appendMessage(chatId, { id: `m${Math.random().toString(36).slice(2, 8)}`, who, time: new Date().toISOString(), text }, threadId);
}
async function repliesTo(chatId: string, rootId: string) {
  const root = (await ctx.store.listMessages(chatId)).find((m) => m.id === rootId);
  return (root?.replies ?? []).filter((r) => r.who === "atlas");
}
const heard = (chatId: string, id: string, text: string, threadId: string | null = null, role: Heard["role"] = "owner"): Heard =>
  ({ chatId, threadId, messageId: id, authorId: "u1", text, role });
const data = async () => ({ context: [], tickets: await ctx.store.listTickets(), decisions: await ctx.store.listTeamDecisions() });

async function main() {
  const { store } = ctx;
  // Real ids from the store's counter, as in the app.
  const [T1, T2, T3] = [await store.nextTicketId(), await store.nextTicketId(), await store.nextTicketId()];
  for (const t of [ticket(T1, "u1"), ticket(T2, "u1"), ticket(T3, "u2")]) await store.insertTicket(t);

  // Nothing found: nothing posted.
  const quiet = await post("eng", "lunch was great");
  assert.equal((await respond(heard("eng", quiet.id, quiet.text), NOTHING, await data())).replyId, null);
  assert.equal((await repliesTo("eng", quiet.id)).length, 0);

  // A decision: logged with the why, 📌 on the message, one reply in its thread.
  const root = await post("design", "Modal or sidebar card for onboarding?");
  const settle = await post("design", "Agreed: sidebar card", "u1", root.id);
  const decided: Analysis = { ...NOTHING, decision: { topic: "Onboarding placement", statement: "Sidebar card, not a modal.", rationale: "Modals get dismissed.", rejected: ["Modal"], replaces: null } };
  await respond(heard("design", settle.id, settle.text, root.id), decided, { ...(await data()), context: [{ who: "u2" }] });
  let decisions = await store.listTeamDecisions();
  assert.equal(decisions.length, 1);
  assert.deepEqual(decisions[0].deciders.sort(), ["u1", "u2"]);
  assert.equal(decisions[0].status, "active");
  const settledMsg = (await store.listMessages("design")).find((m) => m.id === root.id)!.replies.find((r) => r.id === settle.id)!;
  assert.deepEqual(settledMsg.reactions?.["📌"], ["atlas"]);
  assert.match((await repliesTo("design", root.id)).at(-1)!.text, /Logged as a decision: Sidebar card/);

  // Going against it elsewhere: a heads-up citing the source, and the decision counts the flag.
  const contra = await post("eng", "Let's ship onboarding as a modal");
  const conflict: Analysis = { ...NOTHING, conflict: { decisionId: decisions[0].id, why: "Opposite choice" } };
  await respond(heard("eng", contra.id, contra.text), conflict, await data());
  const warn = (await repliesTo("eng", contra.id)).at(-1)!;
  assert.match(warn.text, /already decided this/);
  assert.match(warn.text, new RegExp(`\\[\\[cite:design:${root.id}:${settle.id}\\]\\]`));
  assert.equal((await store.listTeamDecisions())[0].flags, 1);

  // ...but not inside the conversation that made the decision.
  const inThread = await post("design", "modal could still work?", "u1", root.id);
  const before = (await repliesTo("design", root.id)).length;
  await respond(heard("design", inThread.id, inThread.text, root.id), conflict, await data());
  assert.equal((await repliesTo("design", root.id)).length, before, "no heads-up in the deciding thread");

  // A new decision that reverses it: the old one is marked replaced.
  const flip = await post("design", "Changing course: modal it is, research says so");
  decisions = await store.listTeamDecisions();
  await respond(heard("design", flip.id, flip.text), { ...NOTHING, decision: { topic: "Onboarding placement", statement: "Modal on first login.", rationale: "", rejected: [], replaces: decisions[0].id } }, await data());
  decisions = await store.listTeamDecisions();
  assert.equal(decisions.find((d) => d.statement.startsWith("Sidebar"))!.status, "superseded");
  assert.equal(decisions.find((d) => d.statement.startsWith("Modal"))!.status, "active");

  // Progress from chat: status, blocker, date on the speaker's ticket, plus a new commitment, as one undoable action.
  const upd = await post("eng", `${T1} is up for review; ${T2} is blocked on ${T3} and pushing it to next week. I'll also write the migration guide by Friday.`);
  const progress: Analysis = {
    ...NOTHING,
    updates: [
      { ticketId: T1, status: "In review", blockedBy: null, due: null, evidence: "up for review" },
      { ticketId: T2, status: null, blockedBy: T3, due: day(7), evidence: "blocked on T-3" },
    ],
    commitment: { title: "Write the migration guide", due: day(3) },
  };
  await respond(heard("eng", upd.id, upd.text), progress, await data());
  let all = await store.listTickets();
  assert.equal(all.find((t) => t.id === T1)!.status, "In review");
  assert.deepEqual(all.find((t) => t.id === T2)!.blockedBy, [T3]);
  assert.equal(all.find((t) => t.id === T2)!.due, day(7));
  const created = all.find((t) => t.title === "Write the migration guide")!;
  assert.ok(created, "commitment becomes a ticket");
  assert.equal(created.assignee, "u1");
  assert.equal(created.due, day(3));
  assert.equal(created.watch?.thread, upd.id, "it follows the conversation it came from");
  const reply = (await repliesTo("eng", upd.id)).at(-1)!;
  assert.match(reply.text, new RegExp(`Updated ${T1} from your message: To do → In review`));
  assert.match(reply.text, /Tracking it: .* "Write the migration guide" for Ada, due/);
  assert.equal(reply.action?.status, "applied");

  // Undo puts everything back.
  const actionId = reply.action!.id;
  await decideAction({ id: actionId, decision: "undo", role: "owner" });
  all = await store.listTickets();
  assert.equal(all.find((t) => t.id === T1)!.status, "To do");
  assert.deepEqual(all.find((t) => t.id === T2)!.blockedBy, []);
  assert.equal(all.find((t) => t.id === T2)!.due ?? null, null, "undo restores the old date");
  assert.ok(!all.some((t) => t.title === "Write the migration guide"));

  // A guest's commitment isn't filed (guests can't create tickets).
  const g = await post("eng", "I'll do the copy review by Friday");
  await respond(heard("eng", g.id, g.text, null, "guest"), { ...NOTHING, commitment: { title: "Copy review", due: day(3) } }, await data());
  assert.ok(!(await store.listTickets()).some((t) => t.title === "Copy review"));
  assert.equal((await repliesTo("eng", g.id)).length, 0);

  console.log("listener: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
