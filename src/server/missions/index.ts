import "server-only";

import { after as after_ } from "next/server";

import { currentCtx } from "@/lib/context";
import { agentById, ATLAS_ID, personOf } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import { criticalPath, type Decision, type Mission, type MissionEvent, type MissionView } from "@/lib/missions";
import { ApiError, effectiveRole } from "@/lib/api/service";
import type { ChatId, Ticket } from "@/lib/types";
import { dispatch, runsWeExecute } from "../agents/dispatch";
import { processRun } from "../atlas/queue";
import { pingChanges } from "../realtime";
import { rememberMissionDecision } from "../listener/decisions";
import { planMission } from "./planner";

/**
 * Missions (docs/agent-platform.md): plan a goal into a draft, launch it into tickets and
 * hand-offs, then drive it with check-ins (checkin.ts). Every step is told in the
 * mission's thread in the channel it was launched from.
 */

const fmtDay = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "no deadline";

async function event(m: Mission, kind: MissionEvent["kind"], text: string, actor: string | null = ATLAS_ID) {
  await currentCtx().store.addMissionEvent({ missionId: m.id, kind, actor, text, at: new Date().toISOString() });
}

/** Post in the mission's thread (as Atlas). */
async function say(m: Mission, text: string) {
  const { store } = currentCtx();
  return store.appendMessage(m.chatId, { id: uid(), who: ATLAS_ID, time: stamp(), text }, m.threadId);
}

async function ping(m: Mission, tickets = false) {
  const { dir } = currentCtx();
  await pingChanges({ chats: [m.chatId], tickets, runs: false, missions: true, origin: null, workspaceId: dir.workspace.id });
}

export async function listMissions(): Promise<(Mission & { done: number; total: number; openDecisions: number })[]> {
  const { store } = currentCtx();
  const [missions, tickets, decisions] = await Promise.all([store.listMissions(), store.listTickets(), store.listDecisions({ status: "open" })]);
  return missions.map((m) => {
    const mine = tickets.filter((t) => t.missionId === m.id && t.status !== "Backburner");
    return { ...m, done: mine.filter((t) => t.status === "Done").length, total: mine.length || m.plan.tasks.length, openDecisions: decisions.filter((d) => d.missionId === m.id).length };
  });
}

export async function getMission(id: string): Promise<MissionView> {
  const { store } = currentCtx();
  const mission = await store.getMission(id);
  if (!mission) throw new ApiError("That mission doesn't exist", 404);
  const [tickets, decisions, events] = await Promise.all([store.listTickets(), store.listDecisions({ missionId: id }), store.listMissionEvents(id)]);
  return { mission, tickets: tickets.filter((t) => t.missionId === id), decisions, events };
}

/** Open decisions across missions: the "Needs you" queue. */
export async function openDecisions(): Promise<(Decision & { missionTitle: string })[]> {
  const { store } = currentCtx();
  const [decisions, missions] = await Promise.all([store.listDecisions({ status: "open" }), store.listMissions()]);
  return decisions.map((d) => ({ ...d, missionTitle: missions.find((m) => m.id === d.missionId)?.title ?? "Mission" }));
}

/**
 * Start a mission from a goal: a thread in the channel, then a draft plan (tasks, owners,
 * dates, dependencies) and the decisions it needs. Nothing is filed until it's launched.
 */
export async function createMission(input: { goal: string; deadline?: string | null; chatId: ChatId; role?: string }) {
  const { dir, store } = currentCtx();
  const role = effectiveRole(input.role as never);
  if (role === "guest") throw new ApiError("Guests can't start missions", 403);
  const chat = dir.chats[input.chatId];
  if (!chat || chat.kind !== "channel") throw new ApiError("Start a mission from a channel", 400);
  const goal = input.goal.trim().slice(0, 300);
  if (!goal) throw new ApiError("Say what the mission should achieve");
  const deadline = input.deadline && /^\d{4}-\d{2}-\d{2}$/.test(input.deadline) ? input.deadline : null;

  const m: Mission = {
    id: `ms${uid()}`, title: goal.slice(0, 60), goal, chatId: input.chatId, threadId: null, status: "planning", deadline,
    plan: { tasks: [], risks: [] }, summary: "", health: "", createdBy: dir.me, createdAt: new Date().toISOString(), launchedAt: null, lastCheckinAt: null,
  };
  const root = await store.appendMessage(input.chatId, {
    id: uid(), who: ATLAS_ID, time: stamp(),
    text: `Mission started by ${personOf(dir, dir.me).name}: ${goal}${deadline ? ` (by ${fmtDay(deadline)})` : ""}. I'm drafting the plan in this thread.`,
  });
  m.threadId = root.id;
  await store.saveMission(m);
  await ping(m);

  // Plan after the response: the board opens right away and fills in as tasks stream.
  after_(() => draftPlan(m, role));
  return m;
}

