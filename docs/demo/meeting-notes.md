# Demo log: meeting notes to actions

## Meeting notes to actions

**Status:** built.

**What it does:** paste a meeting's notes or transcript into a channel and Atlas posts one message: a short summary, the decisions (logged to the decision log), the action items with owners and due dates, and the open questions, with @mentions. The action items wait on a confirm card, so one click files every ticket, with Undo. Owners are matched to real people, dates are checked, and open tickets are reused instead of duplicated.

**Where it shows in the seeded demo:**
- **#product:** Atlas's "Notes: Pricing sync, <yesterday's date>" message, posted about 35 minutes ago, near the bottom of the channel. It has a summary, 3 decisions, 5 action items and 2 open questions. Four action items were filed as tickets (the next ids after the other seeds, shown as ticket chips): Jonas (Stripe prices), Priya (gate team links), Sofia (beta user email) and Tom (comparison table). The fifth, Maya's pricing page, is shown as "already tracked in ORB-5": the reuse in action. The card under it reads "Applied".
- **Decisions page:** "Paid plan prices", "Team links plan gating" and "Beta user pricing", each with why, what wasn't chosen and who decided, linked to #product.
- **Tickets:** the four filed tickets, assigned with due dates, reporter Atlas, and descriptions that say which meeting they came from.

**Show it live (about 20 seconds of waiting):**
1. Open **#product**.
2. In the composer, click the notebook icon (third button on the left, tooltip "Add meeting notes").
3. Meeting title: `Q4 launch sync`. Paste the transcript below into "Notes or transcript". Click **Process notes**.
4. The dialog closes and Atlas shows "On it · Reading the notes", then the live count ("2 decisions, 3 action items so far"). After about 12 to 20 seconds the "Notes: Q4 launch sync" message lands:
   - 3 decisions: launch on the 18th with a scope freeze this Friday; $20 referral credit for both sides (free months rejected); onboarding A/B test, 3-step vs 4-step checklist, two weeks, new signups, 50/50.
   - 4 new action items: @Tom referral terms and FAQ (next Wednesday), @Maya invite screen mocks (Friday), @Priya A/B test flag and tracking (Thursday), @Sofia launch-day changelog (Monday). Usually also @Jonas Stripe webhooks "already tracked in ORB-4" (reused, not duplicated).
   - 2 open questions: do referral credits expire; @Tom announce referrals on launch day or a week later.
5. Click **Confirm** on the card: the tickets are filed (the ids in the message become ticket chips; check **All tickets**). **Undo** removes them again.
6. Open **Decisions**: the three new decisions are at the top.
7. Optional, to show the decisions are enforced: in #product type `Let's put team scheduling links on the Free plan too, so more people try them`. In about 3 seconds Atlas replies in a thread: "Heads-up: the team already decided this on … Team scheduling links are on the Team plan only …" with a link back to the notes message (the existing decision guard, fed by the seeded meeting).

**Agent path (about 30 seconds):** in #product, type:

`@atlas here are the notes from today's design sync: Maya and Priya agreed the invite screen uses a single share link, not email invites, because it's faster to build. Maya will send the final invite mocks by Friday. Priya builds the share-link screen by next Tuesday. Open question for Tom: do we show the referral credit balance in Settings?`

Atlas posts "Notes: design sync" (1 decision, 2 action items to confirm, 1 open question for @Tom), then replies in one line ("Confirm below to file both tickets for Maya and Priya.").

**Transcript to paste (verbatim):**

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

**Known limits:**
- The model does the reading, so the wording of decisions and titles changes slightly from run to run. Everything it returns is checked: an owner it can't match goes to the person who shared the notes (marked "no owner named"), a date that isn't real or is in the past is dropped, an unknown team falls back to the owner's team.
- Reuse matches an open ticket the model names, or a ticket whose title says the same thing. A loosely related ticket isn't reused.
- The chat composer is one line, so a transcript pasted into "@atlas …" arrives as one paragraph. Use the dialog for long transcripts.
- Decisions are logged when the notes are posted, not on Confirm (they were made in the meeting). Reopen one on the Decisions page if it's wrong.
- Members file tickets only in their own team: items for other teams are moved to theirs. Guests can't add notes.
- At most 6 decisions, 10 action items and 5 questions per meeting, and 30,000 characters of notes.
