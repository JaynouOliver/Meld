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

## 8. Proactive and scheduled agents

All of these are seeded in every fresh demo. Ticket numbers below are what a fresh demo gets.

| # | Feature | Status | Already in the demo | Show it live (type exactly) |
|---|---|---|---|---|
| 1 | **Follow-ups on unanswered questions** | ✅ | #design: Atlas followed up "@Priya, Maya's question about the sidebar card at 1280px is still open." #growth: Tom's "Maya, any ETA?" is open and due. | Click **Atlas** (any face), then **Check follow-ups now**: the #growth follow-up posts. Or in #engineering type `@Jonas can you send me the Stripe test keys before Friday?`, wait at least 1 minute, then **Check follow-ups now**. |
| 4 | **Linked threads** | ✅ | #design: "Related: this is also being discussed in #growth" with a jump chip. | #product: `Has anyone tested the Google Calendar sync with recurring events yet? Beta customers keep asking about it.` In about 3–5 s Atlas replies "Related: this is also being discussed in #engineering" with a chip to Jonas's message. |
| 6 | **Workload balancer** | ✅ | #engineering: "Priya now has 5 open tickets. Jonas has 2 open on Engineering. Reassign ORB-21 to Jonas?" with Confirm. Team memory: "Priya Raman is out on Monday." | **All tickets**, open **ORB-22 "Booking confirmation email template"** (yours, due Monday), set Assignee to **Priya Raman**. Atlas instantly suggests a better owner (she's overloaded and out Monday), then **Confirm** reassigns it, with Undo. |
| 2 | **Reminders** | ✅ | #engineering: "⏰ Reminder from Jonas Weber: rotate the Stripe test-mode keys…". A reminder lands in your Atlas DM about 3 minutes after the demo opens. Your page (click your name, bottom-left) lists upcoming reminders with Cancel. | #engineering: `@atlas remind me in 1 minute to check the board`. Atlas confirms the exact time, and the reminder arrives in your Atlas DM about a minute later. Also: `@atlas remind #engineering Friday 10am to demo the webhooks`, `@atlas remind Maya in 2 hours about the pricing mocks`. Or hover any message, then the alarm clock, then "In 20 minutes". |
| 5 | **Daily digest from Sunny** | ✅ | #product: Sunny's digest (in progress, blocked chains, due/overdue with @mentions, overloaded people, open decisions, missions, a "Focus today" line). On a weekday after 9:00, today's digest also auto-posts in #general and #product when the demo opens. | Click **Sunny**, then **Post digest now** next to a channel. It posts in about 4 s. |

## 9. Automation

| # | Feature | Status | Already in the demo | Show it live |
|---|---|---|---|---|
| 3 | **Auto-triage of new tickets** | ✅ | ORB-24 "Booking page shows wrong time for invitees after DST" shows "Triaged by Tess" in its panel and thread. | **All tickets**, **New ticket**, type `Checkout fails for EU cards with 3DS`, press Enter. In about 3–5 s: "Triaged by Tess · labels bug, billing · priority High · owner Jonas (owns Stripe billing)", with Undo. Other titles: `Pricing page copy has a typo in the annual plan` (design, Low, Maya), `Google sync drops recurring event exceptions by Friday` (bug and integrations, High, Jonas, due Friday). |
| 8 | **Agent playbooks** | ✅ | Sidebar **Playbooks**: "Bug intake" (ticket labeled bug: Tess confirms repro and severity, then Rex assesses rollout risk, then Atlas assigns and summarizes), with a completed run on ORB-24 in #engineering. | The auto-triage demo above labels the ticket "bug", which starts Bug intake by itself. The ticket panel shows "Bug intake playbook · step 1 of 3 · Running", and **View thread** shows each agent's step (about 50 s for all 3). Owners can create and edit playbooks on the Playbooks page. |

## 10. Meeting notes to actions

| # | Feature | Status | Already in the demo | Show it live |
|---|---|---|---|---|
| 7 | **Meeting notes to actions** | ✅ | #product: Atlas's "**Notes: Pricing sync, Nov 3**": summary; 3 decisions (also on the **Decisions** page); 4 tickets filed with owners and dates (ORB-15 to ORB-18); Maya's item recognized as already tracked in ORB-5; 2 open questions with @mentions. | In #product, click the **notebook** button in the message box (left side), title `Q4 launch sync`, paste the transcript below, then **Process notes**. In about 11–18 s Atlas posts the summary, 2–3 decisions (logged), 3–5 action items with owners and dates on a **Confirm** card, and open questions. Confirm files the tickets, with Undo. |

Sample transcript for the meeting-notes demo (paste as is):

```
Sofia: Quick sync on the Q4 launch. Are we still on track for the 18th?
Jonas: Yes. Stripe webhooks land Thursday, then I want two days on staging.
Alex: Then let's lock it: we launch on the 18th, and no new scope after this Friday.
Sofia: Agreed. Next, the referral program. Tom, where did the reward land?
Tom: The survey says cash beats free months. I'd do a $20 credit for both sides.
Alex: Let's go with $20 for both sides and drop the free-month idea.
Tom: I'll write the referral terms and the FAQ by next Wednesday.
Maya: I'll have the invite screen mocks and copy ready for Priya by Friday.
Sofia: Onboarding A/B test: a 3-step checklist against the current 4-step one.
Priya: That still fits the sidebar card decision, so no conflict there.
Sofia: Decided then: two weeks, new signups only, 50/50 split.
Priya: I'll set up the feature flag and the test's tracking events by Thursday.
Sofia: And I'll draft the launch-day changelog by Monday.
Tom: Open question: do referral credits expire? Finance has to answer that one.
Alex: Also still open: do we announce referrals on launch day or a week later? Tom, your call once you've checked the email calendar.
Tom: I'll come back on that.
```

## 11. Brand

| Feature | Status | Where |
|---|---|---|
| Meld logo (a speech bubble with a ticket's notched edges: the conversation is the ticket) | ✅ | Landing header and footer, sign-in, onboarding, invite pages |
| Browser-tab icon on every page, home-screen icon | ✅ | Any tab; titles read "Missions · Meld" and so on |
| Link-preview card (logo, tagline, agent faces) | ✅ | Paste https://meld-fawn.vercel.app into Slack, X or iMessage |
| Landing page redesign | ✅ | https://meld-fawn.vercel.app: hero with a product view, How it works, Product, Slack + Jira vs Meld, Security, closing call to action |

## Not built (honest list)

- Playbook trigger "message in #channel matching a keyword" (label and status triggers work).
- Search on phones (Cmd+K is desktop only).
- Jumping to a very old pinned or searched message (beyond the latest 100 conversations) doesn't scroll to it.
- @mentions inside ticket comments don't notify anyone.
- Editing a message doesn't re-run the agents on the new text.

## Recording tips

- Use a **fresh** "Try the live demo" for each take. Each is a private copy, and everything above is seeded fresh.
- The reminder seeded to fire about 3 minutes after the demo opens is a nice surprise mid-take: it appears in your Atlas DM.
- Agent replies stream in with a "working" bubble. Trim the waiting in the edit, but keep a beat of it, because it shows the agents really work.
- Agent handles: **@atlas, @tess, @rex, @sunny**.
