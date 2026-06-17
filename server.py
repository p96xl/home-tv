import asyncio
import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urljoin

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

FILTERS_FILE = Path("filters.json")
IPTV = "https://iptv-org.github.io"
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}

_default_filters = [{"id": "default-live", "field": "live", "value": "true", "negate": False}]
_alive: set[str] | None = None  # None = probe not yet run
_probe_task: asyncio.Task | None = None


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


async def _fetch_all_channels(filters: list) -> list[dict]:
    includes = [f for f in filters if not f["negate"] and f["field"] in ("country", "language")]
    if not includes:
        return []

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

    seen: set[str] = set()
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

    return channels


async def _probe_hls(c: httpx.AsyncClient, url: str, depth: int = 0) -> bool:
    """Walk a master playlist down to a variant/segment and confirm that's reachable too —
    a master manifest can return 200 while the actual stream behind it is geo-blocked or dead."""
    r = await c.get(url)
    if r.status_code != 200 or b"#EXT" not in r.content[:256]:
        return False
    next_url = next((urljoin(url, line.strip()) for line in r.text.splitlines()
                      if line.strip() and not line.startswith("#")), None)
    if next_url is None:
        return False
    if depth == 0 and next_url.endswith(".m3u8"):
        return await _probe_hls(c, next_url, depth=1)
    async with c.stream("GET", next_url) as seg:
        return seg.status_code < 400


async def _probe(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True, headers=HEADERS) as c:
            if ".m3u8" in url:
                return await _probe_hls(c, url)
            if ".ts" in url:
                r = await c.get(url)
                return r.status_code == 200 and b"#EXT" in r.content[:256]
            r = await c.head(url)
            if r.status_code == 405:
                r = await c.get(url)
            return r.status_code < 400
    except Exception:
        return False


async def _probe_loop() -> None:
    global _alive
    while True:
        try:
            filters = _load_filters()
            channels = await _fetch_all_channels(filters)
            if channels:
                sem = asyncio.Semaphore(30)

                async def check(url: str) -> tuple[str, bool]:
                    async with sem:
                        return url, await _probe(url)

                results = await asyncio.gather(*[check(ch["url"]) for ch in channels], return_exceptions=True)
                new_alive: set[str] = set()
                for result in results:
                    if not isinstance(result, Exception):
                        url, ok = result
                        if ok:
                            new_alive.add(url)
                _alive = new_alive
                print(f"Alive check complete: {len(_alive)}/{len(channels)} channels alive")
            else:
                _alive = set()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"Probe error: {e}")
        await asyncio.sleep(3600)


def _restart_probe() -> None:
    global _probe_task, _alive
    _alive = None  # serve all channels until new probe finishes
    if _probe_task and not _probe_task.done():
        _probe_task.cancel()
    _probe_task = asyncio.create_task(_probe_loop())


@asynccontextmanager
async def lifespan(app: FastAPI):
    _restart_probe()
    yield
    if _probe_task:
        _probe_task.cancel()


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/filters")
def get_filters():
    return _load_filters()


@app.post("/api/filters")
async def update_filters(request: Request):
    _save_filters(await request.json())
    _restart_probe()
    return {"ok": True}


@app.get("/api/probe-status")
def probe_status():
    return {"alive": len(_alive) if _alive is not None else None, "running": _alive is None}


@app.get("/playlist.m3u")
async def get_playlist():
    filters = _load_filters()
    channels = await _fetch_all_channels(filters)

    # Only filter by alive status once a probe has completed
    if _alive is not None:
        channels = [ch for ch in channels if ch["url"] in _alive]

    lines = ["#EXTM3U"]
    for ch in channels:
        lines.append(ch["extinf"])
        lines.append(ch["url"])

    return Response("\n".join(lines), media_type="audio/x-mpegurl",
                    headers={"Content-Disposition": 'inline; filename="playlist.m3u"'})