async function draftPlan(m: Mission, role: ReturnType<typeof effectiveRole>) {
  const { dir, store } = currentCtx();
  try {
    const p = await planMission({
      goal: m.goal, deadline: m.deadline, chatId: m.chatId, role,
      onTasks: async (tasks) => {
        m.plan = { tasks, risks: [] };
        await store.saveMission(m);
        await ping(m);
      },
    });
    m.title = p.title;
    m.summary = p.summary;
    m.plan = p.plan;
    m.status = "draft";
    m.deadline = m.deadline ?? p.plan.tasks.map((t) => t.due ?? "").sort().pop() ?? null;
    await store.saveMission(m);
    for (const d of p.decisions) {
      await store.saveDecision({
        id: `dc${uid()}`, missionId: m.id, question: d.question, options: d.options, context: d.context, status: "open",
        answer: null, answeredBy: null, answeredAt: null, createdAt: new Date().toISOString(),
      });
    }
    const path = criticalPath(m.plan.tasks).map((k) => m.plan.tasks.find((t) => t.key === k)!.title);
    const owners = [...new Set(m.plan.tasks.map((t) => personOf(dir, t.owner).first))];
    await event(m, "planned", `Drafted ${m.plan.tasks.length} tasks for ${owners.length} owners.`);
    await say(
      m,
      `Draft plan for "${m.title}": ${m.plan.tasks.length} tasks across ${owners.join(", ")}, done by ${fmtDay(m.deadline)}. ` +
        `Critical path: ${path.join(" → ")}.` +
        (p.decisions.length ? ` ${p.decisions.length === 1 ? "One decision needs" : `${p.decisions.length} decisions need`} a person before launch.` : "") +
        ` Review it on the mission board and launch when ready.`,
    );
    await ping(m);
  } catch (e) {
    m.status = "canceled";
    m.health = "Planning failed. Try rephrasing the goal.";
    await store.saveMission(m);
    await say(m, `I couldn't draft a plan for this mission (${(e as Error).message}). Try rephrasing the goal.`);
    await ping(m);
  }
}

/**
 * Launch a draft: file the tickets (reusing existing ones), wire dependencies as blockers,
 * announce owners in the thread, and hand agent-owned tasks to those agents.
 */
