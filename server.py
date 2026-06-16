import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

SETTINGS_FILE = Path("settings.json")
_default_settings = {"country": "UA", "blacklisted_languages": []}
_settings: dict = _default_settings.copy()

_results: dict[str, dict[str, bool | None]] = {}
_running: set[str] = set()

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}


def _load() -> None:
    global _settings
    if SETTINGS_FILE.exists():
        try:
            _settings = {**_default_settings, **json.loads(SETTINGS_FILE.read_text())}
        except Exception:
            pass


def _save() -> None:
    SETTINGS_FILE.write_text(json.dumps(_settings, indent=2))


async def probe(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True, headers=HEADERS) as c:
            if ".m3u8" in url or ".ts" in url:
                r = await c.get(url)
                return r.status_code == 200 and b"#EXT" in r.content[:256]
            r = await c.head(url)
            if r.status_code == 405:
                r = await c.get(url)
            return r.status_code < 400
    except Exception:
        return False


async def run_validation(country: str) -> None:
    code = country.upper()
    if code in _running:
        return
    _running.add(code)
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(f"https://iptv-org.github.io/iptv/countries/{code.lower()}.m3u")
        urls = [l.strip() for l in r.text.splitlines() if l.strip().startswith("http")]
        _results[code] = {u: None for u in urls}

        sem = asyncio.Semaphore(15)

        async def check(url: str) -> None:
            async with sem:
                _results[code][url] = await probe(url)

        await asyncio.gather(*[check(u) for u in urls])
    finally:
        _running.discard(code)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load()
    asyncio.create_task(run_validation(_settings["country"]))
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/settings")
def get_settings() -> dict:
    return _settings


class SettingsUpdate(BaseModel):
    country: str | None = None
    blacklisted_languages: list[str] | None = None


@app.post("/settings")
async def update_settings(body: SettingsUpdate) -> dict:
    global _settings
    if body.country is not None:
        new_country = body.country.upper()
        if new_country != _settings["country"]:
            _settings["country"] = new_country
            asyncio.create_task(run_validation(new_country))
        else:
            _settings["country"] = new_country
    if body.blacklisted_languages is not None:
        _settings["blacklisted_languages"] = body.blacklisted_languages
    _save()
    return _settings


@app.get("/validate")
async def validate(country: str = "UA") -> dict:
    code = country.upper()
    if code not in _results and code not in _running:
        asyncio.create_task(run_validation(code))
    return {
        "results": _results.get(code, {}),
        "running": code in _running,
    }
