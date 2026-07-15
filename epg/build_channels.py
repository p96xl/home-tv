#!/usr/bin/env python3
"""Emit an iptv-org/epg channels.xml for the Ukrainian channels that have a guide source.

Uses only iptv-org's public API — it does NOT call your own server, because GitHub's runners get
Cloudflare-403'd by it. A channel is included if any of its feeds lists Ukrainian and none lists
Russian (matching the app's default "language Ukrainian, not Russian" filter). Change INCLUDE /
EXCLUDE below for a different language.

The result is a superset of what the server serves (it also lists a few UA channels the server has
no stream for) — harmless: the server only merges real programmes for channels it actually carries.

Usage:  python epg/build_channels.py > channels.xml
"""
import json
import sys
import urllib.request
from xml.sax.saxutils import escape, quoteattr

API = "https://iptv-org.github.io/api"
INCLUDE = "ukr"   # ISO 639-3 language code to include
EXCLUDE = "rus"   # ... and exclude


def _get(path: str):
    req = urllib.request.Request(f"{API}/{path}", headers={"User-Agent": "Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def main() -> None:
    inc, exc = set(), set()
    for f in _get("feeds.json"):
        codes = f.get("languages") or []
        if INCLUDE in codes:
            inc.add(f["channel"])
        if EXCLUDE in codes:
            exc.add(f["channel"])
    ids = inc - exc

    by_chan: dict[str, list[dict]] = {}
    for e in _get("guides.json"):
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
    print(f"# {len(by_chan)} channels with a guide source (of {len(ids)} {INCLUDE}-not-{EXCLUDE})",
          file=sys.stderr)


if __name__ == "__main__":
    main()
