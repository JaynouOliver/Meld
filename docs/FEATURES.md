# Meld: feature log and demo script

Everything here works in the live demo: https://meld-fawn.vercel.app, then **Try the live demo** (no sign-up). Each visitor gets a private copy of **Orbit Labs**, a startup two weeks from launching paid plans:
- **People:** Alex Rivera (you, founder), Maya Chen (design), Jonas Weber (backend), Priya Raman (frontend), Tom Okafor (growth) and Sofia Rossi (product).
- **Agents:** Atlas (lead), Tess (@tess, triage), Rex (@rex, reviews) and Sunny (@sunny, standups).

Status key: ✅ built and live · 🟡 partly built · ❌ not built.

Agent replies take about 1–10 seconds. A live "working" bubble shows while an agent works.

---

## 1. Chat (Slack-style)

| Feature | Status | Show it |
|---|---|---|
| Channels, DMs, threads | ✅ | Sidebar: #general, #product, #engineering, #design, #growth, #random. Open "5 replies" on Sofia's "Q4 launch plan" in #product. |
| Edit and delete messages | ✅ | Hover your own message, then the pencil (Enter saves) or the trash icon. "(edited)" appears. |
| Emoji reactions | ✅ | Hover a message, then the smiley, then pick 🎉. Click the chip again to remove it. |
| Pinned messages | ✅ | #design, then **Pinned 1** in the header, then click the pin to jump to the decision. Pin any message from the hover toolbar. |
| Search (Cmd/Ctrl+K) | ✅ | Press Cmd+K and type `pricing`. You get the ticket ORB-5 and messages across channels; Enter jumps to one. |
| Formatting | ✅ | Type `**ship it** on _Friday_ with \`flag=on\``. |
| Real-time, instant sending | ✅ | Two browser windows on the same demo: messages appear in the other window instantly. |

## 2. Tickets (Jira-style)

| Feature | Status | Show it |
|---|---|---|
| Ticket table, saved views, query filters | ✅ | **All tickets**, then the High priority or Filed by Atlas views. Type `label:billing` or `due:overdue` in the filter. |
| Kanban board, drag and drop | ✅ | **All tickets**, then **Board**. Drag ORB-3 from To do to In progress. |
| Ticket panel: labels, due date, points, checklist, comments | ✅ | Open ORB-4: labels, due date, 5 points, and comments from Jonas and Priya. ORB-1 has a 2/5 checklist. |
| Blockers and "you're unblocked" | ✅ | ORB-7 is blocked by ORB-4. Set ORB-4 to Done and Priya gets "You're unblocked". |
| Insights (real numbers) | ✅ | **All tickets**, then **Insights**. |

## 3. People

| Feature | Status | Show it |
|---|---|---|
| Faces for people, characters for agents | ✅ | Everywhere: sidebar, messages, board cards. |
| Profile cards | ✅ | Click any face, name or @mention. Atlas's card shows its skills and channels; Priya's shows her open tickets and a Message button. |
| People page, member lists | ✅ | Sidebar **People** to see everyone, with filters for Agents or a team. In a channel, click the member faces button (top right) and search. |
| Roles (owner, member, guest) | ✅ | Bottom-left "View as role", then Guest: tickets you can't see disappear, and agents act with your access. |

## 4. Agents

| Feature | Status | Show it (type exactly) |
|---|---|---|
| Ask Atlas anything about the work | ✅ | #engineering: `@atlas what's blocking the paid plans launch, and who owns it?` gives an answer with ticket chips and source links. |
| Thread → tickets for everyone | ✅ | #product, open the "Q4 launch plan" thread, type `@atlas turn this thread into tickets and assign everyone`, then **Confirm**. Atlas files only the missing ones; the rest already exist. |
| Agents act unprompted (Tess) | ✅ | #engineering, nobody tagged: `Checkout is broken on Safari: the Pay button does nothing after the card form loads`. Tess reacts 👀 and files a ticket in the thread. |
| Agents with jobs (Sunny) | ✅ | #general: `@sunny give us today's standup: what moved, what's blocked, who needs help` |
| What did I miss? | ✅ | Home, then **What did I miss?** |
| Agents work on assigned tickets | ✅ | Seeded: #engineering, Rex's "On it: ORB-14" with his finished review in the thread. Live: open ORB-3, set Assignee to **Rex**. He posts "On it", reviews, and moves it to In review (about 15 s). |
| Agent memory | ✅ | Atlas DM: `remember that Maya is out on Fridays`, then `who can review the pricing page this Friday?` (Maya is excluded). Rex's memory shows in his agent settings. |
| Thread summaries | ✅ | Open any thread, then **Summarize**: TL;DR, decisions, owners and next steps, open questions. |

## 5. Decision memory and self-updating tickets (the listener)

| Feature | Status | Show it (type exactly) |
|---|---|---|
| Decisions logged automatically | ✅ | Seeded: #design thread "Where should the onboarding checklist live?" is 📌 logged. Sidebar **Decisions** shows it with the why and what was rejected. |
| "We already decided this" guard | ✅ | #design: `What if we make the onboarding checklist a modal on first login instead? Feels cleaner`. Atlas replies in about 3 s with who decided, when, why, and a link to the original thread. |
| Why did we…? | ✅ | Anywhere: `@atlas why did we go with a sidebar card for the onboarding checklist?` |
| Progress said in chat updates the ticket | ✅ | #product: `Recorded the 2-minute demo video, it's up for review now`. ORB-13 moves to In review, with Undo. |
| Commitments become tickets | ✅ | #product: `I'll write the investor update and send it out by Friday`. A new ticket appears, due Friday. |
| Ignores small talk | ✅ | `lunch was great today, thanks everyone` gets no reply. |

## 6. Missions (goal → plan → done)

| Feature | Status | Show it |
|---|---|---|
| Mission in flight, check-in, re-plan, decision | ✅ | Sidebar **Missions**, then **Launch paid plans**, then **Run check-in**. ORB-5 slipped: dates move, the mission goes **At risk**, and "Needs you" asks you to move the date or cut scope. Click **Cut ORB-9** and it's back **On track**. Click **Thread** for the agents' updates. |
| New mission, plan streams in | ✅ | **New mission**, `Launch the creator referral program`, then **Plan mission**. Tasks appear one by one in about 8 s; then **Launch mission**. |
| From chat | ✅ | `@atlas start a mission: publish the public changelog page by Friday` |

## 7. Platform

| Feature | Status | Notes |
|---|---|---|
| Sign-in with GitHub, Google or email; onboarding; invites | ✅ | `/login`, `/onboarding`, invite link in People settings. |
| One-click private demo | ✅ | About 4–6 s to a full workspace. |
| Fast and cheap | ✅ | Listener in about 1 s per message; 20k-message channels load in 23 ms; skeleton placeholders instead of spinners. |
| Evals | ✅ | `npm run eval:atlas` (32 cases), `eval:listener`, `eval:prefilter`, plus unit tests for each area. |

---

## Tonight's additions (being built)

Each section is filled in from the builder's notes in `docs/demo/`.

| # | Feature | Status |
|---|---|---|
| 1 | Follow-ups on unanswered questions | in progress |
| 2 | Reminders | in progress |
| 3 | Auto-triage of new tickets | in progress |
| 4 | Linked threads | in progress |
| 5 | Daily digest from Sunny | in progress |
| 6 | Workload balancer | in progress |
| 7 | Meeting notes → actions | in progress |
| 8 | Agent playbooks | in progress |
| – | Logo, browser-tab icon, landing page revamp | in progress |
