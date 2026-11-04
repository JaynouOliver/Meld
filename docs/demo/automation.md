# Workflow automation: demo log

## 1. Auto-triage of new tickets

**Status:** built.

**What it does:** when a person creates a ticket, Tess (the triage agent; Atlas if the workspace has no triage agent) fills it in within a few seconds: labels picked from the ones the workspace already uses, priority, the best owner (who owns similar work, on the right team, fewest open) and a due date only when the text names one. It never overwrites a field the person set. The change is one undoable action: the ticket shows a "Triaged by Tess" note with the reason and an Undo button, and the activity reads "Tess triaged it: labels billing, bug · priority High · owner Jonas (owns Stripe webhooks)".

**Where it shows in the seeded demo:**
- ORB-15 "Outlook calendar sync": "Triaged by Tess · labels integrations · owner Jonas (owns calendar sync)" under the title.
- ORB-16 "Booking page shows wrong time for invitees after DST": triaged (labels bug, priority High), which started the Bug intake playbook (see 2). Its #engineering thread has Tess's "Triaged ORB-16" post.

**Live on camera (about 5 seconds):**
1. Tickets (All tickets) → click **New ticket** (top right).
2. The panel opens with the cursor in the title. Type `Checkout fails for EU cards with 3DS` and press **Enter**.
3. Within 2-5 s, the note "Tess is triaging…" becomes "Triaged by Tess · labels billing, bug · priority High · owner Jonas (owns Stripe webhooks)" with a one-line reason, and the Priority, Assignee and Labels fields fill in. Seen in real runs: billing + bug, High, Jonas, every time.
4. Optional: click **Undo** on the note: the fields go back and the activity says "Alex Rivera undid Tess's triage".

Other good titles: `Pricing page copy has a typo in the annual plan` (→ design label, Low, Maya), `Google sync drops recurring event exceptions by Friday` (→ bug + integrations, High, Jonas, due Friday).

**Known limits:**
- Triggers on the ticket panel's New ticket (when the title is first saved) and the listener's commitment tickets ("I'll write the release notes by Friday"); for commitments the speaker stays the owner and their date stands, so only labels and priority are filled. Tickets Atlas creates in a run (thread → tickets), mission tickets and MCP agents' tickets are not triaged.
- Labels come only from labels already used in the workspace; an empty workspace gets no labels.
- Undo lasts 10 minutes (like every agent action). A field someone changed after triage is left alone by Undo.
- Team isn't changed (a ticket filed from Product stays in Product).

## 2. Agent playbooks

**Status:** built ("ticket labeled X" and "ticket moved to status Y" triggers; the optional "message in #channel matching a keyword" trigger is not built).

**What it does:** a playbook is a trigger plus ordered steps, each an agent with an instruction. When it fires, each step runs as a normal agent run in the ticket's thread (or a new thread in the playbook's channel), under a header like "Playbook: Bug intake · step 2 of 3"; the next step starts when the previous agent has posted. Governed like all agent work: depth and per-channel rate limits, once per event, and a playbook's own changes never start a playbook (no loops).

**Where it shows in the seeded demo:**
- Sidebar → **Playbooks**: "Bug intake" (When a ticket is labeled bug: Tess confirms repro and severity → Rex assesses rollout risk → Atlas assigns the owner and posts a summary), On, with one completed run on ORB-16.
- #engineering → Priya's "Invitees in Berlin see booking times an hour off…" thread (8 replies): Tess's triage post, then the three step headers and the agents' results.
- ORB-16 ticket panel: "Bug intake playbook · step 3 of 3 · Completed · View thread".

**Live on camera (about 1 minute for all three steps):**
1. Do the auto-triage demo above (`Checkout fails for EU cards with 3DS`). Tess labels it bug, which fires Bug intake (once: triage and the label trigger compose into a single run).
2. The ticket panel shows "Bug intake playbook · step 1 of 3 · Running" right away. Click **View thread** (or open #engineering): Tess posts step 1 (~15 s), then Rex step 2 (~15 s), then Atlas step 3 (~20 s), each under its "Playbook: Bug intake · step N of 3" header. Atlas may reassign the owner, with Undo on its card.
3. Sidebar → **Playbooks**: the new run is listed with its step progress, then "Completed".
- Alternative trigger: New ticket, add the label `bug` in the Labels field, then type a title and press Enter.
- Editing: on Playbooks, click the pencil on Bug intake to change the trigger (labeled… / moves to…), the channel, and the steps (agent + instruction, reorder, add, remove). The On/Off switch disables it. **New playbook** creates one, e.g. "When a ticket moves to In review → Rex: review the change for risks". People who aren't org owners see the page read-only.

**Known limits:**
- "Labeled X" runs at most once per ticket and playbook (however the label arrived); "moved to Y" runs on each move to Y.
- A step that fails or doesn't reply stops the playbook (shown as Stopped). Steps run back to back in one server function (up to its 5-minute limit); if that worker dies, the run sweep restarts the queued step when someone has the app open.
- All step agents must be able to read the ticket's watch channel or the playbook's channel; otherwise the run is recorded as Stopped with the reason.
- With no model configured, neither triage nor playbooks run.
