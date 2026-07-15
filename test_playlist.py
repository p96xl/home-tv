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
    body = (await server.get_playlist(_Req(), verify=False)).body.decode()
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
    tree = ET.fromstring((await server.epg(verify=False)).body.decode())
    ids = {c.get("id") for c in tree.findall("channel")}
    assert ids == {"a", "b"}, ids
    assert tree.findall("programme"), "guide has no programme blocks"

    # Real guide.xml: covered channel uses real programmes, uncovered falls back to placeholder
    import tempfile, pathlib
    guide = pathlib.Path(tempfile.mkdtemp()) / "guide.xml"
    guide.write_text('<?xml version="1.0"?><tv>'
                     '<programme start="20260101120000 +0000" stop="20260101130000 +0000" '
                     'channel="a"><title>Real Show</title></programme></tv>', encoding="utf-8")
    server.EPG_FILE = guide
    server._epg_cache = None
    tree = ET.fromstring((await server.epg(verify=False)).body.decode())
    titles = {p.get("channel"): p.findtext("title") for p in tree.findall("programme")}
    assert titles["a"] == "Real Show", titles          # real listing used
    assert titles["b"] == "Bar", titles                # placeholder (channel name) for uncovered

    # Liveness filter: only channels with a responding source survive verify=True
    async def _fake_url_live(url):
        return url == "http://x/2"    # only Foo's alt_url is "live"; Bar has none
    server._url_live = _fake_url_live
    live = await server._live_only(FAKE)
    assert [c["id"] for c in live] == ["a"], live
    # verify=false keeps everything (no probing)
    body_all = (await server.get_playlist(_Req(), verify=False)).body.decode()
    assert body_all.count("#EXTINF") == 2, body_all
    print("ok")


async def _wrap(v):
    return v


asyncio.run(_main())
