# Meld demo video: storyboard

Target: **about 2 minutes, 1920×1080, 30 fps, MP4.** Clean and confident, like a Linear or Stripe launch video. No stock footage and no AI clichés: no glowing gradients, sparkles, robots or "revolutionize". Use Meld's own palette: white and graphite, one blue accent `#2952E3`, and Inter or the system UI font.

## The one-line story

**Slack is where work gets talked about. Meld is where it gets done.** In Meld, AI agents are members of your team. They sit in your channels, turn conversation into owned, dated tickets, chase them, and drive goals to a deadline. They come to people only for the decisions people need to make.

## Value proposition (use these words on screen)

- **The problem.** Teams decide things in chat, and then the work falls through the cracks. Someone has to copy decisions into Jira or Linear, assign owners, chase updates, notice slips and re-plan. That glue work is a full-time job nobody has.
- **What Meld is.** Team chat with tickets built in, where AI agents are teammates, not bots.
- **How it differs from Slack plus a bot:**
  1. **Agents are members, not integrations.** They have names, live in channels, can be @mentioned and DM'd, and some listen in and act without being asked (Triage files a bug nobody tagged it on).
  2. **Conversation becomes owned work.** A thread turns into tickets with an owner for every person in it. Duplicates are caught, and blockers are tracked and announced.
  3. **Missions.** You give a goal and a date. Agents plan it into tasks with owners, due dates and dependencies, launch it, check in, re-plan when something slips, and escalate one clear decision to a human. Slack can't do this, and Jira doesn't know what was said.
  4. **Safe by default.** Agents act with the permissions of whoever asked, and proposed changes wait for a "Confirm".
- **Proof it's real.** Everything in the video is the live product at meld-fawn.vercel.app ("Try the live demo", no sign-up).

## Scenes

Clips are in `video/out/`. Times are seconds from the start of each clip, taken from `scenes.json` marks. Trim the waits for agents, but keep a beat of the live "working" bubble, because it shows the agents really run.

| # | Section | Clip, and the part to use | On-screen text (lower third, or a title card before the clip) |
|---|---|---|---|
| 0 | **Cold open** (title card, ~6 s) | none | "Your team decides things in chat. / Then someone has to make them happen." Then the Meld wordmark: "Team chat where AI agents are teammates." |
| 1 | **The problem** (motion-graphic card, ~8 s) | none | Animate a chat bubble "I'll do it by Thursday", then lines out to Jira, Spreadsheet, Reminder and Follow-up, each with a ✗. Caption: "Today: copy, assign, chase, re-plan, by hand." |
| 2 | **One click in** | `01-landing`, 0–3 s, then the click (~6.6 s) through "workspace ready" | "A real workspace. People, agents, work in flight." |
| 3 | **Agents are teammates** | `02-chat-ask-atlas`: the typing, the live bubble (keep ~2 s), the answer | "Ask in plain words. Atlas reads the channels and the tickets." Zoom into the answer's ticket chips. |
| 4 | **Thread → tickets** | `03-thread-to-tickets`: thread open, the ask, the proposal card, Confirm, Applied | "A planning thread becomes owned tickets. Nothing changes until you confirm." |
| 5 | **Agents that act on their own** | `04-triage-agent`: the bug message (nobody tagged), the Triage reply in the thread | "Nobody tagged it. Triage filed it, with repro steps." |
| 6 | **Agents with jobs** | `05-standup-agent`: the ask, then the standup appearing | "@standup: shipped, blocked, next. In seconds." |
| 7 | **Tickets and blockers** | `06-tickets-blockers`: table, the blocked ticket, ORB-4 set to Done, Insights | "Blockers tracked. Unblock one, and its owner hears about it." |
| 8 | **Catch-up** | `07-catch-up`: "What did I miss?" and the answer | "Back from a meeting? One click." |
| 9 | **Missions: the headline** (title card first: "Missions") | `08-missions-checkin`: board, Run check-in, At risk with the decision card, Cut, On track, the thread | Three beats: "A goal and a date. The agents own the plan." Then "Something slipped. Re-planned. One decision for a human." Then "Decided. Back on track." Slow zoom over the dependency graph and the "Needs you" card. |
| 10 | **A new mission** | `09-missions-new`: typing the goal, the plan streaming in, Launch | "Plans stream in: owners, dates, dependencies." |
| 11 | **Safe by design** | `10-roles`: switch to guest and back | "Agents act with the asker's permissions." |
| 12 | **Slack vs Meld** (comparison card, ~8 s) | none | Two columns. Slack: "Conversation", "Bots you configure", "Work tracked elsewhere", "You chase updates". Meld: "Conversation and the work", "Agents as teammates", "Tickets in the thread", "Agents chase, re-plan, escalate". |
| 13 | **Close** (~5 s) | none | "Meld. Where work gets done." Then "Try the live demo: meld-fawn.vercel.app" |

## Motion and editing notes

- Show each screen clip inside a subtle window frame on a light grey background (#F5F6F7) with a soft shadow, scaled to about 88%, so captions have room.
- Use slow push-ins (scale 1.0 → 1.12 over 3–4 s) on the moment that matters: the answer, the ticket card, the decision card, the At risk → On track badge. Ease in and out; no bouncing.
- Captions are a lower third: white card, 1px border, graphite text, 600-weight headline plus one smaller line. Fade and slide up 8px over 300 ms.
- Speed up the agent waiting to 2–3× but never cut it out completely. Trim dead time between actions.
- Music: calm, modern, low-key (royalty-free). Optional voiceover: read the on-screen lines.
- No fake UI. Every product shot comes from the clips.
