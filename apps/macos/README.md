# Meld for Mac

A native SwiftUI app (macOS 26+, Liquid Glass) with a colorful first-run welcome, browser
sign-in through Google or GitHub, and the Meld workspace.

## Build

Needs only the Xcode Command Line Tools (`xcode-select --install`); full Xcode also works.

```bash
cd apps/macos
scripts/build-app.sh      # → build/Meld.app (release, ad-hoc signed)
scripts/make-dmg.sh       # → build/Meld.dmg (drag to Applications)
open build/Meld.app
```

`swift build` alone compiles the code; the script also makes the `.app` bundle, the icon,
and registers the `meld://` URL scheme.

Point the workspace at a local web server with `MELD_WEB_URL=http://localhost:3000 open build/Meld.app`.

## How sign-in works

1. The app makes a PKCE verifier and opens Supabase's `/auth/v1/authorize` in the
   default browser for the chosen provider.
2. After Google or GitHub, Supabase redirects to `meld://auth/callback?code=…`. macOS
   hands that URL back to the app and brings it to the front.
3. The app exchanges the code plus verifier for a session at `/auth/v1/token`, stores it
   in the Keychain, and shows the "You're in" screen.
4. The workspace hosts the web app in a `WKWebView`, signed in by writing the session as
   the same `sb-…-auth-token` cookie that `@supabase/ssr` uses in a browser.

**One-time setup:** in Supabase → Authentication → URL Configuration, add
`meld://auth/callback` to the Redirect URLs. Without it, Supabase sends people to the website
instead of back to the app.

## Layout

```
Sources/Meld/
  MeldApp.swift          single-window app, meld:// handling, menus
  AppModel.swift         onboarding/sign-in state machine, session refresh, sign-out
  Config.swift           Supabase project, web URL
  Auth/                  PKCE client, session model, Keychain
  Views/                 Welcome, SignIn (+ waiting, "You're in"), Workspace (+ web view)
  Design/                brand colors and mark, animated mesh background, Local (see below)
Resources/Info.plist     bundle id app.meld.mac, URL scheme
scripts/                 build-app.sh, make-dmg.sh, make-icon.swift
```

`Design/Local.swift` stands in for `@State`: in the macOS 27 SDK `@State` is a macro whose
plugin ships only with Xcode, so the Command Line Tools can't build it.

## Shipping the DMG on the website

The ad-hoc signed build runs on the Mac that built it. For other Macs it needs a
Developer ID signature and notarization, or Gatekeeper blocks it:

```bash
SIGN_IDENTITY="Developer ID Application: <Name> (<TEAMID>)" scripts/build-app.sh
SIGN_IDENTITY="Developer ID Application: <Name> (<TEAMID>)" scripts/make-dmg.sh
xcrun notarytool submit build/Meld.dmg --keychain-profile <profile> --wait
xcrun stapler staple build/Meld.dmg
```

Then serve `Meld.dmg` from the site (for example `public/download/Meld.dmg` or a release asset).

## Next

- Native screens (chat, tickets) to replace the web view one at a time.
- On-device AI with MLX / Foundation Models.