export async function launchMission(id: string, requestedRole?: string) {
  const { dir, store } = currentCtx();
  const role = effectiveRole(requestedRole as never);
  if (role === "guest") throw new ApiError("Guests can't launch missions", 403);
  const m = await store.getMission(id);
  if (!m) throw new ApiError("That mission doesn't exist", 404);
  if (m.status !== "draft") throw new ApiError("This mission is already launched", 409);

  const keyToId = new Map<string, string>();
  for (const t of m.plan.tasks) keyToId.set(t.key, t.existing ?? (await store.nextTicketId()));
  for (const t of m.plan.tasks) {
    const id_ = keyToId.get(t.key)!;
    t.ticketId = id_;
    const blockedBy = t.dependsOn.map((k) => keyToId.get(k)!).filter(Boolean);
    const existing = t.existing ? await store.getTicket(t.existing) : null;
    if (existing) {
      await store.saveTicket({
        ...existing, missionId: m.id, due: existing.due ?? t.due, blockedBy: [...new Set([...(existing.blockedBy ?? []), ...blockedBy])],
        activity: [...existing.activity, { who: "Atlas", text: `added it to the mission "${m.title}"`, time: stamp() }],
      });
      continue;
    }
    const ticket: Ticket = {
      id: id_, team: t.team, title: t.title, description: `${t.description}\n\nPart of the mission "${m.title}".`.trim(), status: "To do",
      priority: t.priority, assignee: t.owner, reporter: ATLAS_ID, links: [], images: [], updated: "Just now",
      watch: { chat: m.chatId, thread: m.threadId }, blockedBy, missionId: m.id, due: t.due,
      activity: [{ who: "Atlas", text: `created this ticket for the mission "${m.title}"`, time: stamp() }],
    };
    await store.insertTicket(ticket);
  }
  m.status = "active";
  m.launchedAt = new Date().toISOString();
  m.health = "On track: just launched";
  await store.saveMission(m);
  await event(m, "launched", `Launched with ${m.plan.tasks.length} tickets.`, dir.me);

  // Who does what, in the thread. Agent owners get the task handed to them here.
  const lines = m.plan.tasks.map((t) => {
    const a = agentById(dir, t.owner);
    const who = a ? `@${a.handle}` : `@${personOf(dir, t.owner).first}`;
    const wait = t.dependsOn.length ? `, after ${t.dependsOn.map((k) => keyToId.get(k)).join(", ")}` : "";
    return `• ${t.ticketId} ${t.title}: ${who}, due ${fmtDay(t.due)}${wait}`;
  });
  const agentTasks = m.plan.tasks.filter((t) => agentById(dir, t.owner) && t.owner !== ATLAS_ID);
  const handoff = agentTasks.length
    ? `\n${agentTasks.map((t) => `@${agentById(dir, t.owner)!.handle}, please take ${t.ticketId} now: ${t.description || t.title}`).join("\n")}`
    : "";
  await say(m, `Mission launched: "${m.title}", due ${fmtDay(m.deadline)}.\n${lines.join("\n")}${handoff}\nI'll check in on progress and flag anything that puts the date at risk.`);
  await ping(m, true);

  // Agent owners already started on their tickets when those were filed above (assigned to
  // an agent: src/server/agents/assignment.ts), so the hand-off line needs no extra run.
  return m;
}

export async function cancelMission(id: string) {
  const { dir, store } = currentCtx();
  const m = await store.getMission(id);
  if (!m) throw new ApiError("That mission doesn't exist", 404);
  if (dir.role === "guest") throw new ApiError("Guests can't cancel missions", 403);
  m.status = "canceled";
  m.health = `Canceled by ${personOf(dir, dir.me).name}`;
  await store.saveMission(m);
  await event(m, "canceled", m.health, dir.me);
  await say(m, `Mission canceled by ${personOf(dir, dir.me).name}. Its tickets stay as they are.`);
  await ping(m, true);
  return m;
}

// ---------------------------------------------------------------------------------------
// Check-ins: read the mission's tickets, re-plan dates around what slipped, nudge the
// owners of late or ready work, forecast the finish, and escalate a date-vs-scope call to
// the person who started the mission when the forecast misses the deadline.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400_000));
const live = (t: Ticket) => t.status !== "Done" && t.status !== "Backburner";

/** Latest due date among the work that's left: when the mission will actually finish. */
function forecast(tickets: Ticket[]) {
  return tickets.filter(live).map((t) => t.due ?? "").filter(Boolean).sort().pop() ?? null;
}

function mention(id: string) {
  const { dir } = currentCtx();
  const a = agentById(dir, id);
  return a ? `@${a.handle}` : `@${personOf(dir, id).first}`;
}

