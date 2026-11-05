#!/usr/bin/env bash
# Packages build/Meld.app into build/Meld.dmg (drag-to-Applications layout).
# Run scripts/build-app.sh first.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="build/Meld.app"
DMG="build/Meld.dmg"
STAGE="build/dmg"
[[ -d "$APP" ]] || { echo "Missing $APP. Run scripts/build-app.sh first." >&2; exit 1; }

rm -rf "$STAGE" "$DMG"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

hdiutil create -volname "Meld" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG" >/dev/null
rm -rf "$STAGE"

if [[ -n "${SIGN_IDENTITY:-}" ]]; then
  codesign --force --sign "$SIGN_IDENTITY" "$DMG"
fi
echo "Built $(pwd)/$DMG ($(du -h "$DMG" | cut -f1))"
