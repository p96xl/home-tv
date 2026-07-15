#!/usr/bin/env bash
# Refresh real EPG data for Home TV. Clones/updates iptv-org/epg, grabs listings for exactly the
# channels our server serves, and writes guide.xml into the repo root where server.py picks it up
# (/epg.xml serves real programmes for covered channels, placeholders for the rest).
#
# Run daily from cron, e.g.:
#   0 4 * * *  /path/to/home-tv/epg/refresh.sh >> /path/to/home-tv/logs/epg.log 2>&1
#
# Needs: node/npm, python3, and the server importable from the repo root (dist/ built).
#
# Low-RAM box? iptv-org/epg loads its whole API into memory and can OOM (and take other processes
# down with it). We raise Node's heap below; on a small server also add swap once, e.g.:
#   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
#   sudo mkswap /swapfile && sudo swapon /swapfile
#   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
set -euo pipefail

# Bigger V8 heap for the grabber's API-load step (override with NODE_HEAP_MB=...)
export NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB:-2048}"

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
