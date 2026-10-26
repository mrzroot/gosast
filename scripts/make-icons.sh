#!/usr/bin/env bash
# Render assets/icon.svg to the four PNG sizes browsers ask for, using headless Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p src/icons
for s in 16 32 48 128; do
  cat > /tmp/gosast-icon.html <<HTML
<html><body style="margin:0;background:transparent"><img src="file://$PWD/assets/icon.svg" width="$s" height="$s" style="display:block"></body></html>
HTML
  google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --window-size=$s,$s --screenshot="$PWD/src/icons/icon$s.png" "file:///tmp/gosast-icon.html" >/dev/null 2>&1
done
ls -l src/icons
