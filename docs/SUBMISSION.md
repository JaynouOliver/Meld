# Hackathon submission answers (Meta AI Developer Hackathon)

Form: cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit. Sign in with jyb2084.usa@gmail.com.
Deadline: Wed 4 Nov, 9:00 PM ET (7:30 AM IST, Thu 5 Nov).

Each answer is ready to paste. Lines in *italics* are notes for you, not part of the answer.

---

## 1. Team Name (required)

Meld

## 2. Team Members (optional)

*You're listed by default. Add teammates only if they have Cerebral Valley accounts.*

## 3. Track (required)

**Startups Track**

*Meld is a product aimed at a market, with a business case, and the judges are investors. If the Startups track requires an incorporated company or funding and you have neither, pick Indie Developer Track instead. The rest of the answers work for either.*

## 4. Problem statement (required)

**Build for Your World**

*Meld solves an everyday problem for real teams: work decided in chat is lost before it reaches the tracker. "Push the Frontier" fits better only if that statement is about new model capabilities or research.*

## 5. Most Viral Track X post link (optional)

*Leave blank unless you post the demo video on X and want to compete for Most Viral.*

## 6. Project Description (required)

Meld is team chat and tickets in one app, with AI agents as teammates who turn conversation into owned work.

**The problem.** Teams decide things in Slack and track them in Jira, and the gap between the two loses work. "I'll do it by Friday" never becomes a ticket. A ticket says "To do" a week after someone said "it's done". A decision made in a thread gets argued again two weeks later because nobody can find it. Today's AI add-ons answer questions when you ask; they don't keep the work true.

**What Meld does.** Agents are members of the workspace, with names, faces, jobs and the same access rules as people:
- **Atlas** (lead) answers questions about the work with links to sources, turns a thread into assigned tickets, plans missions, and remembers decisions.
- **Tess** triages: she files bugs she sees in chat without being asked, and labels, prioritizes and assigns new tickets.
- **Rex** reviews tickets assigned to him and answers @mentions in ticket comments.
- **Sunny** posts standups and a daily digest.

