# Prompt: Meld 2D animated product video

Paste everything below the line into Claude Code, opened in this repository.

---

Make a 2-minute 2D animated product video for **Meld**. It will be shown to hackathon judges, who are venture investors. Build it with **Remotion** (React, renders to MP4) in a new folder `video/` at the repo root. Don't change anything outside `video/`.

## What Meld is

Meld is team chat and tickets in one place, with AI agents as teammates who turn conversation into owned work. Think Slack and Jira in one app, with agents who listen, file, update, remind and follow up.

- **Feature list:** `docs/FEATURES.md` is the source of truth. Animate only features listed there as ✅. Don't invent features, numbers or customers.
- **Messages:** where a scene shows a chat message, use the exact sample text from `docs/FEATURES.md` (the "Show it (type exactly)" columns).
- **Live product:** https://meld-fawn.vercel.app. Click **Try the live demo** to see the real UI if you need a visual reference.

## The story (one sentence)

Work is decided in chat and lost before it reaches the tracker. In Meld, agents catch it as it's said and turn it into tickets, decisions and follow-ups, with Undo on everything.

## Look and feel

- **Style:** flat 2D, clean and calm, closer to a Stripe or Linear launch video than a cartoon. White and very light grey surfaces, thin borders, soft shadows. Animate simplified mockups of the Meld UI (chat column, thread, ticket card, board, mission board), not screenshots.
- **Brand:**
  - **Color:** brand blue `#2952E3` for highlights, buttons and the active state. Text `#17191C`, light grey `#ECEEF1` for chips. Never use other accent colors, except status colors on tickets (green for Done, amber for At risk).
  - **Font:** Inter (`@remotion/google-fonts/Inter`).
  - **Logo:** `public/brand/meld-logo.svg` and the mark `public/brand/meld-mark.svg`. The mark is a speech bubble with a ticket's notched edges ("the conversation is the ticket"). Use that idea in the logo reveal: a chat bubble whose sides notch in and become the mark.
- **Characters:** use the real avatar SVGs in `public/avatars/` (copy them into `video/public/`).
  - **Agents:**
    - Atlas: `agent-atlas.svg` (lead agent)
    - Tess: `agent-tess.svg` (triage)
    - Rex: `agent-rex.svg` (reviews)
    - Sunny: `agent-sunny.svg` (standups)
  - **People (Orbit Labs):** Alex Rivera (founder, "you"), Maya Chen (design), Jonas Weber (backend), Priya Raman (frontend), Tom Okafor (growth), Sofia Rossi (product). Use the `person-*.svg` files.
  - **Matching faces:** to match the app, read `avatarSrc()` in `src/components/common/avatar.tsx`. If that's too fiddly, pick six distinct person files and keep them consistent across the video.
  - **Shapes:** agents are always shown in round frames and people in rounded squares, as in the app.
- **Motion:**
  - Messages pop in with a small spring.
  - The agent "working" bubble shows three dots.
  - Tickets fly out of the message that created them and land on a board.
  - Status chips change color.
  - An **Undo** chip appears after every agent action.
  - Keep cuts on the beat. Nothing should feel rushed: hold each payoff for at least 1.5 s.
- **No third-party logos:** for the "before" scene, draw a generic chat app and a generic ticket tracker. Don't use Slack, Jira or any other product's logo or look. The words "Slack + Jira" may appear as text.
- **Format:** 1920×1080, 30 fps, about 120 s. Also render a 1080×1920 vertical cut only if it's easy; it's optional.

## Scenes and timing

Each scene shows on-screen captions, short, in Inter semibold. The video must work muted. A separate voiceover script is written alongside it (see Deliverables).

