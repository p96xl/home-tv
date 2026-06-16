import asyncio
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

_results: dict[str, dict[str, bool | None]] = {}
_running: set[str] = set()

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}


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
    asyncio.create_task(run_validation("UA"))
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/validate")
async def validate(country: str = "UA") -> dict:
    code = country.upper()
    if code not in _results and code not in _running:
        asyncio.create_task(run_validation(code))
    return {
        "results": _results.get(code, {}),
        "running": code in _running,
    }
