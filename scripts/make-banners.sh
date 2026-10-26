#!/usr/bin/env bash
# Render the README banners (light + dark) from assets/banner.html with headless Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."
for mode in light dark; do
  cls=$([ $mode = dark ] && echo dark || echo light)
  sed "s/class=\"LIGHT\"/class=\"$cls\"/" assets/banner.html > assets/.banner-$mode.html
  google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --window-size=1280,400 --virtual-time-budget=2000 --screenshot="$PWD/assets/banner-$mode.png" "file://$PWD/assets/.banner-$mode.html" >/dev/null 2>&1
  rm assets/.banner-$mode.html
done
ls -l assets/banner-*.png
