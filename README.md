# 📺 Home TV

Self-hosted IPTV channel browser. Browse live TV channels by country with a TV-style surfing UI.

Powered by [iptv-org](https://github.com/iptv-org/iptv) — 10,000+ channels across 200+ countries.

## Features

- Filter by country (200+ supported, defaults to Ukraine 🇺🇦)
- TV-style keyboard navigation (↑ ↓)
- Live/dead stream indicators — updated as you watch
- Channel logos, numbers, and status dots
- Country preference saved in the browser
- `/playlist.m3u` endpoint for Chromecast with Google TV IPTV apps

## Run

**Frontend only** (browse channels in browser, no Chromecast sync):
```bash
npm install
npm run dev   # → http://localhost:5173
```

**With backend** (enables `/playlist.m3u` for Chromecast and stream pre-validation):
```bash
pipx install uvicorn[standard]
pipx inject uvicorn fastapi httpx
uvicorn server:app --port 8000
```

On startup the backend probes all streams for the current country concurrently and caches results. Dead streams are filtered from the playlist automatically.

## Chromecast with Google TV setup

1. Start the backend: `uvicorn server:app --host 0.0.0.0 --port 8000`
2. Install **TiviMate** on the Chromecast with Google TV
3. Add playlist URL: `http://[your-server-ip]:8000/playlist.m3u`
4. Done — navigate channels with the remote

To change country or filters: open the web UI on your phone/PC, make changes. Hit refresh in TiviMate to pick up the new playlist.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| ↑ / ↓ or ← / → | Surf channels |

## How it works

Channel data comes from the [iptv-org](https://github.com/iptv-org/iptv) CDN. The optional backend (`server.py`) serves a filtered `/playlist.m3u` based on your settings — country, blacklisted languages, and dead stream removal. The web UI is the control panel; the Chromecast loads the playlist directly.