**What happens without anyone asking:**
- **Chat updates tickets.** "Recorded the demo video, it's up for review now" moves the ticket to In review. "I'll write the investor update by Friday" creates a ticket due Friday.
- **Decisions are remembered.** When a thread settles a decision, Atlas logs it with the reason and the options rejected. If someone later proposes the opposite, Atlas replies: "the team already decided this on Monday (Maya, Priya), here's why", with a link to the original thread.
- **Missions.** Give Atlas a goal ("Launch paid plans"). It plans tickets with owners and dates, checks in, re-plans when work slips, and asks you only when a human decision is needed ("move the date or cut ORB-9?").
- **Proactive help.** Follow-ups on questions nobody answered, reminders, links to the same discussion in another channel, a workload balancer ("Priya has 5 open tickets and is out Monday; reassign to Jonas?"), meeting notes turned into decisions and tickets, and playbooks (when someone writes "outage" in #engineering, Tess opens an incident, Rex lists checks and a rollback plan, and Atlas posts a status update).

**Trust.** Every agent change can be undone. Agents act with the permissions of the person who asked, so a guest's request can't touch tickets the guest can't see. Risky changes wait for a Confirm card. Small talk gets no reply.

**Underneath it's a full Slack and Jira replacement:**
- **Chat:** channels, DMs, threads, reactions, pins, edits, search (desktop and phone), and real-time updates.
- **Tickets:** a table with saved views and filters, a Kanban board, labels, due dates, points, checklists, comments with @mentions, blockers, and insights.
- **Workspaces:** roles and invites.

**Try it:** https://meld-fawn.vercel.app, then **Try the live demo**. No sign-up. In about 5 seconds you get a private copy of a startup's workspace. It opens on a #tour channel with a card for every feature and the exact text to type.

Built in four days (Nov 1–4) with Next.js, Supabase and the Meta Model API (Muse Spark).

## 7. Public GitHub Repository (required)

https://github.com/JaynouOliver/Meld

*It's public. Checked.*

## 8. 3-Minute Demo Video (required)

*Paste your YouTube link. Make sure the video is Public or Unlisted, not Private, and no longer than 3 minutes.*

## 9. Describe your use of Meta products to build the submitted project (required)

Every agent in Meld runs on the Meta Model API. We call it through its OpenAI-compatible Chat Completions endpoint with the OpenAI SDK, server-side only.

We use two Muse Spark models, chosen by our own evals:
- **Muse Spark 1.3** powers the agents that reason and act. That includes Atlas's chat agent (tool calling with streamed replies), the mission planner and check-ins, meeting notes, thread summaries, "What did I miss?" and Sunny's digest.
  - Atlas works through tools: searching messages, tickets and decisions; creating, updating and commenting on tickets; remembering facts; setting reminders; and starting missions.
  - Every write goes through our action layer, so it's permission-checked and can be undone.
- **Muse Spark 1.2** handles the checks that run on every message: the listener (does this message settle a decision, go against one, report progress on a ticket, or commit to new work?) and ticket triage.
  - On our 28-case listener eval it matched 1.3 (28/28) at about 2.3 times the speed, so the listener answers in about a second.
  - We kept Atlas on 1.3 because 1.2 failed a permissions case in our 32-case Atlas eval.

API features we rely on:
- **`reasoning_effort`:** "minimal" for questions and planning, "low" when Atlas is about to change data. Combined with streaming, this cut mission planning from 31 seconds to about 8, with tasks appearing one by one.
- **`prompt_cache_key`** per workspace, so the long shared prompt prefix is reused across calls.
- **Tool calling and streaming** for Atlas.

What we built around the models to make them dependable:
- **Evals:**
  - 32 Atlas cases covering questions, thread-to-tickets, permissions and decisions. All pass.
  - 28 listener cases.
  - A prefilter eval.
- **Cost control:** a free prefilter skips most chat ("lunch?", "sounds good") before any model call. A message that passes gets exactly one model call.
- **Guardrails:**
  - A 15-second timeout with retries.
  - Malformed tool arguments are repaired, and the model is asked to retry.
  - A self-check catches a reply that claims an action without calling the tool.
  - Everything the model proposes is validated against the real tickets, people, dates and permissions before anything changes.

## 10. Why are Meta's models important to your solution? (required)

Meld's main promise is that agents listen to every message and keep tickets and decisions up to date without being asked. That only works if the model is fast, cheap and accurate enough to run on every message. If it isn't, you get a bot that's either slow or noisy.

The Muse Spark family gives us two tiers on one API:
- **Muse Spark 1.2** is fast enough to read every message in about a second, and it matched 1.3's accuracy on our listener eval.
- **Muse Spark 1.3** handles the steps that need real reasoning and tool use: turning a thread into tickets for the right people, planning a mission, and respecting permissions.

Being able to set reasoning effort per call lets us spend thinking only where a mistake would cost something. The OpenAI-compatible API meant the agents ran on day one with the SDK we already used.

The models are the teammates. Without them, Meld is just another chat app.

## 11. Feedback on partner technologies (optional, short)

*Leave blank: Meld doesn't use the listed partners (Fireworks, Modal, Baseten). If you want to say something about the Meta Model API itself:*

The OpenAI-compatible endpoint made setup easy. Latency varied a lot between identical calls (4 s to 42 s), so we added timeouts and retries.

## Ratings

*These are your opinions; below is what the build experience supports.*

12. How likely are you to build with Meta Model API: **Very likely** *(the whole product runs on it)*
13. Overall opinion of Meta Model API: **Somewhat favorable** *(fast and capable, but latency varied a lot; pick Very favorable if that's how you feel)*

## 14. Marketing permission (optional checkbox)

*Your call. Ticking it lets Meta and Cerebral Valley publish and promote your video, description and screenshots on their sites and social media. For a startup that's usually free exposure, and the repo is already public. Leave it unticked if you'd rather control where the video appears.*

## 15. Recommend the Meta Model API (0–5, optional)

**4**

## 16. Recommend Muse Code (0–5, optional)

*Leave blank: Meld was built with Claude Code, not Muse Code.*

## Feedback (all optional)

17. Biggest obstacle: **Slow responses** *(the same call took 4 s once and 42 s another time, and planning took 31 s before we added streaming and lower effort. Alternative: "The model not following our instructions", for Atlas claiming actions without calling the tool.)*
18. Compared with other models: **We've used other models but couldn't make a clear comparison** *(we only compared Muse Spark models with each other)*
19. What matters most: **Agent abilities such as tool calling and multi-step tasks**
20. Hardest part of switching: **Our product is tuned to our current model's behavior and prompts** *(prompts, evals and the choice of model per task are tuned to Muse Spark)*
21. What would stop production use: **Reliability or uptime** *(the latency spikes; or "Rate limits or capacity too low for real traffic", since the listener reads every message)*

---

## Before you click Submit

- [ ] The video is on YouTube, Public or Unlisted, 3 minutes or less, and the link opens in a private window.
- [ ] https://meld-fawn.vercel.app → **Try the live demo** works (checked today, opens in about 5 s).
- [ ] The repo is public: https://github.com/JaynouOliver/Meld (checked).
- [ ] Signed in as jyb2084.usa@gmail.com.
- [ ] Finish in one sitting: the form may not save drafts.
