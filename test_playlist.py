"""One-channel-per-entry + /live lookup checks. Run: python test_playlist.py"""
import asyncio
import server

FAKE = [
    {"id": "a", "name": "Foo", "logo": None, "url": "http://x/1", "alt_urls": ["http://x/2"],
     "quality": None, "number": 1, "language": None, "category": None, "country": "UA", "is_live": None},
    {"id": "b", "name": "Bar", "logo": None, "url": "http://y/1", "alt_urls": [],
     "quality": None, "number": 2, "language": None, "category": None, "country": "UA", "is_live": None},
]


class _Req:
    base_url = "http://host:8000/"


async def _main():
    server.build_channels = lambda: _wrap(FAKE)
    server._load_filters = lambda: []      # ignore the real filters.json
    server._apply_blacklist = lambda ch: ch  # ignore the real blacklist.json
    body = (await server.get_playlist(_Req())).body.decode()
    extinf = [l for l in body.splitlines() if l.startswith("#EXTINF")]
    # 2 channels in, 2 entries out — not one-per-stream (which would be 3)
    assert len(extinf) == 2, extinf
    assert "/live?n=1" in body and "/live?n=2" in body, body

    # /live resolves the right channel by number, 404s on unknown
    served = {}
    async def _fake_serve(urls):
        served["urls"] = urls
    server._serve = _fake_serve
    await server.live(1)
    assert served["urls"] == ["http://x/1", "http://x/2"], served
    assert (await server.live(99)).status_code == 404

    assert server._is_playlist("http://x/a.m3u8?t=1") and not server._is_playlist("http://x/a.ts")

    # EPG is well-formed XML and its channel ids match the M3U tvg-ids
    import xml.etree.ElementTree as ET
    tree = ET.fromstring((await server.epg()).body.decode())
    ids = {c.get("id") for c in tree.findall("channel")}
    assert ids == {"a", "b"}, ids
    assert tree.findall("programme"), "guide has no programme blocks"
    print("ok")


async def _wrap(v):
    return v


asyncio.run(_main())
