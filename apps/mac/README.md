# Meld for Mac

The native macOS app (SwiftUI, macOS 26+). It follows `docs/DESIGN_SYSTEM.md`; section 11 is
the brief. Read both before changing UI.

## Build and run

Needs Xcode 26 or later (the SwiftUI macros ship with Xcode, not the Command Line Tools).

```bash
cd apps/mac
scripts/build-app.sh      # → build/Meld.app (release, universal: Apple Silicon + Intel, hardened runtime)
scripts/make-dmg.sh       # → build/Meld.dmg (drag to Applications)
open build/Meld.app
```

Open `Package.swift` in Xcode to edit with previews. Launch options (`open --env K=V build/Meld.app`):

| Variable | Use |
|---|---|
| `MELD_WEB_URL` | API and web pages, default `https://meld-fawn.vercel.app` |
| `MELD_AUTH_BRIDGE_URL` | Return sign-in through a web page instead of straight to `meld://`, e.g. `http://localhost:3000/auth/desktop` with `npm run dev` |
| `MELD_APPEARANCE` | `light` or `dark`, overriding the system look (for screenshots) |
| `MELD_PREVIEW_STEP` | `welcome`, `signin` or `notifications`: open that screen without reading the saved login |
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
- **Sign-in** (`Auth/`): Google or GitHub with PKCE in the default browser, straight back to
  `meld://auth/callback`; or email and password (sign in, or create an account; if Supabase
  asks for email confirmation, the link in the email opens the app and finishes sign-in).
  The session lives in the Keychain and refreshes itself. **Setup:** Supabase → Authentication →
  URL Configuration → Redirect URLs must include `meld://**` (once per project).
  "Try the demo" signs in to a throwaway account from `POST /api/demo`.
- **Workspace** (`Main/WorkspaceWebView.swift`): the Meld web app itself, signed in with the
  app's session, so the Mac app and the website share one design language. Around it: a
  compact toolbar (back, forward, reload), Reload ⌘R / Back ⌘[ / Forward ⌘], Account → Sign
  Out. The web's own sign-out signs the app out too. Links outside Meld open in the browser.
- **Notifications** (`Main/WorkspaceStore.swift`, `API/Realtime.swift`): the same Supabase
  Realtime pings the web app uses; DMs and @mentions of you become macOS notifications (a
  click opens the chat) and count on the Dock badge while the app is in the background.
- **Design** (`Design/`): the doc's color tokens in light and dark, the type scale, buttons,
  avatars and the working bar, for the native onboarding and sign-in screens.

## API

`API/MeldAPI.swift` calls `POST /api/rpc/<method>` with `{"args": [...]}`. It sends the access
token as `Authorization: Bearer` and also keeps the session as the web's auth cookie (which
also signs in the embedded pages), so it works against servers with or without the Bearer
change in `src/server/auth.ts`.

## Security

- The only key in the app is Supabase's **publishable** key, the same one the website gives
  every browser. Every table has row-level security with no policies and no grants for the
  public role, so that key can't read or write data; only the server's secret key can, and it
  stays on Vercel.
- The session lives in the Keychain; nothing is logged.
- `meld://` links: an auth callback is handled only while this app has a sign-in in progress
  (it holds the PKCE verifier; a code from anywhere else can't be exchanged), error text is
  capped, and chat links accept plain ids only.
- The web view keeps Meld pages inside and opens other sites in the browser; its sign-out
  bridge accepts messages only from Meld's own top-level page.
- Builds use the hardened runtime.

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

On-device routing (Laya via `laya-mlx`) and Apple MLX features.