export async function checkInMission(id: string, requestedRole?: string): Promise<{ summary: string }> {
  const { dir, store } = currentCtx();
  const role = effectiveRole(requestedRole as never);
  if (role === "guest") throw new ApiError("Guests can't run check-ins", 403);
  const m = await store.getMission(id);
  if (!m) throw new ApiError("That mission doesn't exist", 404);
  if (m.status !== "active" && m.status !== "at_risk") throw new ApiError("Only a launched mission can be checked in on", 409);

  const all = await store.listTickets();
  const mine = all.filter((t) => t.missionId === m.id && t.status !== "Backburner");
  const today = iso(new Date());
  const done = mine.filter((t) => t.status === "Done");
  m.lastCheckinAt = new Date().toISOString();

  if (mine.length && done.length === mine.length) {
    m.status = "done";
    m.health = `Done: all ${mine.length} tasks finished`;
    await store.saveMission(m);
    await event(m, "done", m.health);
    const summary = `Mission complete: "${m.title}". All ${mine.length} tasks are done${m.deadline ? (today <= m.deadline ? `, on time for ${fmtDay(m.deadline)}` : `, ${fmtDay(today)} against a ${fmtDay(m.deadline)} deadline`) : ""}. Thanks ${[...new Set(mine.map((t) => personOf(dir, t.assignee).first))].join(", ")}.`;
    await say(m, summary);
    await ping(m, true);
    return { summary };
  }

  const open = mine.filter(live);
  const late = open.filter((t) => t.due && t.due < today);
  // Ready: nothing blocks it, not started, due within a day.
  const ready = open.filter(
    (t) => t.status === "To do" && !late.includes(t) && !(t.blockedBy ?? []).some((b) => live(all.find((x) => x.id === b) ?? ({ status: "Done" } as Ticket))) && (t.due ?? "9999") <= addDays(today, 1),
  );

  // Re-plan: late work gets a new date (tomorrow), and everything that waits on it moves
  // after it. Walk in dependency order so a push carries down the chain.
  const due = new Map(mine.map((t) => [t.id, t.due ?? null]));
  for (const t of late) due.set(t.id, addDays(today, 1));
  const order = [...m.plan.tasks].sort((a, b) => (levelOf(m, a.key) - levelOf(m, b.key)));
  for (const task of order) {
    const t = mine.find((x) => x.id === task.ticketId);
    if (!t || !live(t)) continue;
    const after_ = (t.blockedBy ?? []).map((b) => mine.find((x) => x.id === b)).filter((b): b is Ticket => !!b && live(b)).map((b) => due.get(b.id) ?? "").filter(Boolean).sort().pop();
    const cur = due.get(t.id);
    if (after_ && (!cur || cur <= after_)) due.set(t.id, addDays(after_, 1));
  }
  const moved = open.filter((t) => due.get(t.id) !== (t.due ?? null));
  for (const t of moved) {
    const why = late.includes(t) ? "it slipped past its date" : `it waits on ${(t.blockedBy ?? []).filter((b) => moved.some((x) => x.id === b)).join(", ")}`;
    await store.saveTicket({
      ...t, due: due.get(t.id)!, updated: "Just now",
      activity: [...t.activity, { who: "Atlas", text: `moved the due date to ${fmtDay(due.get(t.id)!)} (${why})`, time: stamp() }],
    });
    const task = m.plan.tasks.find((x) => x.ticketId === t.id);
    if (task) task.due = due.get(t.id)!;
  }
  const after = mine.map((t) => ({ ...t, due: due.get(t.id) ?? t.due }));
  const finish = forecast(after);
  const slips = !!(m.deadline && finish && finish > m.deadline);

  // Escalate: when the forecast misses the date, ask the person who started it to pick
  // date vs scope, once (an open slip decision is reused).
  const decisions = await store.listDecisions({ missionId: m.id, status: "open" });
  let asked = decisions.find((d) => d.actions && Object.keys(d.actions).length);
  if (slips && !asked) {
    // Only cutting work that finishes past the deadline and that nothing else waits on
    // pulls the date in: offer the least important such task.
    const left = after.filter(live);
    const cut = left
      .filter((t) => (t.due ?? "") > m.deadline! && !left.some((x) => (x.blockedBy ?? []).includes(t.id)))
      .sort((a, b) => rank(a.priority) - rank(b.priority))[0];
    const actions: Decision["actions"] = { [`Move the deadline to ${fmtDay(finish)}`]: { kind: "move_deadline", date: finish! } };
    if (cut) actions[`Cut ${cut.id} (${cut.title.slice(0, 40)})`] = { kind: "cut", ticketId: cut.id };
    actions["Keep the date, add help"] = { kind: "keep" };
    asked = {
      id: `dc${uid()}`, missionId: m.id, status: "open", answer: null, answeredBy: null, answeredAt: null, createdAt: new Date().toISOString(),
      question: `${late.map((t) => t.id).join(", ") || "Work"} slipped. The plan now finishes ${fmtDay(finish)}, after the ${fmtDay(m.deadline)} deadline. What should we do?`,
      context: `Re-planned: ${moved.length} task${moved.length === 1 ? "" : "s"} moved. ${cut ? `Cutting ${cut.id} would hold the date; nothing else waits on it.` : "Everything late has work waiting on it, so scope can't be cut without moving the date."}`,
      options: Object.keys(actions), actions,
    };
    await store.saveDecision(asked);
    await event(m, "decision", `Asked ${personOf(dir, m.createdBy ?? dir.me).name}: move the date or cut scope.`);
  }

  m.status = slips ? "at_risk" : "active";
  const pct = Math.round((done.length / mine.length) * 100);
  m.health = slips
    ? `At risk: forecast ${fmtDay(finish)} against ${fmtDay(m.deadline)}`
    : late.length
      ? `On track after re-plan: forecast ${fmtDay(finish)}`
      : `On track: ${done.length} of ${mine.length} done, forecast ${fmtDay(finish)}`;
  await store.saveMission(m);

  // The update, in the thread.
  const lines: string[] = [];
  for (const t of late) lines.push(`• ${t.id} ${t.title} slipped (${personOf(dir, t.assignee).first}, was due ${fmtDay(t.due ?? null)}). New date ${fmtDay(due.get(t.id)!)}.`);
  const pushed = moved.filter((t) => !late.includes(t));
  if (pushed.length) lines.push(`• Re-planned ${pushed.length} dependent task${pushed.length === 1 ? "" : "s"}: ${pushed.map((t) => `${t.id} to ${fmtDay(due.get(t.id)!)}`).join(", ")}.`);
  const nudge = [...late, ...ready];
  const nudges = nudge.map((t) =>
    late.includes(t)
      ? `${mention(t.assignee)}, ${t.id} is past its date. What's left, and is ${fmtDay(due.get(t.id)!)} realistic?`
      : `${mention(t.assignee)}, ${t.id} is unblocked and due ${fmtDay(t.due ?? null)}. Can you pick it up?`,
  );
  const verdict = slips
    ? `Forecast: ${fmtDay(finish)}, after the ${fmtDay(m.deadline)} deadline. ${mention(m.createdBy ?? dir.me)}, I need a call from you: move the date or cut scope (it's on the mission board).`
    : `Forecast: ${fmtDay(finish)}${m.deadline ? `, within the ${fmtDay(m.deadline)} deadline` : ""}.`;
  const summary = [`Check-in: ${done.length} of ${mine.length} done (${pct}%).`, ...lines, ...nudges, verdict].join("\n");
  const msg = await say(m, summary);
  await event(m, "checkin", m.health);
  if (moved.length) await event(m, "replanned", `Moved ${moved.length} due date${moved.length === 1 ? "" : "s"}.`);
  for (const t of nudge) await event(m, "nudge", `Nudged ${personOf(dir, t.assignee).name} on ${t.id}.`);
  await ping(m, true);

  // Agent owners act on their nudge.
  if (nudge.some((t) => agentById(dir, t.assignee) && t.assignee !== ATLAS_ID)) {
    const runs = await dispatch({
      chatId: m.chatId, threadId: m.threadId, messageId: msg.id, authorId: ATLAS_ID, text: msg.text,
      parent: { id: `mission-${m.id}`, depth: 0, requester: dir.me, role, triggerMessageId: msg.id },
    });
    const ours = runsWeExecute(runs);
    if (ours.length) after_(() => Promise.all(ours.map((r) => processRun(r.id))));
  }
  return { summary };
}

