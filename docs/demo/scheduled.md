# Scheduled agent work: reminders and the daily digest

Branch `feature/scheduled`. Migration: `supabase/migrations/20261110100000_scheduled.sql` (new tables `reminders`, `channel_digests`, `member_time_zones` and two claim functions; additive). Seed: `src/server/seeds/scheduled.ts`.

There is no background worker. Due work is delivered lazily by whichever comes first: the open tab's once-a-minute `deliverDue` call, any `postMessage` / `getAgentRuns` request (via `after()`), or the weekday cron `/api/cron/scheduled`. Each reminder and each day's digest is claimed atomically, so it posts exactly once even when these run at the same time.

## 1. Reminders (built)

**What it does:** ask Atlas in plain words ("remind me tomorrow at 9 to send the deck", "remind #engineering Friday 10am to demo the webhooks", "remind Maya in 2 hours about the pricing mocks"). Atlas confirms with the exact time and posts "⏰ Reminder from …" when it's due: in the person's DM with Atlas, or in the channel. Times use the time zone your browser reports. If that isn't known yet, Atlas uses the workspace default or UTC and says which one it used. Upcoming reminders are listed on the You screen, where you can cancel them. Any message can also be turned into a reminder from its hover toolbar.

**In the seeded demo:**
- #engineering, last message: "⏰ Reminder from Jonas Weber: rotate the Stripe test-mode keys…" (a reminder that was already delivered).
- About **3 minutes after the sandbox is created**, a reminder the visitor set on Jonas's calendar-sync message arrives in their **Atlas** DM: "⏰ Reminder from you: test the calendar sync PR… (ORB-1)", with a link back to the message in #engineering.
- You screen (`/me`; the "You" tab on phones): upcoming reminders. One is the 3-minute reminder above, one is from Maya (tomorrow at 9:00 ET) and one is for #engineering (Friday at 10:00 ET). Each has a Cancel button.

**Show it live (about 1.5 minutes):**
1. Open #engineering and type: `@atlas remind me in 1 minute to check the board`
   → Within about 5 s, Atlas replies "Got it, I'll remind you at Wed, Nov 4, 12:31 PM EST."
2. Optionally also type: `@atlas remind #engineering Friday 10am to demo the webhooks` → "…at Fri, Nov 6, 10:00 AM EST." and `@atlas remind Maya in 2 hours about the pricing mocks`.
3. Click **Atlas** under Agents in the sidebar. About a minute later (the tab checks every 60 s), "⏰ Reminder from you: check the board" appears.
4. Hover any message, click the **alarm clock** icon, and choose "In 20 minutes", "In 1 hour", "Tomorrow at 9:00" or "Custom…". The popover confirms the exact time.
5. Go to `/me` → Reminders: the new reminders are listed. Click **Cancel** on one and it disappears (it will never be posted).

**Known limits:**
- Delivery can lag by up to about a minute while a tab is open. With no tab open, it waits for the next request in the workspace or the weekday cron (14:10 UTC).
- Each person's time zone comes from their browser the first time the app polls. The first zone reported becomes the workspace default.
- Reminders don't repeat ("every Monday" isn't supported).
- On desktop the You screen has no sidebar link; open `/me` directly.

## 2. Daily digest from Sunny (built)

**What it does:** each workday, on the first activity after 9:00 workspace time, Sunny (the standup agent) posts a digest in every channel she's in. It is built from live data:
- what shipped yesterday (since Friday on Mondays), across the workspace;
- what's in progress or in review;
- what's blocked, and by which open ticket and owner;
- what's due today or overdue, with an `@First` mention for each owner;
- who looks overloaded (13 or more open points, or 4 or more open tickets);
- open mission decisions and decisions logged since yesterday;
- mission progress.

Ticket ids render as chips. The facts are computed in code, and one quick model call (ATLAS_MODEL, minimal effort) adds a "Focus today" line. That line is checked against the data and falls back to a rule-based line if it mentions anything the data doesn't contain. Each channel gets at most one scheduled digest per day.

**In the seeded demo:**
- #product shows **yesterday's digest** from Sunny: blocked chain ORB-6 ← ORB-5, ORB-7 ← ORB-4, ORB-5 due with @Maya, Priya and Jonas overloaded, the open annual-discount decision, and a focus line.
- If the demo opens on a weekday after 9:00 in the visitor's time zone, today's digest posts in #product and #general within a few seconds of loading. This is the scheduler working: it shows ORB-8 shipped, ORB-5 one day overdue @Maya, and so on.

**Show it live (about 5 s):**
1. In #product, click **Sunny**'s name or avatar on her digest. Her profile card opens and has a **Daily digest** section.
2. Click **Post digest now in product**. The card closes and #product opens, and the new digest appears in about 4 s (the model's focus line included).
3. Point out the chips, the `@Maya` mention on overdue ORB-5, "Looks overloaded: Priya: 2 open, 18 points", and the "Focus today" line.

**Known limits:**
- "Post digest now" always posts, even if one went out today. The automatic morning digest still posts only once per day.
- Scope per channel: a team channel covers its team's tickets, tickets in missions run from that channel, and tickets mentioned there recently. "Shipped" and workload count the whole workspace.
- The daily cron only covers workspaces with messages in the last 3 days (to skip abandoned demo sandboxes), and at most 50 workspaces per run.
