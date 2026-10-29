"""Wikimedia Commons image lookup with attribution: year+make+model, then make+model, else None (UI placeholder)."""

import asyncio
import html
import logging
import re
from typing import Any

import httpx

from .models import CarImage

log = logging.getLogger(__name__)

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
MAX_YEAR_GAP = 15  # rejects e.g. a 1958 Land Cruiser for a 2027, but allows a 2014 Durango (same generation)
_limit = asyncio.Semaphore(3)  # Wikimedia asks API clients not to fire many requests in parallel
_cache: dict[str, CarImage | None] = {}
_inflight: dict[str, asyncio.Task[CarImage | None]] = {}  # the prefetch and the card's request share one lookup
MAX_CACHE = 5_000  # /api/image takes free-text model names, so keep the cache bounded


# Words EPA model names carry that photo titles usually don't ("F150 Pickup" vs "Ford F-150").
_GENERIC_WORDS = {"pickup", "hybrid", "plug-in", "electric", "diesel", "2wd", "4wd", "awd", "fwd", "rwd"}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _plain(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def _model_words(model: str) -> str:
    return " ".join(w for w in model.split() if w.lower() not in _GENERIC_WORDS) or model


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
        "iiurlwidth": "500",  # a standard Commons thumb size; cards are ~360px wide (960px was 3x the bytes)
        "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl",
    }
    resp = await client.get(COMMONS_API, params=params, timeout=6)
    resp.raise_for_status()
    pages = sorted(resp.json().get("query", {}).get("pages", []), key=lambda pg: pg.get("index", 0))
    want = _norm(_model_words(model))
    best: tuple[int, dict[str, Any]] | None = None
    for page in pages:  # search order; keep the photo whose title year is closest to the car's
        info = (page.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png", "image/webp") or want not in _norm(page["title"]):
            continue
        years = [int(y) for y in re.findall(r"(?<!\d)(?:19|20)\d{2}(?!\d)", page["title"])]
        gap = min(abs(y - year) for y in years) if years else 5  # undated photos rank as "probably recent-ish"
        if gap <= MAX_YEAR_GAP and (best is None or gap < best[0]):
            best = (gap, info)
    if best is not None:
        info = best[1]
        meta = info.get("extmetadata", {})
        return CarImage(
            url=info.get("thumburl") or info["url"],
            page_url=info["descriptionurl"],
            author=_plain(meta.get("Artist", {}).get("value", "")) or "Unknown author",
            license=_plain(meta.get("LicenseShortName", {}).get("value", "")) or "See file page",
            license_url=meta.get("LicenseUrl", {}).get("value") or None,
        )
    return None


async def _lookup(client: httpx.AsyncClient, key: str, query: str, model: str, year: int) -> CarImage | None:
    try:
        async with _limit:
            found = await _search(client, f"{year} {query}", model, year) or await _search(client, query, model, year)
    except (httpx.HTTPError, KeyError, ValueError) as e:
        log.warning("commons lookup failed for %r: %s", query, e)
        return None  # transient: don't cache the miss
    if len(_cache) >= MAX_CACHE:
        _cache.clear()
    _cache[key] = found
    return found


async def find_image(client: httpx.AsyncClient, year: int, make: str, model: str) -> CarImage | None:
    # "Hybrid", "Pickup" etc. narrow Commons search to almost nothing ("G-Class Hybrid"), so search without them.
    query = f"{make} {_model_words(model)}"
    key = f"{year} {query}".lower()
    if key in _cache:
        return _cache[key]
    task = _inflight.get(key)
    if task is None:
        task = _inflight[key] = asyncio.create_task(_lookup(client, key, query, model, year))
        task.add_done_callback(lambda _: _inflight.pop(key, None))
    return await asyncio.shield(task)  # a cancelled request mustn't cancel the shared lookup


def prefetch(client: httpx.AsyncClient, year: int, make: str, model: str) -> None:
    """Start the lookup now so the photo is ready when the card asks for it."""
    asyncio.ensure_future(find_image(client, year, make, model))
