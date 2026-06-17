import asyncio
import json
import re
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

FILTERS_FILE = Path("filters.json")
IPTV = "https://iptv-org.github.io"

_default_filters = [{"id": "default-live", "field": "live", "value": "true", "negate": False}]

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}


def _load_filters() -> list:
    try:
        if FILTERS_FILE.exists():
            return json.loads(FILTERS_FILE.read_text())
    except Exception:
        pass
    return _default_filters.copy()


def _save_filters(filters: list) -> None:
    FILTERS_FILE.write_text(json.dumps(filters))


def _parse_m3u(text: str) -> list[dict]:
    lines = text.splitlines()
    channels = []
    for i, line in enumerate(lines):
        line = line.strip()
        if not line.startswith("#EXTINF"):
            continue
        if i + 1 >= len(lines):
            continue
        url = lines[i + 1].strip()
        if not url.startswith("http"):
            continue
        m = re.search(r'tvg-id="([^"]+)"', line)
        tvg_id = m.group(1) if m else ""
        base = tvg_id.split("@")[0]
        suffix = base.split(".")[-1] if "." in base else ""
        country = suffix.upper() if len(suffix) == 2 else None
        cm = re.search(r'group-title="([^"]+)"', line)
        category = cm.group(1) if cm else None
        channels.append({"extinf": line, "url": url, "country": country, "category": category})
    return channels


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/filters")
def get_filters():
    return _load_filters()


@app.post("/api/filters")
async def update_filters(request: Request):
    _save_filters(await request.json())
    return {"ok": True}


@app.get("/playlist.m3u")
async def get_playlist():
    filters = _load_filters()
    includes = [f for f in filters if not f["negate"] and f["field"] in ("country", "language")]

    if not includes:
        return Response("#EXTM3U\n", media_type="audio/x-mpegurl")

    async with httpx.AsyncClient(timeout=30, headers=HEADERS) as c:
        langs_r = await c.get(f"{IPTV}/api/languages.json")
    lang_code = {l["name"]: l["code"] for l in langs_r.json()}

    m3u_urls = []
    for f in includes:
        if f["field"] == "country":
            m3u_urls.append(f"{IPTV}/iptv/countries/{f['value'].lower()}.m3u")
        else:
            code = lang_code.get(f["value"], f["value"].lower())
            m3u_urls.append(f"{IPTV}/iptv/languages/{code}.m3u")

    async with httpx.AsyncClient(timeout=60, headers=HEADERS) as c:
        responses = await asyncio.gather(*[c.get(u) for u in m3u_urls], return_exceptions=True)

    seen = set()
    channels = []
    for r in responses:
        if isinstance(r, Exception):
            continue
        for ch in _parse_m3u(r.text):
            if ch["url"] not in seen:
                seen.add(ch["url"])
                channels.append(ch)

    for f in filters:
        if f["field"] == "country" and f["negate"]:
            channels = [ch for ch in channels if not ch["country"] or ch["country"] != f["value"].upper()]
        elif f["field"] == "category" and f["negate"]:
            channels = [ch for ch in channels if ch["category"] != f["value"]]

    lines = ["#EXTM3U"]
    for ch in channels:
        lines.append(ch["extinf"])
        lines.append(ch["url"])

    return Response("\n".join(lines), media_type="audio/x-mpegurl",
                    headers={"Content-Disposition": 'inline; filename="playlist.m3u"'})
