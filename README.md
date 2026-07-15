# 📺 Home TV

Self-hosted IPTV channel browser. Browse live TV channels by country with a TV-style surfing UI.

Powered by [iptv-org](https://github.com/iptv-org/iptv) and [Free-TV/IPTV](https://github.com/Free-TV/IPTV) — 10,000+ channels across 200+ countries.

## Features

- Filter by country (200+ supported, defaults to Ukraine 🇺🇦)
- TV-style keyboard navigation (↑ ↓)
- Live/dead stream indicators — updated as you watch
- Channel logos, numbers, and status dots
- M3U playlist link in settings for IPTV apps like Tivimate, Jellyfin, etc.
- M3U playlist link will automatically update the channel list when 'Push Settings to Server' button is pressed
- Filters are inclusive or exclusive for Country, Language, Catagory, Quality
- One entry per channel with server-side source fallback — no duplicate rows in Jellyfin
- XMLTV guide endpoint (`/epg.xml`) so Jellyfin's Live TV Guide populates

## Screenshots

Channel List with Filters:
<img width="957" height="631" alt="Screenshot 2026-06-18 111600" src="https://github.com/user-attachments/assets/44432036-47e0-46f5-b26c-efb056dd25e2" />

Big Picture:
<img width="950" height="623" alt="Screenshot 2026-06-18 111610" src="https://github.com/user-attachments/assets/07e7ec9a-ca1a-4efd-bcb0-c0865a9dbc7a" />

Using something like m3u-ip.tv:
<img width="954" height="629" alt="Screenshot 2026-06-18 111812" src="https://github.com/user-attachments/assets/67789a22-2b64-437c-8839-d0bacba31519" />

## Setup

```bash
pipx install uvicorn[standard]
pipx inject uvicorn fastapi httpx
pipx ensurepath          # adds uvicorn to PATH — then run: source ~/.bashrc (or open a new terminal)
npm install
npm run build            # creates the dist/ folder the server serves
```

## Run

**Start**
```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

## Playlist URLs

The server exposes two flavours of the M3U, both **one entry per channel** (no duplicate rows for a channel that has several stream sources):

| URL | Use for | How streams are served |
|-----|---------|------------------------|
| `http://YOUR-SERVER:8000/playlist.m3u` | Jellyfin, m3u-ip.tv, browser players | Each channel points at `/live?n=<number>`, which tries **every source in order server-side** and falls back automatically if one is dead. Streams are proxied through this server. |
| `http://YOUR-SERVER:8000/playlist.m3u?direct=true` | Tivimate and other native apps that want raw URLs | Emits the channel's **primary stream URL only** — no proxy, no fallback. |

Whatever you change in the app's filters is baked into these playlists after you press **Push Settings to Server**.

## Jellyfin

**1. Tuner** — Dashboard → Live TV → **Tuner Devices** → Add → **M3U Tuner**
→ `http://YOUR-SERVER:8000/playlist.m3u`

Each channel shows up **once**, with all its stream sources tried behind the scenes — no more three-of-the-same-channel.

**2. Guide (EPG)** — Dashboard → Live TV → **TV Guide Data Providers** → Add → **XMLTV**
→ `http://YOUR-SERVER:8000/epg.xml`

Then tick the guide provider for the tuner and refresh guide data. The EPG's channel ids match the playlist's `tvg-id`s, so Jellyfin lines them up automatically and the **Guide** view populates.

> If the Guide is empty, it's almost always **filters** (a playlist with zero channels has no guide) or **Jellyfin's cached guide** — run Dashboard → Scheduled Tasks → **Refresh Guide**. Note: `/epg.xml` follows your active filters, so if the M3U is empty the guide is too.

### Real programme listings (optional)

Out of the box the guide shows rolling **placeholder** blocks (channel name, "no guide data available") — enough to populate the grid. For real "what's on now/next" listings, run [iptv-org/epg](https://github.com/iptv-org/epg)'s grabber and drop its output at `guide.xml` in the repo root; `server.py` merges it automatically (real programmes for covered channels, placeholder for the rest).

`epg/refresh.sh` does the whole thing — clones/updates the grabber, builds a channel list matching exactly what your server serves, grabs, and writes `guide.xml`:

```bash
# needs node/npm + python3, and the server importable from the repo root (dist/ built)
./epg/refresh.sh
```

Then run it daily from cron:

```cron
0 4 * * *  /path/to/home-tv/epg/refresh.sh >> /path/to/home-tv/logs/epg.log 2>&1
```

Coverage depends on your filters — for a Ukrainian set, ~50 channels have a real guide source (via iptv-org's `guides.json`); the rest stay on placeholder. `local.*` channels have no real source and are always placeholder.

## Chromecast

Get a Chromecast with Google TV, install an M3U streamer like Tivimate, and paste the M3U URL from the **TiviMate URL** button in the top-right of the app.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| ↑ / ↓ or ← / → | Surf channels |
| Esc | Close settings |

## How it works

Channel data and stream URLs come from [iptv-org](https://github.com/iptv-org/iptv) and [Free-TV/IPTV](https://github.com/Free-TV/IPTV), plus an optional local `local.m3u`, merged server-side (streams already present are deduped out). Only channels with **at least one stream URL** are kept — a channel iptv-org lists but has no playable link for can't be streamed, so it's dropped. To add such a channel, drop a working URL into `local.m3u` and it merges in under its `tvg-id`.

Each channel keeps all its sources as an ordered fallback list. External players get one channel per entry; `/live` walks that list and serves the first source that connects. Stream health is also detected live in the web app — if hls.js can't load a stream, the channel turns red. No pre-validation server required.
