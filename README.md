# 📺 Home TV

Self-hosted IPTV channel browser. Browse live TV channels by country with a TV-style surfing UI.

Powered by [iptv-org](https://github.com/iptv-org/iptv) — 10,000+ channels across 200+ countries.

## Features

- Filter by country (200+ supported, defaults to Ukraine 🇺🇦)
- TV-style keyboard navigation (↑ ↓)
- Live/dead stream indicators — updated as you watch
- Channel logos, numbers, and status dots
- M3U playlist link in settings for IPTV apps like Tivimate etc.
- M3U playlist link will automatically update the channel list when 'Push Settings to Server' button is pressed
- Filters are inclusive or exclusive for Country, Language, Catagory, Quality

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
pipx ensurepath          # adds uvicorn to PATH — restart your shell after this
npm install
npm run build            # creates the dist/ folder the server serves
```

## Run

**Start**
```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

## Chromecast

Get a Chromecast with Google TV, install an M3U streamer like Tivimate, and paste the M3U URL from Tivimate URL button on the top right.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| ↑ / ↓ or ← / → | Surf channels |
| Esc | Close settings |

## How it works

Channel data and stream URLs come directly from the [iptv-org](https://github.com/iptv-org/iptv) CDN (no backend needed). Stream health is detected live — if hls.js can't load a stream, the channel turns red. No pre-validation server required.
