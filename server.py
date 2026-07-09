from fastapi import FastAPI, Request
import asyncio
import json
import re
import time
import urllib.parse
from pathlib import Path
from collections import defaultdict

import httpx
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

FILTERS_FILE = Path("filters.json")
BLACKLIST_FILE = Path("blacklist.json")  # stream URLs the user omitted as bad (debug mode)
# local.m3u channels carry invented tvg-ids and no logo. This maps them to real iptv-org channel
# ids so they can borrow that channel's logo. Regenerate with ua_hunt/map_logos.py.
LOGO_MAP_FILE = Path("logo_map.json")
IPTV = "https://iptv-org.github.io"
FREETV = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8"
# One local M3U of extra channels (Ukrainian TV), merged after the online sources.
# Regenerate it with ua_hunt/build_local_m3u.py; edit by hand if you like.
LOCAL_M3U = Path("local.m3u")
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}
CACHE_TTL = 6 * 3600  # 6 hours — iptv-org data changes slowly

_default_filters: list = []
_channels_cache: list | None = None
_cache_ts: float = 0.0


def _norm_url(u: str) -> str:
    return u.split("?")[0].rstrip("/").lower()


def _merge_m3u(text: str, channels: list[dict], seen: set[str],
               default_lang: str | None = None, default_country: str | None = None) -> None:
    """Merge an M3U (Free-TV or a local file) into `channels` in place. A stream whose tvg-id
    matches an existing channel is appended as a fallback URL — tried after iptv-org's own
    streams, which carry known quality, so players still exhaust HD→SD→... before falling back
    here. Unmatched streams become new channels, tagged by tvg-language / tvg-country or the
    given defaults (locals default to Ukrainian/UA so the app's filters catch them). Dedups by
    URL against `seen`.
    ponytail: no quality data in these sources — new channels stay None; matched ones keep the
    iptv-org metadata they already have."""
    def attr(line: str, key: str) -> str | None:
        m = re.search(rf'{key}="([^"]*)"', line)
        return m.group(1) if m and m.group(1) else None

    by_id = {ch["id"]: ch for ch in channels if ch.get("id")}
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if not line.startswith("#EXTINF"):
            continue
        url = next((l.strip() for l in lines[i + 1:i + 3]
                    if l.strip() and not l.startswith("#")), None)
        if not url or "youtube.com" in url or "twitch.tv" in url:
            continue  # page URLs, not direct streams — the proxy can't play them
        key = _norm_url(url)
        if key in seen:
            continue
        seen.add(key)
        tvg_id = attr(line, "tvg-id")
        match = by_id.get(tvg_id) if tvg_id else None
        if match:
            match["alt_urls"].append(url)  # fallback after the known-quality streams
            continue
        name = line.split(",", 1)[1].strip() if "," in line else (attr(line, "tvg-name") or "")
        ch = {
            "id": tvg_id,
            "name": name,
            "logo": attr(line, "tvg-logo"),
            "url": url,
            "alt_urls": [],
            "quality": None,
            "number": 0,  # renumbered by build_channels
            "language": attr(line, "tvg-language") or default_lang,
            "category": attr(line, "group-title"),
            "country": attr(line, "tvg-country") or default_country,
            "is_live": None,
        }
        channels.append(ch)
        if tvg_id:
            by_id[tvg_id] = ch  # later links for this channel group in as fallbacks too


def _load_local(channels: list[dict], seen: set[str]) -> None:
    """Merge the local extra-channels M3U — Ukrainian TV, defaulted to language/country so the
    app's language and country filters include them."""
    if LOCAL_M3U.exists():
        _merge_m3u(LOCAL_M3U.read_text(encoding="utf-8"), channels, seen,
                   default_lang="Ukrainian", default_country="UA")


def _load_filters() -> list:
    try:
        if FILTERS_FILE.exists():
            return json.loads(FILTERS_FILE.read_text())
    except Exception:
        pass
    return _default_filters.copy()


def _save_filters(filters: list) -> None:
    FILTERS_FILE.write_text(json.dumps(filters))


def _load_blacklist() -> list:
    try:
        if BLACKLIST_FILE.exists():
            return json.loads(BLACKLIST_FILE.read_text())
    except Exception:
        pass
    return []


def _apply_blacklist(channels: list[dict]) -> list[dict]:
    """Drop omitted stream URLs; return copies so the cached build stays intact. A channel whose
    every URL is blacklisted disappears entirely."""
    bl = {_norm_url(u) for u in _load_blacklist()}
    if not bl:
        return channels
    out = []
    for ch in channels:
        urls = [u for u in [ch["url"], *ch["alt_urls"]] if _norm_url(u) not in bl]
        if urls:
            out.append({**ch, "url": urls[0], "alt_urls": urls[1:]})
    return out


