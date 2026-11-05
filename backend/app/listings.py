"""Live dealer listings for one car (auto.dev): how many are for sale in the US and the lowest asking price."""

import hashlib
import logging
import time
from datetime import date

import httpx

from .config import settings
from .images import _model_words
from .models import ListingSummary

log = logging.getLogger(__name__)

API_URL = "https://api.auto.dev/listings"
QUOTA_PAUSE = 3600  # seconds; after a quota/auth error, stop calling instead of failing every lookup
MAKE_NAMES = {"Mercedes": "Mercedes-Benz"}  # we show the short name; dealers list the full one
_paused_until = 0.0


def listings_key(year: int, make: str, model: str) -> str:
    return hashlib.sha256(f"listings:v1:{year} {make} {_model_words(model)}".lower().encode()).hexdigest()


async def fetch_listings(client: httpx.AsyncClient, year: int, make: str, model: str) -> ListingSummary | None:
    """None when unknown (no key, paused, any error), so the caller doesn't cache it; zero listings is an answer."""
    global _paused_until
    if not settings.autodev_api_key or time.monotonic() < _paused_until:
        return None
    params = {
        "vehicle.year": str(year),
        "vehicle.make": MAKE_NAMES.get(make, make),
        "vehicle.model": _model_words(model),
        "sort": "price.asc",
        "limit": "20",  # the free plan's page size; sorted by price, so the first one is the lowest
        "includes": "total",
    }
    try:
        resp = await client.get(
            API_URL, params=params, headers={"Authorization": f"Bearer {settings.autodev_api_key}"}, timeout=8
        )
    except httpx.HTTPError as e:
        log.warning("listings lookup failed for %s %s %s: %r", year, make, model, e)
        return None
    today = date.today().isoformat()
    if resp.status_code == 404:
        return ListingSummary(count=0, min_price=None, checked=today)
    if resp.status_code in (401, 402, 403, 429):  # monthly quota used up (or a bad key): back off
        _paused_until = time.monotonic() + QUOTA_PAUSE
        log.warning("auto.dev refused (%s), pausing listings lookups: %s", resp.status_code, resp.text[:200])
        return None
    if resp.status_code >= 400:
        log.warning("auto.dev error %s: %s", resp.status_code, resp.text[:200])
        return None
    try:
        body = resp.json()
        rows = body["data"]
        raw = [(r.get("retailListing") or {}).get("price") for r in rows]
        prices: list[float] = [p for p in raw if isinstance(p, int | float) and p > 0]
        total = int(body.get("total") or len(rows))
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        log.warning("unexpected auto.dev response: %r", e)
        return None
    if not prices:
        return ListingSummary(count=0, min_price=None, checked=today)
    return ListingSummary(count=total, min_price=int(min(prices)), checked=today)
