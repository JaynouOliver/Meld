#!/usr/bin/env bash
# Builds Meld.app into apps/macos/build/. Works with Xcode or just the Command Line Tools.
#   scripts/build-app.sh            release build
#   scripts/build-app.sh debug      debug build
# Signing: ad-hoc by default. Set SIGN_IDENTITY="Developer ID Application: …" to sign for
# distribution (then notarize, see README).
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="${1:-release}"
APP="build/Meld.app"

swift build -c "$CONFIG" --arch arm64
BIN="$(swift build -c "$CONFIG" --arch arm64 --show-bin-path)/Meld"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Meld"
cp Resources/Info.plist "$APP/Contents/Info.plist"

# Icon (cached: only re-rendered when the script changes).
if [[ ! -f build/AppIcon.icns || scripts/make-icon.swift -nt build/AppIcon.icns ]]; then
  rm -rf build/AppIcon.iconset
  swift scripts/make-icon.swift build/AppIcon.iconset >/dev/null
  iconutil -c icns build/AppIcon.iconset -o build/AppIcon.icns
fi
cp build/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

if [[ -n "${SIGN_IDENTITY:-}" ]]; then
  codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP"
else
  codesign --force --sign - "$APP"
fi

# Register the meld:// URL scheme with Launch Services so the browser can hand back to us.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" || true

echo "Built $(pwd)/$APP"
