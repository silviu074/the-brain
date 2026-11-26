#!/bin/bash
# Opens The Brain (Claude edition) as its own app window on a Mac. Used by the "The Brain (Claude)" app.
# Rescans the Claude setup, starts the local server in the background if it isn't running, then opens an app window.
DIR="$(cd "$(dirname "$0")" && pwd)"
URL='http://localhost:8767/'
NODE="$DIR/node/node"
up() { curl -s -o /dev/null --max-time 1 "$URL"; }

cd "$DIR" || exit 1
"$NODE" "$DIR/scan.mjs" >/dev/null 2>&1
if ! up; then
  nohup "$NODE" "$DIR/server.mjs" --auto-exit >/dev/null 2>&1 &
  for i in $(seq 120); do up && break; sleep 0.25; done
fi

# A Chromium browser can open the page as its own window (and play the music); otherwise use the default browser.
for b in 'Google Chrome' 'Microsoft Edge' 'Brave Browser' 'Chromium'; do
  if [ -d "/Applications/$b.app" ] || [ -d "$HOME/Applications/$b.app" ]; then
    open -na "$b" --args --app="$URL" --autoplay-policy=no-user-gesture-required
    exit 0
  fi
done
open "$URL"