async def build_channels() -> list[dict]:
    """Fetch iptv-org API JSON, join them, return every non-closed channel that has ≥1 stream.
    ponytail: in-memory TTL cache, no persistence — fine for a single-process household server."""
    global _channels_cache, _cache_ts
    if _channels_cache is not None and time.time() - _cache_ts < CACHE_TTL:
        return _channels_cache

    async with httpx.AsyncClient(timeout=60, headers=HEADERS) as c:
        results = await asyncio.gather(
            c.get(f"{IPTV}/api/channels.json"),
            c.get(f"{IPTV}/api/streams.json"),
            c.get(f"{IPTV}/api/feeds.json"),
            c.get(f"{IPTV}/api/languages.json"),
            c.get(f"{IPTV}/api/logos.json"),
            c.get(f"{IPTV}/api/categories.json"),
        )
        try:
            raw_freetv = (await c.get(FREETV)).text  # secondary source — don't fail the list if it's down
        except Exception:
            raw_freetv = ""

    raw_channels, raw_streams, raw_feeds, raw_langs, raw_logos, raw_cats = [r.json() for r in results]

    lang_name = {l["code"]: l["name"] for l in raw_langs}
    cat_name = {c["id"]: c["name"] for c in raw_cats}

    # Union language names across all feeds for each channel
    chan_langs: dict[str, set[str]] = defaultdict(set)
    for f in raw_feeds:
        for code in (f.get("languages") or []):
            chan_langs[f["channel"]].add(lang_name.get(code, code))

    # All stream URLs + quality per channel (preserve order, deduplicate by URL)
    chan_streams: dict[str, list[tuple[str, str | None]]] = defaultdict(list)
    chan_stream_seen: dict[str, set[str]] = defaultdict(set)
    for s in raw_streams:
        ch = s.get("channel")
        url = s.get("url")
        if ch and url and url not in chan_stream_seen[ch]:
            chan_streams[ch].append((url, s.get("quality") or None))
            chan_stream_seen[ch].add(url)

    # Best logo per channel (prefer in_use=true)
    chan_logo: dict[str, str] = {}
    for lg in raw_logos:
        ch = lg.get("channel")
        if ch and (lg.get("in_use") or ch not in chan_logo):  
            chan_logo[ch] = lg["url"]

    channels = []
    for ch in raw_channels:
        if ch.get("closed"):  # closed = date string when closed, absent/empty when open
            continue
        cid = ch["id"]
        streams = chan_streams.get(cid, [])
        if not streams:
            continue
        langs = chan_langs.get(cid, set())
        cats = [cat_name.get(c, c) for c in (ch.get("categories") or [])]
        channels.append({
            "id": cid,
            "name": ch["name"],
            "logo": chan_logo.get(cid),
            "url": streams[0][0],
            "alt_urls": [s[0] for s in streams[1:]],
            "quality": streams[0][1],
            "number": len(channels) + 1,
            "language": ";".join(sorted(langs)) if langs else None,
            "category": ";".join(cats) if cats else None,
            "country": ch.get("country") or None,
            "is_live": None,
        })

    seen_urls = {_norm_url(u) for ch in channels for u in [ch["url"]] + ch["alt_urls"]}
    _merge_m3u(raw_freetv, channels, seen_urls)
    _load_local(channels, seen_urls)

    # Borrow iptv-org logos for local channels that have none (see LOGO_MAP_FILE).
    logo_map = json.loads(LOGO_MAP_FILE.read_text(encoding="utf-8")) if LOGO_MAP_FILE.exists() else {}
    for ch in channels:
        if not ch.get("logo") and ch["id"] in logo_map:
            ch["logo"] = chan_logo.get(logo_map[ch["id"]])

    for i, ch in enumerate(channels):
        ch["number"] = i + 1

    _channels_cache = channels
    _cache_ts = time.time()
    return channels


def apply_filters(channels: list[dict], filters: list[dict]) -> list[dict]:
    """Include/exclude filtering over built channel dicts.
    Includes: OR within a field, AND across fields. Excludes always remove."""
    includes: dict[str, list[str]] = defaultdict(list)
    excludes: list[dict] = []
    for f in filters:
        if f["negate"]:
            excludes.append(f)
        else:
            includes[f["field"]].append(f["value"])

    result = channels

    for field, values in includes.items():
        if field == "country":
            vset = {v.upper() for v in values}
            result = [ch for ch in result if ch.get("country") in vset]
        elif field == "language":
            vset = set(values)
            result = [ch for ch in result
                      if ch.get("language") and vset & {l.strip() for l in ch["language"].split(";")}
]
        elif field == "category":
            vset = set(values)
            result = [ch for ch in result
                      if ch.get("category") and vset & {c.strip() for c in ch["category"].split(";")}
]
        elif field == "quality":
            vset = set(values)
            result = [ch for ch in result if ch.get("quality") in vset]

    for f in excludes:
        field, value = f["field"], f["value"]
        if field == "country":
            result = [ch for ch in result if ch.get("country") != value.upper()]
        elif field == "language":
            result = [ch for ch in result
                      if not ch.get("language") or value not in {l.strip() for l in ch["language"].split(";")}
]
        elif field == "category":
            result = [ch for ch in result
                      if not ch.get("category") or value not in {c.strip() for c in ch["category"].split(";")}
]
        elif field == "quality":
            result = [ch for ch in result if ch.get("quality") != value]

    return result


