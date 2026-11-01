# Meld

Team chat with an agent that files and updates your tickets. Channels, DMs and
nested threads sit next to a tickets workspace, and **Atlas** (the agent) creates,
reads, updates and deletes tickets from chat, with the same permissions as the
person asking.

This is the web app for the hackathon. Mac, Windows and mobile apps come later and
are meant to reuse the domain layer in `src/lib`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint && npm run typecheck
```

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, Cache Components) |
| Styling | Tailwind CSS v4, design tokens in `src/app/globals.css` |
| Components | shadcn/ui (Radix), in `src/components/ui` |
| Server state | TanStack React Query |
| Client state | Zustand (`src/stores/ui-store.ts`) |
| Icons | lucide-react |

## What's in the UI

- **Chat**: channels and DMs, unread badges, @mentions, ticket chips (`NW-123`)
  that open the ticket, Atlas confirmation cards, typing indicators.
- **Composer autocomplete**: `@` for people or Atlas, `#` / `NW-` for tickets
  your role can see. Arrow keys, Enter/Tab to insert.
- **Threads**: a side panel with a collapsible, nested reply tree and inline replies.
- **Atlas**: tag `@Atlas` anywhere, or DM it. Try "create a ticket for X and
  assign it to Ravi", "move NW-122 to In progress", "what's on my plate?",
  "delete NW-126". Ticket changes are posted back to the ticket's channel.
- **Tickets**: stats, charts (by status, by assignee, weekly people vs Atlas
  activity), a filter language (`status:review assignee:ravi team:payments
  -status:done is:agent`), group by assignee/status/team, collapsible groups.
- **Ticket panel**: edit title, description, status, priority, assignee;
  images; GitHub PR/issue links; activity log; delete (owners only).
- **RBAC demo**: switch role in the sidebar. Owner sees everything, a team member
  sees Design plus their own tickets, a guest sees only their own. Restricted
  tickets show as locked chips; Atlas refuses actions the role can't take.
- **Workspace accent**: pick a brand color from the workspace menu.
- **Responsive**: sidebar becomes a drawer below `md`; thread and ticket panels
  overlay below `xl`.

## Layout

```
src/
  app/
    (workspace)/layout.tsx         sidebar + screen + ticket panel
    (workspace)/chat/[chatId]/     channel or DM
    (workspace)/tickets/           all tickets, /mine
  components/
    ui/                            shadcn primitives
    shell/                         app shell, sidebar, headers, side panels
    chat/                          messages, composer, ticket cards
    thread/                        thread panel, nested reply tree
    tickets/                       stats, charts, filter bar, table
    ticket-panel/                  ticket detail
    common/                        avatar, rich text, status pill
  hooks/                           React Query hooks (queries + mutations)
  stores/ui-store.ts               Zustand: role, panels, unread, filters
  lib/
    api/                           client API (the backend seam)
    mock/                          in-memory db + seed data
    agent/atlas.ts                 rule-based agent (pure function)
    rbac.ts, query-language.ts, constants.ts, types.ts
```

### Data flow

Components never touch data directly. They call hooks in `src/hooks`, which use
React Query over the functions in `src/lib/api`. Those functions currently read
and write an in-memory mock db (`src/lib/mock`), so a page reload resets the data.

**To connect a real backend**, replace the bodies in `src/lib/api/index.ts` with
`fetch` calls and keep the signatures. Nothing in the UI needs to change. RBAC
in `src/lib/rbac.ts` is mirrored on the client only for rendering; the server
must enforce it.

**To make Atlas real**, replace `runAtlas` in `src/lib/agent/atlas.ts` (or the
`askAtlas` API call) with a model behind the API that uses ticket tools. The UI
already handles the pending state, replies, ticket cards and cross-channel posts.

Zustand holds UI-only state. Role, accent, ticket filter and grouping persist to
`localStorage`.

## Design source

The UI follows the "Team Chat Interface" design in Claude Design. Colors, spacing
and type come from it via the tokens in `globals.css`.
