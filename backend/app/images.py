"""Car photos with attribution: the model's Wikipedia lead image (editor-picked, usually a clean front 3/4 shot),
then a Commons search by year+make+model, then make+model, else None (UI placeholder)."""

import asyncio
import html
import logging
import re
from typing import Any

import httpx

from .models import CarImage

log = logging.getLogger(__name__)

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
# A lead photo shows the current generation; older cars use the year-matched Commons search instead.
LEAD_YEAR_GAP = 4  # model generations last ~5-7 years
MAX_YEAR_GAP = 15  # rejects e.g. a 1958 Land Cruiser for a 2027, but allows a 2014 Durango (same generation)
_limit = asyncio.Semaphore(3)  # Wikimedia asks API clients not to fire many requests in parallel
_cache: dict[str, CarImage | None] = {}
_inflight: dict[str, asyncio.Task[CarImage | None]] = {}  # the prefetch and the card's request share one lookup
MAX_CACHE = 5_000  # /api/image takes free-text model names, so keep the cache bounded


# Words EPA model names carry that photo titles usually don't ("F150 Pickup" vs "Ford F-150").
_GENERIC_WORDS = {"pickup", "hybrid", "plug-in", "electric", "diesel", "2wd", "4wd", "awd", "fwd", "rwd"}


# Commons file names that announce a view a card shouldn't show.
_BAD_VIEW = re.compile(
    r"(?<![a-z])(rear|back|heck|interior|cockpit|dashboard|engine|motor|trunk|badge|emblem|logo|wheel)(?![a-z])", re.I
)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _plain(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def _model_words(model: str) -> str:
    return " ".join(w for w in model.split() if w.lower() not in _GENERIC_WORDS) or model


def _years(title: str) -> list[int]:
    return [int(y) for y in re.findall(r"(?<!\d)(?:19|20)\d{2}(?!\d)", title)]


def _to_image(info: dict[str, Any]) -> CarImage:
    meta = info.get("extmetadata", {})
    return CarImage(
        url=info.get("thumburl") or info["url"],
        page_url=info["descriptionurl"],
        author=_plain(meta.get("Artist", {}).get("value", "")) or "Unknown author",
        license=_plain(meta.get("LicenseShortName", {}).get("value", "")) or "See file page",
        license_url=meta.get("LicenseUrl", {}).get("value") or None,
    )


IMAGEINFO = {
    "prop": "imageinfo",
    "iiprop": "url|extmetadata|mime",
    "iiurlwidth": "500",  # a standard Commons thumb size; cards are ~360px wide (960px was 3x the bytes)
    "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl",
}


async def _wiki_lead(client: httpx.AsyncClient, make: str, model: str, year: int) -> CarImage | None:
    """The lead photo of the model's English Wikipedia article, if it plausibly shows this car's generation."""
    base = {"action": "query", "format": "json", "formatversion": "2", "redirects": "1", "prop": "pageimages|pageprops"}
    name = f"{make} {_model_words(model)}"
    pages: list[dict[str, Any]] = []
    for params in ({"titles": name}, {"generator": "search", "gsrsearch": name, "gsrlimit": "1"}):
        resp = await client.get(WIKIPEDIA_API, params={**base, **params}, timeout=6)
        resp.raise_for_status()
        pages = [
            pg
            for pg in resp.json().get("query", {}).get("pages", [])
            if not pg.get("missing") and "disambiguation" not in pg.get("pageprops", {}) and pg.get("pageimage")
        ]
        if pages:
            break
    page = pages[0] if pages else None
    if not page or _norm(make) not in _norm(page["title"]):
        return None
    file = page["pageimage"]
    # The first year is the model year; later ones are usually the photo's date. No year: can't tell the generation
    # (the "Alfa Romeo Giulia" article is the 1962 car), so the year-matched Commons search decides instead.
    years = _years(file)
    if not years or abs(years[0] - year) > LEAD_YEAR_GAP:
        return None
    resp = await client.get(
        COMMONS_API,
        params={"action": "query", "format": "json", "formatversion": "2", "titles": f"File:{file}", **IMAGEINFO},
        timeout=6,
    )
    resp.raise_for_status()
    info = ((resp.json().get("query", {}).get("pages") or [{}])[0].get("imageinfo") or [{}])[0]
    if info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
        return None
    return _to_image(info)


async def _search(client: httpx.AsyncClient, query: str, model: str, year: int) -> CarImage | None:
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "generator": "search",
        "gsrsearch": f"filetype:bitmap {query}",
        "gsrnamespace": "6",
        "gsrlimit": "10",
        **IMAGEINFO,
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
        if _BAD_VIEW.search(page["title"].replace("_", " ")):
            continue
        years = _years(page["title"])
        gap = min(abs(y - year) for y in years) if years else 5  # undated photos rank as "probably recent-ish"
        if gap <= MAX_YEAR_GAP and (best is None or gap < best[0]):
            best = (gap, info)
    return _to_image(best[1]) if best else None


async def _wiki_lead_or_none(client: httpx.AsyncClient, make: str, model: str, year: int) -> CarImage | None:
    try:
        return await _wiki_lead(client, make, model, year)
    except (httpx.HTTPError, KeyError, ValueError) as e:  # e.g. Wikipedia rate limiting: the Commons search still runs
        log.info("wikipedia lead lookup failed for %s %s: %s", make, model, e)
        return None


async def _lookup(client: httpx.AsyncClient, key: str, make: str, query: str, model: str, year: int) -> CarImage | None:
    try:
        async with _limit:
            found = (
                await _wiki_lead_or_none(client, make, model, year)
                or await _search(client, f"{year} {query}", model, year)
                or await _search(client, query, model, year)
            )
    except (httpx.HTTPError, KeyError, ValueError) as e:
        log.warning("commons lookup failed for %r: %s", query, e)
        return None  # transient: don't cache the miss
    if len(_cache) >= MAX_CACHE:
        _cache.clear()
    _cache[key] = found
    return found


def _key(year: int, make: str, model: str) -> str:
    # "Hybrid", "Pickup" etc. narrow Commons search to almost nothing ("G-Class Hybrid"), so search without them.
    return f"{year} {make} {_model_words(model)}".lower()


def is_cached(year: int, make: str, model: str) -> bool:
    return _key(year, make, model) in _cache


async def find_image(client: httpx.AsyncClient, year: int, make: str, model: str) -> CarImage | None:
    query = f"{make} {_model_words(model)}"
    key = _key(year, make, model)
    if key in _cache:
        return _cache[key]
    task = _inflight.get(key)
    if task is None:
        task = _inflight[key] = asyncio.create_task(_lookup(client, key, make, query, model, year))
        task.add_done_callback(lambda _: _inflight.pop(key, None))
    return await asyncio.shield(task)  # a cancelled request mustn't cancel the shared lookup


def prefetch(client: httpx.AsyncClient, year: int, make: str, model: str) -> None:
    """Start the lookup now so the photo is ready when the card asks for it."""
    asyncio.ensure_future(find_image(client, year, make, model))
