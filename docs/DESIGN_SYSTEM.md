# Meld design system (and the Mac app brief)

**How to use this file.** Start any new session (web, Mac app, video, slides) with:

> Read `docs/DESIGN_SYSTEM.md` and `docs/FEATURES.md` in this repo before writing any UI. Follow the design system exactly; where a platform needs something it doesn't cover, extend it in the same spirit and say what you added.

The design system comes first, then the product brief, then the Mac app brief. The source of truth for every value is the code: `src/app/globals.css` (tokens), `src/lib/constants.ts` (accents, status colors), `src/components/common/*` (avatar, badges, pills). If this file and the code disagree, the code wins. Fix this file.

---

## 1. What Meld is

Meld is team chat and tickets in one app (Slack and Jira in one), with AI agents as teammates who turn conversation into owned work. The agents listen to chat and keep tickets, decisions and follow-ups up to date on their own, with Undo on everything.

- **The team in the demo company, Orbit Labs.** People: Alex Rivera (you, founder), Maya Chen (design), Jonas Weber (backend), Priya Raman (frontend), Tom Okafor (growth), Sofia Rossi (product).
- **Agents:** Atlas (lead, `@atlas`), Tess (triage, `@tess`), Rex (reviews, `@rex`), Sunny (standups, `@sunny`).
- **Live:** https://meld-fawn.vercel.app ("Try the live demo", no sign-up). Every feature is listed in `docs/FEATURES.md`.

## 2. Principles

