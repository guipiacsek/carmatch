"""Wikimedia Commons image lookup with attribution: year+make+model, then make+model, else None (UI placeholder)."""

import asyncio
import html
import logging
import re

import httpx

from .models import CarImage

log = logging.getLogger(__name__)

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
_cache: dict[str, CarImage | None] = {}  # shortcut: unbounded per-process cache, fine for a few thousand models


# Words EPA model names carry that photo titles usually don't ("F150 Pickup" vs "Ford F-150").
_GENERIC_WORDS = {"pickup", "hybrid", "plug-in", "electric", "diesel", "2wd", "4wd", "awd", "fwd", "rwd"}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _plain(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


async def _search(client: httpx.AsyncClient, query: str, model: str, year: int) -> CarImage | None:
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "generator": "search",
        "gsrsearch": f"filetype:bitmap {query}",
        "gsrnamespace": "6",
        "gsrlimit": "10",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime",
        "iiurlwidth": "800",
        "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl",
    }
    resp = await client.get(COMMONS_API, params=params, timeout=6)
    resp.raise_for_status()
    pages = sorted(resp.json().get("query", {}).get("pages", []), key=lambda pg: pg.get("index", 0))
    want = _norm(" ".join(w for w in model.split() if w.lower() not in _GENERIC_WORDS)) or _norm(model)
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png", "image/webp") or want not in _norm(page["title"]):
            continue
        if year and any(abs(int(y) - year) > 6 for y in re.findall(r"(?<!\d)(?:19|20)\d{2}(?!\d)", page["title"])):
            continue  # e.g. a 1958 Land Cruiser for a 2027 Land Cruiser
        meta = info.get("extmetadata", {})
        return CarImage(
            url=info.get("thumburl") or info["url"],
            page_url=info["descriptionurl"],
            author=_plain(meta.get("Artist", {}).get("value", "")) or "Unknown author",
            license=_plain(meta.get("LicenseShortName", {}).get("value", "")) or "See file page",
            license_url=meta.get("LicenseUrl", {}).get("value") or None,
        )
    return None


async def find_image(client: httpx.AsyncClient, year: int, make: str, model: str) -> CarImage | None:
    for query in (f"{year} {make} {model}", f"{make} {model}"):
        key = query.lower()
        if key not in _cache:
            try:
                _cache[key] = await _search(client, query, model, year)
            except (httpx.HTTPError, KeyError, ValueError) as e:
                log.warning("commons lookup failed for %r: %s", query, e)
                return None  # transient: don't cache the miss
        if _cache[key]:
            return _cache[key]
    return None


async def find_images(client: httpx.AsyncClient, cars: list[tuple[int, str, str]]) -> list[CarImage | None]:
    return list(await asyncio.gather(*(find_image(client, y, mk, md) for y, mk, md in cars)))