| # | Time | Scene | What happens | Caption / voiceover |
|---|---|---|---|---|
| 1 | 0–8 s | Cold open | Chat bubbles stream past fast: "I'll do it by Friday", "let's go with the sidebar card", "who owns the Stripe keys?". They scroll up and fade out, and a few dissolve into dust. | "Most of a team's work is decided in chat." / "…and then it's lost." |
| 2 | 8–18 s | The problem | Split screen: a generic chat app and a generic ticket tracker. A person copies text from one to the other by hand. The tracker's tickets turn grey and "stale". A decision gets asked again ("wait, didn't we decide this?"). | "Chat and tickets live apart. Decisions get re-argued. Tickets go stale." |
| 3 | 18–26 s | Logo reveal | The two windows slide together. A chat bubble's sides notch into the Meld mark, and the wordmark appears. | "Meld. Chat and tickets in one place, with AI agents as teammates." |
| 4 | 26–36 s | Meet the team | Orbit Labs, two weeks from launching paid plans. The six people line up, then the four agents join them, each with a role label: Atlas (lead), Tess (triage), Rex (reviews), Sunny (standups). | "Your agents are members of the team, with names, jobs and access, just like people." |
| 5 | 36–48 s | Listener: chat becomes work | #product. Alex types "I'll write the investor update and send it out by Friday". A ticket flies out, assigned to Alex and due Friday. Next, "Recorded the 2-minute demo video, it's up for review now" moves ORB-13 to **In review**. Each change gets an Undo chip. | "Say it in chat. The ticket updates itself." |
| 6 | 48–58 s | Decision memory | #design. A thread gets a 📌 and is logged on the Decisions page with the "why". Later, someone proposes "What if we make the onboarding checklist a modal on first login instead?". Atlas replies: "Heads-up: the team already decided this…", with a link back to the thread. | "Meld remembers what you decided, and why." |
| 7 | 58–68 s | Thread → tickets | The "Q4 launch plan" thread. "@atlas turn this thread into tickets and assign everyone" brings up a **Confirm** card. Click it, and tickets fan out to each person's face. | "One message turns a plan into owned work." |
| 8 | 68–78 s | Agents act on their own | #engineering, nobody tagged: "Checkout is broken on Safari: the Pay button does nothing after the card form loads". Tess reacts 👀 and files a ticket labeled bug and billing, priority High, owner Jonas. Next, a keyword playbook: "We have an outage: login is failing for some users". Tess opens an incident, Rex lists the checks and rollback plan, and Atlas posts a status update, as 3 steps chaining in one thread. | "Agents don't wait to be asked. They triage, review and run playbooks." |
| 9 | 78–90 s | Missions | Goal: "Launch paid plans". A plan streams in task by task. A check-in finds that ORB-5 slipped, and the mission turns **At risk** (amber). The "Needs you" card says move the date or cut scope. Clicking **Cut ORB-9** puts it back **On track** (green). | "Give agents a goal. They plan it, track it and ask you only when it matters." |
| 10 | 90–102 s | Always on (fast montage, about 3 s each) | (a) Atlas follows up on an unanswered question. (b) A ⏰ reminder lands. (c) Sunny's morning digest. (d) The workload balancer: "Priya has 5 open tickets. Reassign to Jonas?" with Confirm. Optional: meeting notes become decisions and tickets, and "@rex" in a ticket comment gets an answer as a comment. | "Follow-ups, reminders, digests, workload: handled." |
| 11 | 102–110 s | Trust | Icons appear one by one: **Undo** on every agent action, roles (owner, member, guest), "agents act with your access", "32/32 eval cases". | "Every action can be undone. Agents only see what you can see." |
| 12 | 110–120 s | Close | The Meld logo on white. Line: "Slack + Jira, with teammates who do the work." Below it: **meld-fawn.vercel.app**, then "Try the live demo. No sign-up." | Same as the on-screen text. |

If you need to trim, shorten scene 10 first, then scene 2. Keep scenes 5, 6 and 9: they're the story.

## Build notes

- `npx create-video@latest` (blank template, TypeScript), or set Remotion up by hand in `video/`. Use one composition per scene, plus a `Main` composition that sequences them with `<Series>` and short cross-fades.
- Build reusable pieces:
  - `ChatWindow`, `Message` (avatar, name, time, text, reactions)
  - `AgentWorking` (three dots)
  - `TicketCard` (id, title, status chip, assignee face, due)
  - `Board` (To do, In progress, In review, Done)
  - `ConfirmCard`, `UndoChip`, `MissionCard`, `Caption`
- Animate with `spring()` and `interpolate()`. No CSS animations; they don't render deterministically.
- Render with `npx remotion render Main out/meld.mp4`. Also render stills of each scene's key frame (`npx remotion still`), check them yourself for overlap, cut-off text and contrast, and fix what you find before the final render.
- Leave an empty audio slot for music (`video/public/music.mp3`, optional, not committed). The video must not depend on it.

## Deliverables

1. `video/out/meld.mp4`, about 120 s, 1080p.
2. `video/out/stills/` with one PNG per scene.
3. `video/VOICEOVER.md` with the voiceover script, timed per scene, at about 2.3 words per second. It must fit the timings above. The tone is calm and confident, with no hype words ("revolutionary", "game-changing").
4. `video/out/meld.srt` with captions matching the voiceover.
5. A short note on anything you couldn't do and how to change the timing or text (where each scene's copy lives).
