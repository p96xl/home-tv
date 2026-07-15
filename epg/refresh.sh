#!/usr/bin/env bash
# Refresh real EPG data for Home TV. Clones/updates iptv-org/epg, grabs listings for exactly the
# channels our server serves, and writes guide.xml into the repo root where server.py picks it up
# (/epg.xml serves real programmes for covered channels, placeholders for the rest).
#
# Run daily from cron, e.g.:
#   0 4 * * *  /path/to/home-tv/epg/refresh.sh >> /path/to/home-tv/logs/epg.log 2>&1
#
# Needs: node/npm, python3, and the server importable from the repo root (dist/ built).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"     # Home TV repo root
EPG_DIR="${EPG_DIR:-$HOME/iptv-org-epg}"      # where the grabber lives (override with EPG_DIR=...)

# 1. iptv-org/epg checkout (the grabber + its site parsers)
if [ ! -d "$EPG_DIR/.git" ]; then
  git clone --depth 1 https://github.com/iptv-org/epg.git "$EPG_DIR"
fi
git -C "$EPG_DIR" pull --ff-only || true
( cd "$EPG_DIR" && npm install )

# 2. Channel list = exactly what our server serves, joined to iptv-org guide sources
( cd "$REPO" && python3 epg/build_channels.py > "$EPG_DIR/homietv.channels.xml" )

# 3. Grab a couple days of listings. Flags per iptv-org/epg README; run `npm run grab -- --help`
#    in $EPG_DIR if the CLI has changed.
( cd "$EPG_DIR" && npm run grab --- \
    --channels=homietv.channels.xml \
    --days=2 \
    --maxConnections=5 \
    --output=guide.xml )

# 4. Hand it to the server
cp "$EPG_DIR/guide.xml" "$REPO/guide.xml"
echo "Wrote $REPO/guide.xml ($(grep -c '<programme' "$REPO/guide.xml") programmes)"
