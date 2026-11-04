# Brand and landing page

Status: built.

## The mark

A speech bubble with a ticket's notched edges, drawn as one shape: the conversation is
the ticket. That is the product in one glyph: chat and tickets melded, with agents turning
one into the other. It's a solid silhouette on a 32 grid with even coordinates, so it
stays crisp at 16px in a browser tab and reads at a glance in one color.

- Color: Meld blue `#2952E3` (the app's default brand accent). The mark keeps this blue even
  when a workspace recolors its accent.
- Wordmark: "Meld" in Inter SemiBold, outlined to paths so the logo is identical everywhere.
- Versions in `public/brand/`: `meld-mark.svg` (blue), `meld-mark-mono.svg` (graphite),
  `meld-mark-white.svg`, `meld-logo.svg` (for light backgrounds), `meld-logo-dark.svg`
  (white wordmark), `meld-logo-mono.svg`, `meld-app-icon.svg` (white mark on a blue tile).
- Component: `src/components/marketing/logo.tsx`. `<Logo />` is mark and wordmark,
  `<Logo markOnly />` is the mark alone, `size` is the height in px, and `tone="mono"` uses
  the current text color for both.

## Where it shows

- **Browser tab, every page (signed in or not):** `src/app/icon.svg` plus a matching
  `favicon.ico` (16/32/48) for older browsers. `apple-icon.png` (180×180, white mark on blue)
  for home screens.
- **Link previews:** `opengraph-image.png` and `twitter-image.png` (1200×630): logo, the
  "Slack is where work gets talked about. Meld is where it gets done." line, and the four
  agent faces. To see it on camera, paste the site URL into Slack, iMessage or LinkedIn.
- **Page titles:** "Meld" on the landing page, "Sign in · Meld", "Missions · Meld" and so on
  (the existing `%s · Meld` template). Chats read "Chat · Meld"; the channel name isn't in
  the title yet.
- **Logo in the header:** landing page, sign in, onboarding and join pages.
- **The app's sidebar workspace chip** is unchanged: it shows the workspace's initial.

## Landing page (`/`)

It now scrolls. Sections:

1. Hero: the positioning line, the "Try the live demo" button (unchanged) and "Create your
   workspace". On the right, a still of #product in Orbit Labs: Sofia settles the annual
   plan offer, Maya commits to Thursday, and Atlas logs the decision and updates ORB-5 (with
   Undo). A floating card shows the "Launch paid plans" mission. Names, tickets and faces
   match the sandbox the demo button opens.
2. How it works: talk, agents turn it into owned work, agents drive it to done.
3. Product: agents as teammates (Atlas, Tess, Rex, Sunny with their real jobs), Missions
   (the plan with its critical path), tickets in the conversation, decision memory, live
   tickets, people and roles.
4. Slack + Jira vs Meld, a seven-row comparison.
5. Security and control: roles (owner, member, guest), agents act with the asker's role,
   confirmation for deletes and bulk changes plus a 10-minute undo, EU data residency
   (Supabase eu-west-1 and Vercel dub1, both in Ireland).
6. Closing call to action ("Open the live demo", a second label so "Try the live demo"
   stays unique on the page) and the footer.

Click path for the video: open `/`, scroll slowly through the sections, then click
"Try the live demo" in the hero (about 3 to 5 seconds to open the sandbox).

## Known limits

- The hero visual is a static mock in HTML and CSS, not a live embed.
- The OpenGraph image is a static PNG. To change the tagline, re-render it (the source
  design is the same layout as the hero).
- Link previews need an absolute URL. On Vercel, Next.js fills it in from the production
  domain; locally they point at localhost.
