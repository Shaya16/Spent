#!/usr/bin/env bash
set -euo pipefail

# Build the Spent menu bar app: a tiny SwiftUI MenuBarExtra controller
# for the always-on Next.js server. Network access is restricted to
# 127.0.0.1 only (see Resources/Info.plist).

cd "$(dirname "$0")"

if ! command -v swift >/dev/null 2>&1; then
  echo "error: swift not found. Install Xcode Command Line Tools:"
  echo "  xcode-select --install"
  exit 1
fi

OUT_DIR="build"
APP_DIR="$OUT_DIR/Spent.app"

echo "Building release binary..."
swift build -c release

BIN_DIR=$(swift build -c release --show-bin-path)
BIN_PATH="$BIN_DIR/Spent"

if [[ ! -f "$BIN_PATH" ]]; then
  echo "error: expected binary at $BIN_PATH not found"
  exit 1
fi

echo "Assembling $APP_DIR"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cp "$BIN_PATH" "$APP_DIR/Contents/MacOS/Spent"
chmod +x "$APP_DIR/Contents/MacOS/Spent"
cp Resources/Info.plist "$APP_DIR/Contents/Info.plist"

# Ad-hoc sign so Gatekeeper at least recognizes the binary as signed by
# the current user. This is NOT a real Developer ID signature; users will
# still see the first-launch Gatekeeper prompt and need to right-click → Open.
if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "$APP_DIR" >/dev/null 2>&1 || true
fi

echo ""
echo "Built: $APP_DIR"
echo ""
echo "To install: cp -R $APP_DIR ~/Applications/"
echo "First launch: right-click Spent.app → Open (one-time Gatekeeper prompt)."
