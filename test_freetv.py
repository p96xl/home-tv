from server import _merge_m3u, _norm_url


def test_merge():
    channels = [{
        "id": "Inter.ua", "name": "Inter", "url": "http://a/hd.m3u8",
        "alt_urls": ["http://a/sd.m3u8"], "quality": "1080p", "number": 1,
        "language": "Ukrainian", "category": None, "country": "UA",
        "logo": None, "is_live": None,
    }]
    m3u = (
        '#EXTINF:-1 tvg-id="Inter.ua" tvg-country="UA" group-title="Ukraine",Inter\n'
        'http://freetv/inter.m3u8\n'
        '#EXTINF:-1 tvg-id="Novyi.ua" tvg-country="UA" group-title="Ukraine",Novyi\n'
        'http://freetv/novyi.m3u8\n'
        '#EXTINF:-1 tvg-id="Dup.pl" tvg-country="PL",Dup\n'
        'http://freetv/dup1.m3u8\n'
        '#EXTINF:-1 tvg-id="Dup.pl" tvg-country="PL",Dup\n'
        'http://freetv/dup2.m3u8\n'
        '#EXTINF:-1 tvg-id="X.ua",X\n'
        'http://a/hd.m3u8\n'  # already seen -> skipped, no new channel
    )
    seen = {_norm_url("http://a/hd.m3u8"), _norm_url("http://a/sd.m3u8")}
    _merge_m3u(m3u, channels, seen)

    inter = channels[0]
    # Free-TV link appended AFTER the known-quality iptv-org streams (fallback order preserved)
    assert inter["alt_urls"] == ["http://a/sd.m3u8", "http://freetv/inter.m3u8"], inter["alt_urls"]
    assert inter["language"] == "Ukrainian" and inter["quality"] == "1080p"  # metadata untouched

    novyi = next(c for c in channels if c["id"] == "Novyi.ua")
    assert novyi["url"] == "http://freetv/novyi.m3u8"
    assert novyi["language"] is None and novyi["country"] == "UA"  # country-agnostic tag

    dup = next(c for c in channels if c["id"] == "Dup.pl")  # any country groups the same
    assert dup["url"] == "http://freetv/dup1.m3u8"
    assert dup["alt_urls"] == ["http://freetv/dup2.m3u8"], dup["alt_urls"]

    assert not any(c["id"] == "X.ua" for c in channels)  # seen url made no new channel
    print("ok")


def test_local_defaults():
    # A local file with no country/language attr should inherit the given defaults, but an
    # explicit tvg-language in the line still wins.
    channels = []
    m3u = ('#EXTINF:-1 tvg-id="Loc.ua",Local\nhttp://loc/a.m3u8\n'
           '#EXTINF:-1 tvg-id="Ovr.ua" tvg-language="Russian",Ovr\nhttp://loc/b.m3u8\n')
    _merge_m3u(m3u, channels, set(), default_lang="Ukrainian", default_country="UA")
    loc = next(c for c in channels if c["id"] == "Loc.ua")
    assert loc["language"] == "Ukrainian" and loc["country"] == "UA", loc
    ovr = next(c for c in channels if c["id"] == "Ovr.ua")
    assert ovr["language"] == "Russian" and ovr["country"] == "UA", ovr
    print("ok")


if __name__ == "__main__":
    test_merge()
    test_local_defaults()