1. **Calm and professional.** It should look like a serious work tool (Linear, Stripe, Apple's own apps), not a toy. Neutral graphite surfaces, one accent color, plenty of white space, nothing shouting.
2. **One accent.** Brand blue (`#2952E3`, "Cobalt") is used only for primary actions, focus, selection, links and mentions. Everything else is neutral. A workspace can swap the accent (Cobalt, Teal `#0F766E`, Graphite `#374154`, Orange `#C2410C`), so never hard-code blue where the accent is meant.
3. **Color carries meaning, or it isn't there.** Status, priority and danger colors exist to be read. Never use them as decoration.
4. **Agents are teammates, not magic.** Agents get a quiet, neutral treatment: a circular avatar and a small monochrome "Agent" tag. No purple gradients, sparkles or glowing AI colors.
5. **Flat, with hairlines.** Surfaces are separated by 1px borders, not shadows. Only things that float (menus, dialogs, toasts, popovers) get a small shadow.
6. **Instant.** Every click responds immediately. Pressed controls dip slightly. Loading shows skeleton placeholders shaped like the content, never a spinner on its own. Arriving content fades in.
7. **Every agent action is visible and undoable.** If an agent changes something, the change shows a card with what changed and an **Undo**. Risky changes wait for **Confirm**.
8. **Accessible.** All text and background pairs meet WCAG AA (4.5:1) in light and dark. There's a visible focus ring everywhere, and motion is cut back when the system asks for reduced motion.

## 3. Brand

- **Name:** Meld. Tagline: "Slack is where work gets talked about. Meld is where it gets done." Short description: "Team chat and tickets in one place, with AI agents as teammates who turn conversation into owned work."
- **Logo:** a speech bubble whose sides have a ticket's notched edges. The idea is "the conversation is the ticket". Files are in `public/brand/`:
  - `meld-mark.svg` (blue mark)
  - `meld-logo.svg` (mark plus wordmark)
  - `meld-logo-dark.svg`, `meld-logo-mono.svg`, `meld-mark-mono.svg`, `meld-mark-white.svg`
  - `meld-app-icon.svg` (white mark on blue, for app icons)
- **App icon:** the white mark on a brand-blue rounded square. For macOS, use Apple's current icon grid and shape, built from `meld-app-icon.svg`.
- **Wordmark:** "Meld", semibold, tight tracking (about −0.02em), in foreground ink beside the blue mark.

## 4. Color tokens

All values from `src/app/globals.css`. Light first, dark second.

### Surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| background | `#FFFFFF` | `#141518` | Main content |
| canvas | `#F7F8F9` | `#101114` | Page behind cards, empty areas |
| sidebar | `#F7F8F9` | `#111214` | Left rail |
| card / popover | `#FFFFFF` | `#18191D` / `#1D1F23` | Cards, menus |
| foreground (ink) | `#17191C` | `#E7E9EC` | Primary text |
| ink-2 | `#363B44` | `#C6CAD1` | Secondary emphasis |
| muted-foreground | `#5C6370` | `#9AA0AA` | Metadata, captions |
| subtle | `#8B919C` | `#6E747E` | Placeholder, disabled |
| border | `#E2E4E8` | `#2A2D33` | Hairlines |
| line-soft | `#EEF0F2` | `#212328` | Very light dividers |
| input (border) | `#CDD1D7` | `#3A3E45` | Field borders |
| muted / secondary | `#F5F6F7` | `#1C1E22` | Quiet fills, skeletons |
| accent (hover fill) | `#ECEEF1` | `#26292E` | Hover and selected rows |

### Brand family

| Token | Light | Dark | Use |
|---|---|---|---|
| brand / primary | `#2952E3` | `#2952E3` | Primary buttons, focus ring, selection |
| link | `#2148B8` | `#8EAAF5` | Links, ticket chips |
| mention bg / fg | `#EAF0FC` / `#1F45AD` | `#1D2740` / `#A9BDF5` | @mention chips |
| selected | `#EEF3FD` | `#1B2236` | Selected list row |

### Agents (neutral by design)

| Token | Light | Dark |
|---|---|---|
| agent (tag bg) | `#EEF0F2` | `#25282D` |
| agent-foreground | `#474D57` | `#B9BEC7` |
| agent-border | `#D5D8DD` | `#383C43` |

### Semantic

| Token | Light | Dark |
|---|---|---|
| success / soft | `#17724C` / `#EAF5EF` | `#5CC795` / `#142A20` |
| warning / soft | `#8F5207` / `#FBF3E4` | `#E0A84F` / `#2C2314` |
| destructive / danger-soft | `#B3261E` / `#FCECEA` | `#F2766B` / `#2E1816` |
| unread badge | `#C8321F`, white text | same |
| online dot | `#1F9D63` | same |

### Ticket status (background / text / border / dot)

| Status | Light | Dark |
|---|---|---|
| To do | `#F0F1F3` / `#3F4550` / `#D3D6DB` / `#8B919C` | `#25282D` / `#C6CAD1` / `#3A3E45` / `#8B919C` |
| In progress | `#EBF1FC` / `#1F45AD` / `#BFD0F3` / `#3866D6` | `#1B2440` / `#A9BDF5` / `#2F4178` / `#6489EB` |
| In review | `#FBF3E4` / `#85500C` / `#ECD3A3` / `#C9871A` | `#2C2314` / `#E0A84F` / `#5A4420` / `#D8962E` |
| Done | `#E9F4EE` / `#17724C` / `#B5DCC6` / `#2B9A64` | `#142A20` / `#5CC795` / `#24533D` / `#3CB07A` |
| Backburner | `#F5F6F7` / `#5C6370` / `#D3D6DB` / `#B0B5BD` | `#1C1E22` / `#9AA0AA` / `#3A3E45` / `#6E747E` (dashed border) |

**Priority** (text or icon color only): High `#B3261E` (dark `#F2766B`), Medium `#8F5207` (dark `#E0A84F`), Low `#5C6370` (dark `#9AA0AA`).

**Missions:** On track uses the success colors, At risk the warning colors, and the "Needs you" badge the In review colors.

## 5. Typography

- **Web:** Inter, with features `cv11` and `ss01`, antialiased. Mono: system monospace.
- **Native (Mac and iOS):** the system font (SF Pro), so it feels native. Keep the same sizes and weights. Use the system monospaced font for IDs and code.
- **Scale:**

| Role | Size / line height | Weight |
|---|---|---|
| Tiny label, badge | 11 / 16 | 500–600 |
| Caption, timestamps | 12 / 16 | 400–500 |
| Meta, secondary UI | 13 / 20 | 400–500 |
| Body, chat message | 14 / 22 | 400 (names 600) |
| Screen and chat title | 15 | 600 |
| Dialog title | 18 | 600 |
| Marketing headline | 34–46, tracking −0.025em | 600 |

- **Numbers:** counts, ticket IDs and stats use tabular figures so they line up.
- **Case:** sentence case for everything (buttons, titles, menus). Never Title Case and never ALL CAPS, except a few tiny section labels if a platform convention needs them.

## 6. Shape, spacing, elevation

- **Corner radius:** controls 4–6px, cards and dialogs 6–8px, never more than 8px in the product. Nothing is pillowy. (The exception is native platform chrome, see the Mac brief.)
- **Avatars:** people are **rounded squares** (6px radius; 12px at 64px). Agents are **circles**, always. This is how people tell humans and agents apart at a glance.
- **Spacing:** 4px grid. Common steps are 4, 6, 8, 10, 12, 16, 20 and 24. Rows are 32–36px on desktop and at least 44px for touch.
- **Header height:** 56px for the sidebar header and screen headers.
- **Shadows:** none on surfaces. Overlays only:
  - small: `0 1px 2px` at 8%
  - medium: `0 2px 6px` at 8%
  - large: `0 6px 16px` at 10%
  - extra large: `0 10px 28px` at 14%
- **Focus:** 2px ring in the accent color, offset 2px, on every interactive element.

## 7. Motion

| Moment | Spec |
|---|---|
| Press | Scale to 0.97 for 120ms, `cubic-bezier(0.2, 0, 0, 1)`. Wide table rows don't scale. |
| Content arrives | Fade in plus 2px rise, 180ms |
| Loading | Skeleton blocks shaped like the content, pulsing between 100% and 55% opacity every 1.4s. No lone spinners. |
| Agent working | A thin 2px indeterminate bar in the accent color sweeping across, plus a "working" bubble with the step it's on ("Reading #product…") |
| Agent reply | Streams in token by token |
| Primary marketing CTA | Soft accent glow plus a gentle 4.5% zoom every 2.2s (landing page only) |
| Reduced motion | All of the above becomes instant or static |

## 8. Components

- **Avatar** (`src/components/common/avatar.tsx`): an illustrated face over the person's identity color, with initials showing until the image loads.
  - People use `public/avatars/person-*.svg`: DiceBear Notionists, CC0.
  - Agents use `agent-*.svg`, and `agent-atlas`, `agent-tess`, `agent-rex` and `agent-sunny` for the four named agents: DiceBear Open Peeps, CC0.
  - Sizes: 20, 22, 28, 32 and 64px.
  - Clicking any face or name opens that profile card.
- **Agent tag:** "Agent", 10–11px, medium weight, with the agent background, text and border colors and a 2–4px radius. It sits after the agent's name.
- **Status pill:** a 6px dot plus the label, 11–12px medium, 2–4px radius, in that status's background and text colors. Optional border.
- **Ticket chip:** the ID (for example `ORB-14`) in link color, monospace or tabular. Clicking it opens the ticket panel.
- **Mention chip:** `@Name` in the mention background and text colors, 2–4px radius.
- **Citation chip:** "#design" or "thread" with a small arrow. Clicking it jumps to the source message and flashes it.
- **Unread badge:** 18px tall, with at least 18px width, red unread background, white 11px semibold tabular text, 2–4px radius.
- **Action card** (agent changes): a bordered card with a one-line summary, the list of changes (for example "To do → In review"), and **Undo** while the undo window is open. Destructive or multi-ticket changes show **Confirm** and **Cancel** first.
- **Buttons:**
  - Primary: accent fill, white text, 6px radius, 36–40px tall.
  - Secondary: white, with an input border and ink text.
  - Ghost: no border, with a hover fill.
  - Destructive: red text, with a red fill only on confirm.
- **Inputs:** 36px tall, input border, 6px radius, accent focus ring.
- **Menus and dialogs:** popover surface with a 1px border and a medium or large shadow. Dialogs are centered, 6–8px radius, with the title at 18px semibold.
- **Toasts:** popover surface, 13px, bottom center or bottom right, with an Undo where it applies.
- **Empty states:** one sentence about what goes here, plus one action. No illustration clutter.
- **Icons:** Lucide on the web, 16px (14px in dense spots), stroke about 2. On Apple platforms use the matching SF Symbols:

| Use | Lucide | SF Symbol |
|---|---|---|
| Channel | Hash | `number` |
| Tickets | Ticket | `ticket` |
| Missions | Flag | `flag` |
| Decisions | Bookmark | `bookmark` |
| People | Users | `person.2` |
| Playbooks | ListChecks | `checklist` |
| Search | Search | `magnifyingglass` |
| New message | SquarePen | `square.and.pencil` |
| Send | Send | `paperplane` |
| Pin | Pin | `pin` |
| Settings | Settings | `gearshape` |
| Lock | Lock | `lock` |
| Agent | Bot | `sparkle` |

  Use `sparkle` sparingly, and never as decoration.

## 9. Layout and navigation

- **Desktop:** a sidebar of 260–280px, then the main column, then an optional right panel (thread, ticket, profile) of about 420px.
- **Sidebar, top to bottom:**
  - Workspace switcher: a square initial tile plus the name, with a menu holding settings, the accent picker, theme and sign out.
  - Search (⌘K) and New message buttons.
  - Home.
  - Missions, with a "Needs you" badge.
  - Decisions, People, Playbooks and Tickets.
  - **Channels** (`# name`, with an add button).
  - **Direct messages.**
  - **Agents**, with working status.
- **Main column:** a 56px header (title at 15px semibold and topic at 13px muted), the message list, then the composer pinned at the bottom.
- **Messages:** a 32px avatar, the name (14 semibold), the time (12 muted), and the body (14/22). Threads show "5 replies" with reply faces. Hovering shows a toolbar (react, reply, pin, remind, edit or delete).
- **Composer:** a bordered box with an @mention picker (people, then agents) and a # ticket picker. A notebook button handles meeting notes. Enter sends.
- **Tickets:** a table (ID, title, status pill, priority, assignee face, due), a Kanban board (To do, In progress, In review, Done), and a ticket panel with status, priority, assignee, team, due date, estimate, labels, checklist, comments and activity.
- **Phone:** a tab bar (Home, Chats, Tickets, Missions, Me), full-screen sheets, 44px touch targets, and a full-screen search.

## 10. Voice and copy

- **Plain, short and specific.** "Updated ORB-13 from your message: To do → In review." Not "Great news! I've gone ahead and…".
- **No hype words:** no "revolutionary", "supercharge", "magic", "seamless" or "AI-powered" in the product UI. No exclamation marks.
- **Agents speak in first person, briefly,** and always cite where something came from (a link back to the thread).
- **Buttons say what happens:** "Confirm", "Undo", "Post digest now", "Cut ORB-9". Not "OK" or "Submit".
- **Errors say what happened and what to do:** "Sign-in didn't complete. Please try again."

---

## 11. Mac app brief

**Goal:** a native macOS app for Meld that feels like a first-party Apple app and uses the same design system above. People download a DMG from the website, open it, sign in with Google or GitHub through the browser, and land in their workspace.

### Platform and stack

- **Code:** Swift and SwiftUI. Target the newest macOS and use its current system design. As of macOS 26 that's the Liquid Glass material for sidebars, toolbars and floating controls; check Apple's latest Human Interface Guidelines before starting.
- **Navigation:** `NavigationSplitView` with the system translucent sidebar, a unified toolbar, native menus, keyboard shortcuts (⌘K search, ⌘N new message, ⌘1–9 to switch screens), native notifications and a Dock badge for unread.
- **Map the design system onto native chrome, don't fight it.** Use the system sidebar material instead of the flat grey rail. Set the accent tint to the workspace accent. Use SF Pro and SF Symbols, and native corner radii for windows and controls. *Inside* the content (messages, ticket rows, pills, chips, avatars, action cards), use the Meld tokens above exactly.
- **Colors:** support light and dark, and follow the system appearance.
- **Where the code lives:** branch `feature/mac-app`, folder `apps/mac/` (an Xcode project or Swift package). Don't touch the web app except for the small server changes listed below.

### Onboarding (the most important part)

The onboarding is a full-window, polished first-run flow. This is the one place the product is allowed to be warm and a bit colorful: soft tinted backgrounds behind the agent illustrations, and gentle motion. The rest of the app stays calm.

1. **Welcome:** the Meld mark animates in, from a chat bubble whose edges notch into the logo. Then the tagline. The four agent faces (Atlas, Tess, Rex, Sunny) rise in one by one on soft tinted circles. Buttons: **Get started** (primary) and **Try the demo** (secondary).
2. **Sign in:** **Continue with Google** and **Continue with GitHub**, as native-looking buttons with the provider logos.
   - Clicking one opens the system browser (or `ASWebAuthenticationSession`).
   - The app shows a waiting state: "Finish signing in in your browser", with **Open browser again** and **Cancel**.
   - When the browser finishes, it opens `meld://auth/callback?...`, the app comes to the front, and onboarding moves to the next step with a smooth transition.
3. **Workspace:** accept a pending invite, or create a company (name, ticket prefix, accent color picked from the 4 accents with a live preview).
4. **Meet your team:** four cards, one per agent, each with its face, role and one line on what it does.
5. **Notifications:** ask for permission and explain why ("Agents tell you when something needs you"). Then **Open Meld**.

The motion is spring-based and short (200–350ms) and respects Reduce Motion. Every screen works at the minimum window size.

### Sign-in flow (technical)

- Meld's auth is Supabase (GitHub and Google OAuth). The web app uses the PKCE flow and swaps the code in `src/app/auth/callback/route.ts`.
- For the Mac app (as built, in `apps/mac/Sources/Meld/Auth`):
  1. Generate a PKCE pair.
  2. Open `<SUPABASE_URL>/auth/v1/authorize?provider=github|google&redirect_to=<site>/auth/desktop&code_challenge=…` in the default browser.
  3. Supabase sends the browser to the site's `/auth/desktop` page (`src/app/auth/desktop`). It says "You're signed in" and opens `meld://auth/callback?code=…`. The page never uses the code: only the app holds the PKCE verifier.
  4. Catch the `meld://` callback and exchange the code at `/auth/v1/token?grant_type=pkce`.
  5. Store the session in the Keychain and refresh it before it expires.

  *Added:* the `/auth/desktop` bridge page, instead of `redirect_to=meld://…` directly. The site's URLs are already allowed redirects, so Supabase needs no new setting, and the browser gets a clear "You're signed in" page instead of a bare app prompt. The app talks to Supabase over plain HTTP (a few calls), so it doesn't need the supabase-swift SDK.
- **Server changes this needs:**
  1. Done on `feature/mac-app`: `getSessionUser()` in `src/server/auth.ts` also accepts `Authorization: Bearer <access token>`, verified with the same `getClaims` check (malformed or forged tokens get 401). Until that is deployed, the app also sends the session as the web's `sb-…-auth-token` cookie, which the current server accepts.
  2. Deploy `src/app/auth/desktop` with it. No Supabase dashboard change is needed.
- **The demo:** `POST /api/demo` returns throwaway `credentials` (email and password) plus `next`. The app can sign in with those to offer "Try the demo".

### Data API

- **Data calls:** `POST https://meld-fawn.vercel.app/api/rpc/<method>` with the JSON body `{"args": [...]}`. The answer is `{"result": ...}` or `{"error": "..."}`.
- **Main methods** (the full list is in `src/app/api/rpc/[method]/route.ts`):
  - `getBoot` / `getDirectory`: people, chats and agents
  - `getMessages(chatId)`, `postMessage({chatId, text, threadId?})`, `editMessage`, `deleteMessage`, `toggleReaction`, `pinMessage`, `searchMessages`, `markRead`
  - `getTickets`, `createTicket`, `updateTicket({id, patch?, addComment?})`
  - `listMissions`, `getMission`, `answerDecision`
  - `listTeamDecisions`, `getAgentRuns`, `decideAction` (Confirm or Undo)
- **Realtime:** Supabase Realtime broadcast, one topic per workspace (see `src/hooks/use-realtime-sync.ts` and `src/server/realtime.ts`). When a ping arrives, refetch what it names, or apply the message it carries.
- **Pragmatic first version:** the native shell (onboarding, sign-in, sidebar, notifications, search) plus native chat. Ticket and mission screens can start as the web pages inside a `WKWebView` sharing the session, then be rebuilt natively one at a time. Never show a web page that looks different from the native parts.

### Distribution

- Ship a DMG with the app and an Applications shortcut, and a background image in brand style.
- For downloads to open without warnings, the app must be signed with a Developer ID certificate and notarized by Apple. That needs an Apple Developer account. Without one, build unsigned for testing only.
- Put a "Download for Mac" button on the landing page next to "Try the live demo", only once a signed build exists.

### Later (not in the first version)

- An on-device router: a small local classifier (for example Laya through `laya-mlx` on Apple Silicon) that decides which messages need the cloud model at all.
- Apple MLX and on-device AI features.

### Testing

- Build and run on a Mac with the newest Xcode.
- Screenshot every onboarding step and the main screens in light and dark, at the minimum and a large window size, and look at them before calling anything done.
- Check sign-in end to end with real Google and GitHub accounts.
