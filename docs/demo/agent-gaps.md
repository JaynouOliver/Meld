# Agent gaps: demo log

## 1. @mentions in ticket comments

**Status:** built.

**What it does:** a ticket comment that @mentions someone now does something. A person ("@Jonas", "@Jonas Weber") gets a short notice from Atlas in their Atlas DM with the ticket chip and the comment. An agent ("@rex", "@atlas", "@tess") wakes up on the ticket: it reads the ticket and its discussion and answers back in the comments, within about 20-30 seconds, acting with the commenter's permissions. Works the same whether the comment comes from a person in the ticket panel or from an agent (comment_on_ticket).

**Where it shows in the seeded demo:**
- **ORB-4 "Stripe webhooks for plan upgrades"** (All tickets → click it, scroll to Comments): Jonas asks "@Alex retries are in… Is that window OK for billing support?", Alex asks "@rex is three retries enough, or could a retry charge someone twice?", and Rex's answer is right under it as a comment.
- **Atlas DM** (sidebar → Agents → Atlas, first message): "Jonas Weber mentioned you on ORB-4 Stripe webhooks for plan upgrades: “@Alex retries are in…”".

**Live on camera (about 25 seconds):**
1. All tickets → click **ORB-4 Stripe webhooks for plan upgrades**. Scroll the panel to Comments.
2. Type `@rex what is the riskiest part of shipping the subscription.updated handler this week?` and click **Comment** (or Cmd+Enter).
3. Rex's answer appears as a new comment in the panel in about 20-30 s (no refresh), addressed to @Alex, with the concrete risks for this ticket. Seen in a real run: 25 s, three risks with fixes, citing ORB-7.
4. Atlas also tells you in your Atlas DM ("Rex mentioned you on ORB-4: …"), because Rex's answer @mentions you. Rex is read-only, so his reply also lands in your DM with Rex (the run's conversation).
5. Optional, people: comment `@Jonas Weber can you confirm the plan field ships tomorrow?`. Jonas gets the notice in his Atlas DM (you can't see his DM as Alex; the server log shows "told Jonas").

**Known limits:**
- One notice per person per comment; never for your own name; nobody is told about a ticket their role can't see.
- First names resolve only when one person has that first name; otherwise use the full name ("@Jonas Weber"). Agents resolve by handle.
- Agent runs need the model; at most 3 agents per comment. Loops stop at the usual depth cap (3 hops) and per-chat rate limit, and an agent's comment never wakes itself.
- A read-only agent (Rex, Sunny) can't call comment_on_ticket, so Meld posts its reply on the ticket as its comment. Write-capable agents (Atlas, Tess) comment themselves, with Undo on their action card.
- The run works in the ticket's watch thread when it has one the agent reads, else in the agent's DM with you; that's also where its one-line "Replied on ORB-4" (or, for read-only agents, the full answer) shows.
- The "View as role" preview isn't applied: the agent acts with your real role.
- MCP (external) agents aren't woken by comments.

## 2. Playbook keyword trigger

**Status:** built.

**What it does:** a playbook can now start from a message: "when someone writes *outage* in #engineering". Whole words or a phrase, any case, only messages from people (agents can't start it), once per message. The steps run in that message's thread, each agent posting under a "Playbook: Incident · step N of 3" header, with the message as its context. While a playbook takes a message, lurking agents stay quiet so the thread doesn't get two answers.

**Where it shows in the seeded demo:**
- Sidebar → **Playbooks**: "Incident" (When someone writes "outage" in #engineering: Tess opens an incident ticket with severity and owner → Rex lists the first 3 checks and the rollback plan → Atlas posts a status update for #general), On, with one completed run showing Jonas's message.
- #engineering → Jonas's "Calendar sync outage: Google push notifications started failing with 401s…" thread (8 replies): the three steps, Jonas's fix and Priya closing it. Tess's incident ticket is **ORB-25** (Done).

**Live on camera (about 35 seconds for all three steps):**
1. Open **#engineering**.
2. Type `We have an outage: login is failing for some users` and press **Enter**.
3. Within a few seconds a thread starts under your message: Tess posts step 1 and opens an incident ticket (e.g. ORB-29 "Investigate login failures for some users", High, with an owner; ticket chip on her post) (~10 s). Rex posts step 2: three checks and the rollback plan (~10 s). Atlas posts step 3: a status update for #general (~13 s). Seen in a real run: 34 s end to end.
4. Sidebar → **Playbooks**: the Incident card's Recent runs shows "Alex “We have an outage: login is failing for some users” · Completed". Click it to jump to the thread.
5. Optional: **Edit** (pencil) on Incident shows the new trigger: When "A message in a channel says…", Keyword or phrase, In channel.

**Known limits:**
- Whole-word match: "outage" doesn't match "outages"; add another playbook for a second keyword. A phrase must keep its words together ("login failing" doesn't match "login is failing").
- Every step's agent must be in the channel (else the run shows "Stopped" with why). Atlas's #general update is posted in the incident thread, ready to share; it isn't cross-posted to #general.
- Keyword playbooks are cached for 20 s per server instance, so an edit can take up to 20 s to apply on another instance.
- Ticket playbooks (labeled / moved to) are unchanged.
- Needs the model (no model: messages don't start playbooks).

## Fixed along the way

Tickets assigned to an agent (Rex, Tess) were never picked up in the app: once automation wrapped the store, the assignment layer's "is this the request's store?" check never matched. Store layers now record what they wrap, so assignment pick-up, automation and comment mentions all react to the request's writes.