const rank = (p: Ticket["priority"]) => (p === "Low" ? 0 : p === "Medium" ? 1 : 2);
function levelOf(m: Mission, key: string, seen = new Set<string>()): number {
  const t = m.plan.tasks.find((x) => x.key === key);
  if (!t || seen.has(key)) return 0;
  seen.add(key);
  return t.dependsOn.length ? 1 + Math.max(...t.dependsOn.map((d) => levelOf(m, d, seen))) : 0;
}

/**
 * A person answers a decision. Decisions Atlas raised itself (a slip) carry what each
 * option does and are applied here; the planner's product calls are handed to Atlas in
 * the thread, which updates the tickets to match.
 */
export async function answerDecision(decisionId: string, answer: string, requestedRole?: string) {
  const { dir, store } = currentCtx();
  const role = effectiveRole(requestedRole as never);
  if (role === "guest") throw new ApiError("Guests can't make mission decisions", 403);
  const d = (await store.listDecisions({})).find((x) => x.id === decisionId);
  if (!d) throw new ApiError("That decision doesn't exist", 404);
  if (d.status !== "open") throw new ApiError(`Already decided: ${d.answer}`, 409);
  const choice = answer.trim().slice(0, 200);
  if (!choice) throw new ApiError("Pick an answer");
  const m = await store.getMission(d.missionId);
  if (!m) throw new ApiError("That mission doesn't exist", 404);

  await store.saveDecision({ ...d, status: "answered", answer: choice, answeredBy: dir.me, answeredAt: new Date().toISOString() });
  // Part of the team's decision memory from now on (linked to the mission thread).
  if (m.threadId) {
    const slip = !!d.actions?.[choice];
    await rememberMissionDecision({
      topic: slip ? `${m.title}: date or scope` : d.question.replace(/\?$/, ""),
      statement: slip ? `${choice.replace(/ \(.*\)$/, "")} to keep "${m.title}" on track.` : `${choice}.`,
      rationale: d.context,
      chatId: m.chatId, threadId: m.threadId, messageId: m.threadId, by: dir.me,
    });
  }
  const who = personOf(dir, dir.me).name;
  await event(m, "decision", `${who} decided: ${choice}`, dir.me);

  const action = d.actions?.[choice];
  if (action) {
    const all = await store.listTickets();
    let note = "";
    if (action.kind === "move_deadline") {
      m.deadline = action.date;
      note = `Deadline moved to ${fmtDay(action.date)}. The plan fits again.`;
    } else if (action.kind === "cut") {
      const t = all.find((x) => x.id === action.ticketId);
      if (t) {
        await store.saveTicket({ ...t, status: "Backburner", updated: "Just now", activity: [...t.activity, { who: "Atlas", text: `cut it from the mission "${m.title}" (decided by ${who})`, time: stamp() }] });
        // Nothing waits on cut work any more.
        for (const x of all.filter((x) => x.missionId === m.id && (x.blockedBy ?? []).includes(t.id))) {
          await store.saveTicket({ ...x, blockedBy: (x.blockedBy ?? []).filter((b) => b !== t.id) });
        }
      }
      note = `Cut ${action.ticketId} from the mission and unblocked what waited on it.`;
    } else {
      note = `Keeping ${fmtDay(m.deadline)}. Anyone with room, the late work is in this thread.`;
    }
    const left = (await store.listTickets()).filter((t) => t.missionId === m.id);
    const finish = forecast(left);
    const fits = !m.deadline || !finish || finish <= m.deadline;
    if (action.kind !== "keep") {
      m.status = fits ? "active" : "at_risk";
      m.health = fits ? `On track after ${who}'s call: forecast ${fmtDay(finish)}` : `At risk: forecast ${fmtDay(finish)} against ${fmtDay(m.deadline)}`;
    }
    await store.saveMission(m);
    await say(m, `${who} decided: ${choice}. ${note}${action.kind === "cut" && !fits ? ` It still finishes ${fmtDay(finish)}, after ${fmtDay(m.deadline)}.` : ""}`);
    await ping(m, true);
    return;
  }

  // A product call from the plan: say it in the thread as the person, and let Atlas apply it.
  const msg = await store.appendMessage(
    m.chatId,
    { id: uid(), who: dir.me, time: stamp(), text: `Decision on "${d.question}": ${choice}. @atlas please apply it to the mission's tickets.` },
    m.threadId,
  );
  await ping(m, true);
  const runs = await dispatch({ chatId: m.chatId, threadId: m.threadId, messageId: msg.id, authorId: dir.me, text: msg.text, role });
  const ours = runsWeExecute(runs);
  if (ours.length) after_(() => Promise.all(ours.map((r) => processRun(r.id))));
}