def _proxy_url(url: str) -> str:
    return f"/proxy?url={urllib.parse.quote(url, safe='')}"


def _hd_label(quality: str | None) -> str | None:
    if not quality:
        return None
    q = quality.lower()
    if "4k" in q or "2160" in q or "uhd" in q:
        return "4K"
    if "1080" in q or "720" in q or "900" in q:
        return "HD"
    return None


def _rewrite_m3u8(text: str, base_url: str) -> str:
    """Rewrite absolute and relative URLs in an m3u8 playlist to route through /proxy."""
    def abs_proxy(uri: str) -> str:
        return _proxy_url(urllib.parse.urljoin(base_url, uri))

    out = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            line = re.sub(r'URI="([^"]+)"', lambda m: f'URI="{abs_proxy(m.group(1))}"', stripped)
        elif stripped:
            line = abs_proxy(stripped)
        out.append(line)
    return "\n".join(out)


app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/filters")
def get_filters():
    return _load_filters()


@app.post("/api/filters")
async def update_filters(request: Request):
    _save_filters(await request.json())
    return {"ok": True}


@app.get("/api/blacklist")
def get_blacklist():
    return _load_blacklist()


@app.post("/api/blacklist")
async def add_blacklist(request: Request):
    """Omit a bad stream URL (debug mode). Idempotent append to blacklist.json."""
    url = (await request.json()).get("url")
    if url:
        bl = _load_blacklist()
        if url not in bl:
            bl.append(url)
            BLACKLIST_FILE.write_text(json.dumps(bl))
    return {"ok": True}


@app.get("/proxy")
async def proxy(url: str):
    is_playlist = url.split("?")[0].lower().endswith((".m3u8", ".m3u"))

    if is_playlist:
        try:
            async with httpx.AsyncClient(timeout=30, headers=HEADERS, follow_redirects=True) as c:
                r = await c.get(url)
        except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError):
            return Response(status_code=504)
        ct = r.headers.get("content-type", "").lower()
        if "mpegurl" in ct or is_playlist:
            return Response(_rewrite_m3u8(r.text, str(r.url)).encode(),
                            media_type="application/vnd.apple.mpegurl")
        return Response(r.content, media_type=ct or "application/octet-stream")

    async def _stream():
        try:
            async with httpx.AsyncClient(timeout=30, headers=HEADERS, follow_redirects=True) as c:
                async with c.stream("GET", url) as r:
                    async for chunk in r.aiter_bytes(chunk_size=65536):
                        yield chunk
        except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError, httpx.ReadError):
            return

    return StreamingResponse(_stream(), media_type="video/mp2t")


@app.get("/api/channels")
async def get_channels():
    return _apply_blacklist(await build_channels())


@app.get("/playlist.m3u")
async def get_playlist(request: Request, proxy: bool = False):
    channels = apply_filters(_apply_blacklist(await build_channels()), _load_filters())
    base = str(request.base_url).rstrip("/")
    lines = ["#EXTM3U"]
    for ch in channels:
        logo = f' tvg-logo="{ch["logo"]}"' if ch.get("logo") else ""
        lang = f' tvg-language="{ch["language"]}"' if ch.get("language") else ""
        cat = f' group-title="{ch["category"]}"' if ch.get("category") else ""
        hd = _hd_label(ch.get("quality"))
        name = f'{ch["name"]} [{hd}]' if hd else ch["name"]
        # One entry per stream URL — players that understand tvg-id group them and try each in order
        for url in [ch["url"]] + (ch.get("alt_urls") or []):
            stream = f"{base}/proxy?url={urllib.parse.quote(url, safe='')}" if proxy else url
            lines.append(f'#EXTINF:-1 tvg-id="{ch["id"]}"{logo}{lang}{cat},{name}')
            lines.append(stream)
    return Response("\n".join(lines), media_type="audio/x-mpegurl",
                    headers={"Content-Disposition": 'inline; filename="playlist.m3u"'})


app.mount("/", StaticFiles(directory="dist", html=True), name="static")
