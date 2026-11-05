# Meld for Mac

The native macOS app (SwiftUI, macOS 26+). It follows `docs/DESIGN_SYSTEM.md`; section 11 is
the brief. Read both before changing UI.

## Build and run

Needs Xcode 26 or later (the SwiftUI macros ship with Xcode, not the Command Line Tools).

```bash
cd apps/mac
scripts/build-app.sh      # → build/Meld.app (release, ad-hoc signed)
scripts/make-dmg.sh       # → build/Meld.dmg (drag to Applications)
open build/Meld.app
```

Open `Package.swift` in Xcode to edit with previews. Launch options (`open --env K=V build/Meld.app`):

| Variable | Use |
|---|---|
| `MELD_WEB_URL` | API and web pages, default `https://meld-fawn.vercel.app` |
| `MELD_AUTH_BRIDGE_URL` | Sign-in landing page, default `<web>/auth/desktop`. Use `http://localhost:3000/auth/desktop` with `npm run dev` until the page is deployed. |
| `MELD_APPEARANCE` | `light` or `dark`, overriding the system look (for screenshots) |
| `MELD_WINDOW_SIZE` | e.g. `900x600` (the minimum), for a fresh window without a saved frame |

**Keychain prompts while developing.** Each ad-hoc build has a new signature, so macOS asks
before a new build reads the login an older build saved ("Meld wants to use your confidential
information…"). Sign out and in again, or sign the build with a stable identity: with Xcode
signed in to your Apple ID, set `SIGN_IDENTITY="Apple Development: …"`. Release builds signed
with Developer ID don't have this.

## What's in it

- **Onboarding** (`Onboarding/`): Welcome (the mark notches in, the four agents rise in;
  Get started / Try the demo) → Sign in → Workspace (create, with accent and live preview,
  or join with an invite link) → Meet your team → Notifications. Full window, warm tints,
  springs that respect Reduce Motion.
- **Sign-in** (`Auth/`): PKCE in the default browser, back through the site's `/auth/desktop`
  page and `meld://auth/callback`; the session lives in the Keychain and refreshes itself.
  "Try the demo" signs in to a throwaway account from `POST /api/demo`.
- **Main window** (`Main/`): `NavigationSplitView` with the system sidebar in the brief's
  order. Chats are native: messages, threads (inspector), @mention picker, mention, ticket
  and citation chips, reactions, agent action cards with Confirm / Undo, the agent "working"
  bar and step. Home, Missions, Decisions, People, Playbooks and Tickets show the web pages
  for now, with the web sidebar hidden and the same accent, to be rebuilt natively one by one.
- **Live updates** (`API/Realtime.swift`): Supabase Realtime broadcast on `meld-ws-<id>`, plus
  a slow poll. Unread counts in the sidebar and Dock; notifications for DMs and @mentions.
- **Shortcuts:** ⌘K search, ⌘N new message, ⌘1–9 screens and channels.
- **Design** (`Design/`): every color token from the doc in light and dark, the type scale,
  components (agent tag, status pill, unread badge, buttons, skeletons, working bar), avatars
  (rounded squares for people, circles for agents; the four named agents are bundled).

## API

`API/MeldAPI.swift` calls `POST /api/rpc/<method>` with `{"args": [...]}`. It sends the access
token as `Authorization: Bearer` and also keeps the session as the web's auth cookie (which
also signs in the embedded pages), so it works against servers with or without the Bearer
change in `src/server/auth.ts`.

## Shipping the DMG

An ad-hoc build only runs on the Mac that built it. For downloads it needs a Developer ID
signature and notarization (Apple Developer account):

```bash
SIGN_IDENTITY="Developer ID Application: <Name> (<TEAMID>)" scripts/build-app.sh
SIGN_IDENTITY="Developer ID Application: <Name> (<TEAMID>)" scripts/make-dmg.sh
xcrun notarytool submit build/Meld.dmg --keychain-profile <profile> --wait
xcrun stapler staple build/Meld.dmg
```

## Later

On-device routing (Laya via `laya-mlx`) and Apple MLX features; native Tickets and Missions.
