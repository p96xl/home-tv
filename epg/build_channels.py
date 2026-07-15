#!/usr/bin/env python3
"""Generate an iptv-org/epg channels.xml for exactly the channels our server currently serves.

Reuses server.build_channels + the saved filters, so the guide we grab lines up 1:1 with what
/epg.xml and /playlist.m3u expose (same channel ids = Jellyfin matches them). Each served channel
is joined to iptv-org's guides.json to find a grabber site + site_id; one source per channel is
kept (a Ukrainian-language guide is preferred, else the first listed).

Run from the repo root (needs dist/ built + network):
    python epg/build_channels.py > /path/to/epg-grabber/homietv.channels.xml
Then feed that file to iptv-org/epg's grabber — see epg/refresh.sh, which does the whole thing.
"""
import asyncio
import json
import sys
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402  (needs the path insert above)

GUIDES = "https://iptv-org.github.io/api/guides.json"


async def _served_channels() -> list[dict]:
    return server.apply_filters(server._apply_blacklist(await server.build_channels()),
                                server._load_filters())


def main() -> None:
    ids = {c["id"] for c in asyncio.run(_served_channels()) if c.get("id")}
    guides = json.load(urllib.request.urlopen(GUIDES, timeout=60))

    by_chan: dict[str, list[dict]] = {}
    for e in guides:
        cid = e.get("channel")
        if cid in ids and e.get("site") and e.get("site_id"):
            by_chan.setdefault(cid, []).append(e)

    out = ['<?xml version="1.0" encoding="UTF-8"?>', "<channels>"]
    for cid in sorted(by_chan):
        # one source per channel — prefer a Ukrainian guide, else the first listed
        e = min(by_chan[cid], key=lambda x: 0 if x.get("lang") == "uk" else 1)
        name = escape(e.get("site_name") or cid)
        out.append(
            f'  <channel site={quoteattr(e["site"])} lang={quoteattr(e.get("lang") or "uk")} '
            f'xmltv_id={quoteattr(cid)} site_id={quoteattr(e["site_id"])}>{name}</channel>')
    out.append("</channels>")
    print("\n".join(out))
    print(f"# {len(by_chan)} channels with a guide source (of {len(ids)} served)", file=sys.stderr)


if __name__ == "__main__":
    main()
