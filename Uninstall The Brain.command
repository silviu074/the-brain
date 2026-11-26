#!/bin/bash
# Removes The Brain (Claude edition): its app, its status line (if it added one) and its app folder. Your other Claude files are not touched.
DEST="$HOME/Library/Application Support/TheBrainClaude"
APP="$HOME/Applications/The Brain (Claude).app"
if [ -x "$DEST/node/node" ]; then "$DEST/node/node" "$DEST/statusline-setup.mjs" off; fi
pkill -f 'TheBrainClaude/node/node' 2>/dev/null
rm -rf "$APP" "$DEST"
echo 'The Brain was removed.'
