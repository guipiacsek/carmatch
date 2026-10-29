"""Recommendation cache and rate limiter: in-memory, backed by Supabase (service role) when configured."""

import hashlib
import json
import logging
import time
from collections import deque
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from .config import settings
from .models import Preferences

log = logging.getLogger(__name__)

CACHE_TTL = timedelta(days=7)
CACHE_VERSION = "v3"  # bump when the response shape or ranking logic changes
RATE_WINDOW_SECONDS = 3600


def cache_key(p: Preferences) -> str:
    # Preferences already sorts/dedupes list fields, so equal preferences dump identically.
    normalized = p.model_dump()
    normalized["brands"] = sorted({b.lower() for b in p.brands})
    return hashlib.sha256(f"{CACHE_VERSION}:{json.dumps(normalized, sort_keys=True)}".encode()).hexdigest()


_mem_cache: dict[str, tuple[float, dict[str, Any]]] = {}  # shortcut: unbounded, entries expire on read


async def cache_get(client: httpx.AsyncClient, key: str) -> dict[str, Any] | None:
    hit = _mem_cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL.total_seconds():
        return hit[1]
    if not settings.supabase_enabled:
        return None
    since = (datetime.now(UTC) - CACHE_TTL).isoformat()
    try:
        resp = await client.get(
            f"{settings.supabase_url}/rest/v1/recommendation_cache",
            params={"key": f"eq.{key}", "created_at": f"gte.{since}", "select": "response"},
            headers=settings.supabase_headers(),
            timeout=5,
        )
        resp.raise_for_status()
        rows = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        log.warning("cache read failed: %s", e)
        return None
    if not rows:
        return None
    _mem_cache[key] = (time.time(), rows[0]["response"])
    return rows[0]["response"]  # type: ignore[no-any-return]


async def cache_put(client: httpx.AsyncClient, key: str, response: dict[str, Any]) -> None:
    _mem_cache[key] = (time.time(), response)
    if not settings.supabase_enabled:
        return
    url = f"{settings.supabase_url}/rest/v1/recommendation_cache"
    headers = settings.supabase_headers()
    try:
        resp = await client.post(
            url,
            json={"key": key, "response": response, "created_at": datetime.now(UTC).isoformat()},
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            timeout=5,
        )
        resp.raise_for_status()
        expired = (datetime.now(UTC) - CACHE_TTL).isoformat()
        await client.delete(url, params={"created_at": f"lt.{expired}"}, headers=headers, timeout=5)
    except httpx.HTTPError as e:
        log.warning("cache write failed: %s", e)


class MemoryRateLimiter:
    """Sliding-window log per key."""

    def __init__(self, limit: int, window: int = RATE_WINDOW_SECONDS) -> None:
        self.limit, self.window = limit, window
        self.hits: dict[str, deque[float]] = {}

    def hit(self, key: str, now: float | None = None) -> tuple[bool, int]:
        now = time.time() if now is None else now
        q = self.hits.setdefault(key, deque())
        while q and q[0] <= now - self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False, max(1, int(q[0] + self.window - now + 0.999))
        q.append(now)
        if len(self.hits) > 50_000:  # drop idle keys so memory stays bounded
            self.hits = {k: v for k, v in self.hits.items() if v and v[-1] > now - self.window}
        return True, 0


memory_limiter = MemoryRateLimiter(settings.rate_limit_per_hour)


async def rate_limit_hit(client: httpx.AsyncClient, key: str) -> tuple[bool, int]:
    """(allowed, retry_after_seconds). Uses the shared DB limiter when configured, else/if down, in-memory."""
    if settings.supabase_enabled:
        try:
            resp = await client.post(
                f"{settings.supabase_url}/rest/v1/rpc/rate_limit_hit",
                json={"p_key": key, "p_limit": settings.rate_limit_per_hour, "p_window_seconds": RATE_WINDOW_SECONDS},
                headers=settings.supabase_headers(),
                timeout=5,
            )
            resp.raise_for_status()
            row = resp.json()[0]
            return bool(row["allowed"]), int(row["retry_after"])
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as e:
            log.warning("DB rate limiter unavailable, using in-memory: %s", e)
    return memory_limiter.hit(key)
