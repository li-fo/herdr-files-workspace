#!/bin/sh
# Installs (or updates) the files-workspace mod into the Herdr app and points the Files panel of
# the layout on screen at it. Herdr's own layouts are read-only, so a shipped one is cloned
# first (as <layout>-files-workspace) and the window switches to the clone.
#
#   sh install.sh            install, or update the mod's files if it is already there
#
# Undo: switch back with ctrl-shift-l (or cmd-shift-l), then delete
# ~/.config/herdr-app/mods/files-workspace and the cloned layout file.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
app=${HERDR_APP_HOME:-"$HOME/.config/herdr-app"}
mod="$app/mods/files-workspace"

command -v herdr-app >/dev/null 2>&1 || { echo "herdr-app not found: install the Herdr desktop app and start it once." >&2; exit 1; }
[ -d "$app/mods" ] || { echo "No Herdr app folder at $app: start Herdr once first." >&2; exit 1; }

# 1. The mod. An update replaces its files; nothing else in the app folder is touched.
if [ -d "$mod" ]; then echo "Updating $mod"; rm -rf "$mod"; else echo "Installing $mod"; fi
cp -R "$here/mods/files-workspace" "$mod"
herdr-app check "$mod"

# 2. The layout on screen. Needs a running Herdr window.
layout=$(herdr-app status 2>/dev/null | sed -n 's/.*"layout": *"\([^"]*\)".*/\1/p' | head -1)
if [ -z "$layout" ]; then
  echo "Herdr isn't running: start it and run this again to switch the Files panel." >&2
  exit 0
fi
case "$layout" in
  main|terminals|win98)
    clone="$layout-files-workspace"
    if [ ! -f "$app/layouts/$clone.json" ]; then
      herdr-app do layout.clone "{\"name\":\"$layout\",\"as\":\"$clone\"}" >/dev/null
      i=0; while [ ! -f "$app/layouts/$clone.json" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
    else
      herdr-app do layout.switch "{\"name\":\"$clone\"}" >/dev/null
    fi
    layout=$clone ;;
esac
file="$app/layouts/$layout.json"

if grep -Eq '"mod": *"files-workspace"' "$file"; then
  echo "Layout $layout already uses files-workspace."
elif grep -Eq '"mod": *"(files|file-icons)"' "$file"; then
  sed -E 's/"mod": *"(files|file-icons)"/"mod": "files-workspace"/' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  echo "Layout $layout: the Files panel now uses files-workspace."
else
  echo "Layout $layout has no Files panel. Add a block with \"content\": { \"mod\": \"files-workspace\" } where you want it." >&2
fi
echo "Done. Right-click a file or folder in Files."
