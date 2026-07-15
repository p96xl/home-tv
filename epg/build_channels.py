#!/usr/bin/env python3
"""Emit an iptv-org/epg channels.xml for exactly the channels a running Home TV server serves.

Reads the server's /epg.xml (already filtered to the user's settings) for its channel ids, joins
each to iptv-org's guides.json for a grabber site + site_id, keeps one source per channel (prefers
a Ukrainian-language guide). Runs in CI against the public server — no server import, no dist/.

Usage:  python epg/build_channels.py https://tv.example.com > channels.xml
"""
import json
import re
import sys
import urllib.request
from xml.sax.saxutils import escape, quoteattr

GUIDES = "https://iptv-org.github.io/api/guides.json"


def _fetch(url: str) -> str:
    # browser UA — some hosts (Cloudflare) 403 the default urllib agent
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=120).read().decode()


def main() -> None:
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
    ids = set(re.findall(r'<channel id="([^"]+)"', _fetch(f"{base}/epg.xml?verify=false")))
    guides = json.loads(_fetch(GUIDES))

    by_chan: dict[str, list[dict]] = {}
    for e in guides:
        cid = e.get("channel")
        if cid in ids and e.get("site") and e.get("site_id"):
            by_chan.setdefault(cid, []).append(e)

    out = ['<?xml version="1.0" encoding="UTF-8"?>', "<channels>"]
    for cid in sorted(by_chan):
        e = min(by_chan[cid], key=lambda x: 0 if x.get("lang") == "uk" else 1)  # prefer a uk guide
        name = escape(e.get("site_name") or cid)
        out.append(
            f'  <channel site={quoteattr(e["site"])} lang={quoteattr(e.get("lang") or "uk")} '
            f'xmltv_id={quoteattr(cid)} site_id={quoteattr(e["site_id"])}>{name}</channel>')
    out.append("</channels>")
    print("\n".join(out))
    print(f"# {len(by_chan)} channels with a guide source (of {len(ids)} served)", file=sys.stderr)


if __name__ == "__main__":
    main()
