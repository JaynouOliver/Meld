# Proactive Atlas: demo log

Three things Atlas now does without being asked. All three are in the Orbit Labs sandbox ("Try the live demo") the moment it opens.

## 1. Follow-ups on unanswered questions

**Status:** built.

**What it does:** When someone asks a teammate (or the channel) a direct question, such as "@Jonas can you send the keys?" or "Maya, any ETA?", Atlas tracks it quietly. If the person asked hasn't answered in that thread or channel within 24 hours, Atlas posts one gentle follow-up in the thread: "@Maya, Tom's question about the ETA for final pricing is still open." Atlas follows up once at most. A reply from the person asked closes the question for good.

**In the seeded demo:**
- **Already posted:** in #design, open the "Where should the onboarding checklist live?" thread (6 replies). Maya asked Priya about the sidebar card at 1280px a day ago. Atlas's follow-up is the last reply.
- **Due now:** in #growth, Tom's "Maya, any ETA?" has no replies yet. It's due, so the next sweep posts the follow-up.

**Live on camera:**
1. Open #engineering, click Atlas's avatar on any Atlas message to open the profile card, then click **Check follow-ups now**. The card says "Followed up on 1 open question." Open #growth: Tom's message now has "1 reply" from Atlas, "@Maya, Tom's question about the ETA for final pricing (ORB-5) is still open." This takes about 1 second.
   - Sending any message in the sandbox also starts this sweep in the background (at most once a minute), so the #growth follow-up may already be there.
2. To track a new question live, type this in #engineering: `@Jonas can you send me the Stripe test keys before Friday?` Nothing shows: the question is tracked in the background, about 2 to 4 seconds after sending. Wait at least 1 minute, then click **Check follow-ups now** again. The message gets a thread reply: "@Jonas, Alex's question about the Stripe test keys is still open."
   - "Check follow-ups now" counts questions that are at least a minute old. The automatic sweep waits the full 24 hours.

**Known limits:**
- Questions are detected only in channels where Atlas reads along, and only in messages that don't tag an agent.
- Detection relies on the listener's model call, which is the same single call per message as before.
- A question to the whole channel counts as answered by any thread reply from someone else.
- Without an always-on worker, the 24-hour follow-up is posted by the next sweep after it's due. A sweep runs on the next message anyone posts, or when someone clicks the button.

## 2. Linked threads

**Status:** built.

**What it does:** When a new conversation starts on the same topic as one active in another channel this week, Atlas replies once in the new thread: "Related: this is also being discussed in #engineering", plus the first sentence of that conversation and a jump chip that opens it. A free word-overlap filter picks at most one candidate, and the listener's existing model call confirms it's really the same topic. The same pair of conversations is never linked twice.

**In the seeded demo:** in #design, Maya's "Pricing page v2 mocks are in Figma" thread has Atlas's reply linking to Tom's pricing message in #growth. Click the "#growth" chip to jump there.

**Live on camera:** in #product, type `Has anyone tested the Google Calendar sync with recurring events yet? Beta customers keep asking about it.` After about 3 to 5 seconds, the message gets "1 reply" from Atlas: "Related: this is also being discussed in #engineering. Jonas: "Calendar sync (ORB-1) is in PR #214."" plus a chip. Clicking the chip jumps to Jonas's message. Sending the same message again links nothing, because that pair is already linked.

**Known limits:**
- Atlas only links new top-level messages, not thread replies.
- It only links to channels Atlas reads, and only conversations active in the last 7 days.
- The candidate filter needs at least 3 shared topic words, so it favors precision over recall: very short messages never link.

## 3. Workload balancer

**Status:** built.

**What it does:** When a ticket is assigned to someone who already has 5 or more open tickets, or who a team memory says is out on its due date, Atlas suggests a better owner: the teammate on the same team with the fewest open tickets who isn't out that day. The suggestion is a confirm card, so one click on **Confirm** reassigns the ticket, with Undo. Atlas suggests at most once per ticket and person, and never when you assign a ticket to yourself. No model call is needed.

**In the seeded demo:** Priya has 5 open tickets, and the team memory says "Priya Raman is out on Monday." (see Atlas's memory in the agent dialog). In #engineering, the last Atlas message is a pending suggestion: "Priya now has 5 open tickets. Jonas has 2 open on Engineering. Reassign ORB-17 to Jonas?" with Confirm and Cancel.

**Live on camera:**
1. Go to All tickets, open **ORB-18 "Booking confirmation email template"** (assigned to you, due next Monday) and set Assignee to **Priya Raman**.
2. Open #engineering. Under "Update on ORB-18: Alex Rivera assigned it to Priya Raman." Atlas posts: "Priya now has 6 open tickets and is out on Mon, Nov 9, the due date ("Priya Raman is out on Monday"). Jonas has 2 open on Engineering. Reassign ORB-18 to Jonas?" This is instant.
3. Click **Confirm**. ORB-18 is now assigned to Jonas Weber, with "Applied · Undo".

**Known limits:**
- "Out" is read from team memories that name the person plus an away word (out, off, OOO, vacation, leave…) and a weekday, an ISO date or a date like "Nov 12".
  - A single weekday means the next one after the memory was written.
  - A plural weekday ("Fridays") means every week.
- Teams come from the ticket's team, falling back to the assignee's team.
- The previous owner is never suggested.
- Each assignment change to a person costs one extra ticket read, to detect the change.
