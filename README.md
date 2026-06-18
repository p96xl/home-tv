# 📺 Home TV

Self-hosted IPTV channel browser. Browse live TV channels by country with a TV-style surfing UI.

Powered by [iptv-org](https://github.com/iptv-org/iptv) — 10,000+ channels across 200+ countries.

## Features

- Filter by country (200+ supported, defaults to Ukraine 🇺🇦)
- TV-style keyboard navigation (↑ ↓)
- Live/dead stream indicators — updated as you watch
- Channel logos, numbers, and status dots
- Country preference saved in the browser
- M3U playlist link in settings for IPTV apps

## Setup

```bash
sudo apt-get install -y ffmpeg   # provides ffprobe — used to verify streams actually decode
pipx install uvicorn[standard]
pipx inject uvicorn fastapi httpx
npm install
```

## Run

**Start**
```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

On startup the validator probes all streams for the default country (UA) concurrently. The frontend polls `/validate` every 4 seconds and updates status dots as results arrive. If the backend isn't running, the app still works — streams just start gray and turn green/red as you actually watch them.

## Chromecast

**Option A — Cast tab** (simplest): Open in Chrome → three-dot menu → Cast → cast the tab.

**Option B — Native IPTV app** (better): Get a Chromecast with Google TV, install IPTV Smarters or OTT Navigator, and paste the M3U URL from Settings.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| ↑ / ↓ or ← / → | Surf channels |
| Esc | Close settings |

## How it works

Channel data and stream URLs come directly from the [iptv-org](https://github.com/iptv-org/iptv) CDN (no backend needed). Stream health is detected live — if hls.js can't load a stream, the channel turns red. No pre-validation server required.
