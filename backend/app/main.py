import asyncio
import hashlib
import ipaddress
import json
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Path, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import llm
from .auth import optional_user_id
from .candidates import TARGET_RESULTS, Candidate, build_candidates
from .config import MAX_BODY_BYTES, USER_AGENT, settings
from .images import find_image
from .models import (
    MAX_YEAR,
    MIN_YEAR,
    CarDetails,
    CarDetailsRequest,
    CarImage,
    CarResult,
    LLMPick,
    Preferences,
    RecommendResponse,
)
from .store import cache_get, cache_key, cache_put, rate_limit_hit
from .vehicles import catalog, load_catalog

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("carmatch")


async def load_catalog_forever() -> None:
    while True:
        try:
            return await load_catalog()
        except Exception as e:  # network blips at boot shouldn't leave the API without data
            log.error("catalog load failed, retrying in 30s: %r", e)
            await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.http = httpx.AsyncClient(headers={"User-Agent": USER_AGENT})
    loader = asyncio.create_task(load_catalog_forever())
    if not settings.openai_api_key:
        log.warning("OPENAI_API_KEY not set: using data-only (mock) ranking")
    yield
    loader.cancel()
    await app.state.http.aclose()


app = FastAPI(title="CarMatch API", lifespan=lifespan, docs_url=None, redoc_url=None)


@app.middleware("http")
async def limit_body_size(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    if request.method in ("POST", "PUT", "PATCH"):
        length = request.headers.get("content-length")
        if length is None or not length.isdigit():
            return JSONResponse({"detail": "Content-Length required"}, status_code=411)
        if int(length) > MAX_BODY_BYTES:
            return JSONResponse({"detail": "Payload too large"}, status_code=413)
    return await call_next(request)


# Added last so it is outermost and error responses (413/429) also carry CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.allowed_origin_regex,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Retry-After"],
    max_age=600,
)


async def ensure_catalog() -> None:
    try:
        await catalog.ready()
    except TimeoutError:
        raise HTTPException(503, "Vehicle data is still loading. Please try again in a minute.") from None


