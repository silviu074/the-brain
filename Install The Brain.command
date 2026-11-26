#!/bin/bash
# Installs The Brain (Claude edition) for this Mac user. No admin rights needed.
# Copies the app to ~/Library/Application Support/TheBrainClaude and adds "The Brain (Claude)" to ~/Applications.
SRC="$(cd "$(dirname "$0")" && pwd)/app"
DEST="$HOME/Library/Application Support/TheBrainClaude"
APP="$HOME/Applications/The Brain (Claude).app"

if [ ! -f "$SRC/index.html" ]; then echo 'Unzip the whole folder first, then run the installer from inside it.'; exit 1; fi

echo "Installing to $DEST ..."
mkdir -p "$DEST" || exit 1
cp -R "$SRC/." "$DEST/" || exit 1
chmod +x "$DEST/launch.sh"

# Node.js is not in the zip (it is too big to share): download the official build once and check its SHA-256.
if [ ! -x "$DEST/node/node" ]; then
  VER=v24.22.0
  case "$(uname -m)" in
    arm64)  ARCH=arm64; SHA=6a9724d9b50a5f22b4816cded441b5a8d9ddae546191a5e5b7efa5a5e2ee26d5 ;;
    x86_64) ARCH=x64;   SHA=495e3f273c645f3c4677d438304cdfc701729ea5dec5728f5c8e76a2dece4b91 ;;
    *) echo "This Mac's processor ($(uname -m)) is not supported."; exit 1 ;;
  esac
  NAME="node-$VER-darwin-$ARCH"
  TMP="$(mktemp -d)"
  echo "Downloading Node.js $VER from nodejs.org (about 53 MB) ..."
  if ! curl -fL --progress-bar -o "$TMP/$NAME.tar.gz" "https://nodejs.org/dist/$VER/$NAME.tar.gz"; then
    rm -rf "$TMP"; echo 'Download failed. Check your internet connection and run the installer again.'; exit 1
  fi
  if [ "$(shasum -a 256 "$TMP/$NAME.tar.gz" | cut -d ' ' -f 1)" != "$SHA" ]; then
    rm -rf "$TMP"; echo 'The Node.js download did not match its checksum. Run the installer again.'; exit 1
  fi
  tar -xzf "$TMP/$NAME.tar.gz" -C "$TMP" "$NAME/bin/node" "$NAME/LICENSE" || { rm -rf "$TMP"; exit 1; }
  mkdir -p "$DEST/node"
  cp "$TMP/$NAME/bin/node" "$TMP/$NAME/LICENSE" "$DEST/node/"
  rm -rf "$TMP"
fi

# A small app in ~/Applications that runs launch.sh, so it shows in Launchpad and Spotlight.
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>The Brain (Claude)</string>
  <key>CFBundleIdentifier</key><string>local.thebrain.claude</string>
  <key>CFBundleExecutable</key><string>brain</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
EOF
cat > "$APP/Contents/MacOS/brain" <<'EOF'
#!/bin/bash
exec /bin/bash "$HOME/Library/Application Support/TheBrainClaude/launch.sh"
EOF
chmod +x "$APP/Contents/MacOS/brain"
sips -s format icns "$DEST/icon.png" --out "$APP/Contents/Resources/icon.icns" >/dev/null 2>&1 || true

echo ''
echo 'Optional: show your Claude plan limits (5-hour and weekly) in the Brain.'
echo 'This adds a small status line to Claude Code (only if you do not have one yet).'
read -r -p 'Turn it on? (y/n) ' answer
case "$answer" in y*|Y*) "$DEST/node/node" "$DEST/statusline-setup.mjs" on ;; esac
echo ''
echo 'Done. Open "The Brain (Claude)" from Launchpad, Spotlight or the Applications folder in your home folder.'
echo 'To remove it later, run "Uninstall The Brain.command".'
