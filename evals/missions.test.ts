/**
 * Missions without a model: npm run test:missions
 * Launch files tickets with dates and blockers; a check-in re-plans around late work,
 * escalates when the forecast misses the deadline, and the person's decision is applied.
 */
import assert from "node:assert/strict";

import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type Directory } from "../src/lib/directory";
import type { Mission } from "../src/lib/missions";
import { memoryStore } from "../src/lib/store/memory";
import { answerDecision, checkInMission, launchMission } from "../src/server/missions";

const person = (id: string, name: string) => ({ id, name, first: name, initials: name[0], color: "#000", team: "eng", isAgent: false });
const dir: Directory = {
  workspace: { id: "ws-m", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "u1", role: "owner", personOrder: ["u1", "u2", "atlas"], teams: [{ id: "eng", name: "Engineering" }] as Directory["teams"],
  people: { u1: person("u1", "Ada"), u2: person("u2", "Bo"), atlas: ATLAS },
  agents: [ATLAS_AGENT],
  chats: { eng: { id: "eng", kind: "channel", label: "eng", topic: "", team: null, members: [], agents: [{ id: "atlas", mode: "mention" }] } },
  channels: ["eng"], dms: [], home: "eng", memberships: [], demo: false,
};
const ctx: RequestCtx = { dir, store: memoryStore("ws-m", "T") };
setCtxProvider(() => ctx);

const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const task = (key: string, owner: string, due: string, dependsOn: string[] = [], priority: "Low" | "Medium" | "High" = "Medium") =>
  ({ key, title: `Task ${key}`, description: "", owner, team: "eng", priority, due, dependsOn });

async function main() {
  const { store } = ctx;
  const root = await store.appendMessage("eng", { id: "root", who: "atlas", time: new Date().toISOString(), text: "Mission started" });
  const m: Mission = {
    id: "ms1", title: "Ship it", goal: "Ship it", chatId: "eng", threadId: root.id, status: "draft", deadline: day(2),
    plan: { tasks: [task("a", "u2", day(1)), task("b", "u1", day(2), ["a"]), task("c", "u2", day(2), [], "Low")], risks: [] },
    summary: "", health: "", createdBy: "u1", createdAt: new Date().toISOString(), launchedAt: null, lastCheckinAt: null,
  };
  await store.saveMission(m);

  // Launch: one ticket per task, due dates, dependencies as blockers.
  await launchMission("ms1", "owner");
  let tickets = (await store.listTickets()).filter((t) => t.missionId === "ms1");
  assert.equal(tickets.length, 3);
  const [a, b] = ["a", "b"].map((k) => tickets.find((t) => t.title === `Task ${k}`)!);
  assert.deepEqual(b.blockedBy, [a.id]);
  assert.equal(a.due, day(1));
  await assert.rejects(launchMission("ms1", "owner"), /already launched/);

  // On schedule: check-in keeps it active and changes no dates.
  await checkInMission("ms1", "owner");
  assert.equal((await store.getMission("ms1"))!.status, "active");

  // A slips two days: a moves to tomorrow... and b (waiting on a, due on the deadline) is fine.
  await store.saveTicket({ ...a, due: day(-1) });
  await checkInMission("ms1", "owner");
  tickets = (await store.listTickets()).filter((t) => t.missionId === "ms1");
  assert.equal(tickets.find((t) => t.id === a.id)!.due, day(1), "late work gets tomorrow");
  assert.equal((await store.getMission("ms1"))!.status, "active");

  // A slips to the deadline: b has to move past it, so the mission is at risk and a person is asked.
  await store.saveTicket({ ...tickets.find((t) => t.id === a.id)!, due: day(2) });
  await checkInMission("ms1", "owner");
  tickets = (await store.listTickets()).filter((t) => t.missionId === "ms1");
  assert.equal(tickets.find((t) => t.id === b.id)!.due, day(3), "dependents move after their blocker");
  let mission = (await store.getMission("ms1"))!;
  assert.equal(mission.status, "at_risk");
  const [d] = await store.listDecisions({ missionId: "ms1", status: "open" });
  assert.ok(d, "a date-vs-scope decision is raised");
  assert.ok(d.options.some((o) => o.startsWith("Move the deadline")));
  // Only work past the deadline that nothing waits on is offered as a cut: b, not c.
  const cut = d.options.find((o) => o.startsWith("Cut"));
  assert.ok(cut?.includes(b.id), `cut offers ${b.id}: ${cut}`);
  // A second check-in doesn't ask again.
  await checkInMission("ms1", "owner");
  assert.equal((await store.listDecisions({ missionId: "ms1", status: "open" })).length, 1);

  // Moving the deadline puts it back on track.
  await answerDecision(d.id, d.options.find((o) => o.startsWith("Move the deadline"))!, "owner");
  mission = (await store.getMission("ms1"))!;
  assert.equal(mission.deadline, day(3));
  assert.equal(mission.status, "active");
  await assert.rejects(answerDecision(d.id, "x", "owner"), /Already decided/);
  await assert.rejects(answerDecision(d.id, "x", "guest"), /Guests/);

  // Everything done: the mission completes and says so in its thread.
  for (const t of (await store.listTickets()).filter((t) => t.missionId === "ms1")) await store.saveTicket({ ...t, status: "Done" });
  await checkInMission("ms1", "owner");
  assert.equal((await store.getMission("ms1"))!.status, "done");
  const thread = (await store.listMessages("eng")).find((x) => x.id === root.id)!;
  assert.ok(JSON.stringify(thread).includes("Mission complete"), "completion is announced in the thread");
  console.log("missions: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