def _internal(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local


def client_ip(request: Request) -> str:
    parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    # Render's own load balancers append private 10.x hops; drop them before counting proxies.
    while len(parts) > 1 and _internal(parts[-1]):
        parts.pop()
    hops = settings.trusted_proxy_hops
    if parts and hops > 0:
        # Entries left of what our own proxies appended are client-controlled, so count from the right.
        return parts[-hops] if len(parts) >= hops else parts[0]
    return request.client.host if request.client else "unknown"


@app.get("/api/client-ip")
async def whoami(request: Request) -> dict[str, str]:
    """Shows callers the address the rate limiter counts them under (only their own IP, nothing else)."""
    return {"ip": client_ip(request), "forwarded_for": request.headers.get("x-forwarded-for", "")}


@app.get("/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "catalog_loaded": bool(catalog.vehicles)}


@app.get("/api/makes")
async def makes(response: Response) -> dict[str, list[str]]:
    await ensure_catalog()
    response.headers["Cache-Control"] = "public, max-age=86400"
    return {"makes": catalog.makes}


@app.get("/api/image", response_model=CarImage | None)
async def image(
    request: Request,
    response: Response,
    year: int = Query(ge=MIN_YEAR, le=MAX_YEAR),
    make: str = Query(min_length=1, max_length=40),
    model: str = Query(min_length=1, max_length=60, pattern=r"^[A-Za-z0-9 .&'/+()\-]+$"),
) -> CarImage | None:
    """Photo + attribution for one result card. Separate from /api/recommend so results show without waiting."""
    await ensure_catalog()
    if make not in catalog.makes:
        raise HTTPException(404, "Unknown make")
    response.headers["Cache-Control"] = "public, max-age=604800"
    return await find_image(request.app.state.http, year, make, model)


def ndjson(event: dict[str, Any]) -> bytes:
    return (json.dumps(event, separators=(",", ":")) + "\n").encode()


def _span(xs: list[int]) -> str | None:
    return (f"{xs[0]}-{xs[-1]}" if xs[0] != xs[-1] else str(xs[0])) if xs else None


def epa_facts(req: CarDetailsRequest) -> dict[str, Any] | None:
    """Verified EPA facts for the car on a card; None if it isn't in the catalog (so details can't be
    requested for arbitrary text)."""
    rows = [
        v
        for v in catalog.vehicles
        if v.make == req.make and v.year == req.year and v.fuel == req.fuel_type and req.model.startswith(v.base_model)
    ]
    if not rows:
        return None
    base = max((v.base_model for v in rows), key=len)  # "RAV4 Prime" over "RAV4"
    rows = [v for v in rows if v.base_model == base]
    mpg = sorted({v.mpg for v in rows if v.mpg})
    mpge = sorted({v.mpge for v in rows if v.mpge})
    return {
        "epa_class": rows[0].vclass,
        "mpg_combined": _span(mpg),
        "mpge_combined": _span(mpge),
        "drivetrains": sorted({d for v in rows for d in v.drive}),
        "transmissions": sorted({v.transmission for v in rows}),
        "epa_model_variants": sorted({v.model for v in rows})[:10],
    }


@app.post("/api/car-details", response_model=CarDetails)
async def car_details(req: CarDetailsRequest, request: Request) -> CarDetails:
    """Second GPT call when someone opens a car card. Grounded in EPA facts, cached 7 days, rate-limited."""
    http: httpx.AsyncClient = request.app.state.http
    await ensure_catalog()
    epa = epa_facts(req)
    if epa is None:
        raise HTTPException(404, "We don't have EPA data for that car.")
    key = hashlib.sha256(f"details:v1:{req.model_dump_json()}".encode()).hexdigest()
    if cached := await cache_get(http, key):
        return CarDetails.model_validate(cached)
    if not settings.openai_api_key:
        raise HTTPException(503, "Car details need the AI service, which isn't configured.")
    allowed, retry_after = await rate_limit_hit(
        http, f"details:{client_ip(request)}", settings.details_rate_limit_per_hour
    )
    if not allowed:
        raise HTTPException(
            429,
            "You've opened a lot of cars this hour. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    try:
        details = await llm.car_details(http, req, epa)
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as e:
        log.error("car details failed: %r", e)
        raise HTTPException(502, "Couldn't load details for this car right now. Please try again.") from None
    await cache_put(http, key, details.model_dump())
    return details


@app.get("/api/results/{share_id}", response_model=RecommendResponse)
async def shared_results(request: Request, share_id: str = Path(pattern=r"^[0-9a-f]{64}$")) -> RecommendResponse:
    """A shared results link. The id is the SHA-256 cache key, so it can't be guessed or enumerated."""
    cached = await cache_get(request.app.state.http, share_id)
    if not cached:
        raise HTTPException(404, "This shared search has expired. Shared links last 7 days.")
    return RecommendResponse.model_validate({**cached, "cached": True, "share_id": share_id})


@app.post("/api/recommend")
async def recommend(
    prefs: Preferences, request: Request, user_id: str | None = Depends(optional_user_id)
) -> StreamingResponse:
    """Streams NDJSON: {"type":"meta"}, then one {"type":"cars"} per finished batch, then {"type":"done"}
    with the final ordered RecommendResponse. Errors before streaming (422/429/503) are normal JSON."""
    http: httpx.AsyncClient = request.app.state.http
    headers = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    key = cache_key(prefs)

    if cached := await cache_get(http, key):  # cache hits skip the limiter and OpenAI
        log.info("recommend cache hit user=%s", user_id)
        done = RecommendResponse.model_validate({**cached, "cached": True, "share_id": key})
        body = [ndjson({"type": "meta", "relaxed": done.relaxed, "cached": True}), done_event(done)]
        return StreamingResponse(iter(body), media_type="application/x-ndjson", headers=headers)

    ip = client_ip(request)
    allowed, retry_after = await rate_limit_hit(http, f"recommend:{ip}")
    if not allowed:
        log.info("rate limited ip=%s", ip)
        raise HTTPException(
            status_code=429,
            detail="You've reached the search limit for now. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    await ensure_catalog()
    cands, relaxed = build_candidates(catalog.vehicles, prefs, catalog.fuels_by_model)
    started = time.monotonic()

    async def run(batch: list[Candidate]) -> tuple[list[Candidate], list[LLMPick] | None]:
        try:
            return batch, await llm.rank_with_llm(http, prefs, batch)
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as e:
            log.error("LLM batch failed, its slots get data-only backfill: %r", e)
            return batch, None

    async def events() -> AsyncIterator[bytes]:
        yield ndjson({"type": "meta", "relaxed": relaxed, "cached": False})
        used: set[tuple[str, str]] = set()
        results: list[CarResult] = []
        failed = picked = 0
        tasks = (
            [asyncio.ensure_future(run(b)) for b in llm.split_batches(cands)]
            if cands and settings.openai_api_key
            else []
        )
        try:
            for next_done in asyncio.as_completed(tasks):
                batch, picks = await next_done
                if picks is None:
                    failed += 1
                    continue
                cars = llm.validate_batch(prefs, batch, picks, used)
                picked += len(cars)
                results += cars
                if cars:
                    yield ndjson({"type": "cars", "cars": [c.model_dump() for c in cars]})
        finally:
            for t in tasks:  # client disconnected mid-stream: stop paying for unfinished calls
                t.cancel()

        if extra := llm.backfill(prefs, cands, used, TARGET_RESULTS - len(results)):
            results += extra
            yield ndjson({"type": "cars", "cars": [c.model_dump() for c in extra]})

        final = llm.finalize(results)
        notices = []
        if relaxed:
            notices.append(f"Not enough exact matches, so we relaxed: {', '.join(relaxed)}.")
        if len(final) < TARGET_RESULTS:
            notices.append(
                f"Only {len(final)} car{'s' if len(final) != 1 else ''} match your must-haves "
                "(body type, fuel, transmission, seats). Try widening them."
            )
        if cands and not picked:
            notices.append(
                "AI ranking is unavailable right now, so these are data-based matches without price estimates."
            )
        out = RecommendResponse(results=final, relaxed=relaxed, notice=" ".join(notices) or None)
        if failed:  # don't pin a degraded answer in the cache for 7 days, so there's nothing to share either
            yield done_event(out)
        else:
            await cache_put(http, key, out.model_dump(exclude={"cached", "share_id"}))
            yield done_event(out.model_copy(update={"share_id": key}))
        log.info(
            "recommend ip=%s user=%s candidates=%d picks=%d failed_batches=%d relaxed=%s %.1fs",
            ip,
            user_id,
            len(cands),
            picked,
            failed,
            relaxed,
            time.monotonic() - started,
        )

    return StreamingResponse(events(), media_type="application/x-ndjson", headers=headers)


def done_event(out: RecommendResponse) -> bytes:
    return ndjson({"type": "done", **out.model_dump()})
