import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import llm
from .auth import optional_user_id
from .candidates import TARGET_RESULTS, build_candidates
from .config import MAX_BODY_BYTES, USER_AGENT, settings
from .images import find_image
from .models import MAX_YEAR, MIN_YEAR, CarImage, LLMPick, Preferences, RecommendResponse
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


def client_ip(request: Request) -> str:
    parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    hops = settings.trusted_proxy_hops
    if parts and hops > 0:
        # Entries left of what our own proxies appended are client-controlled, so count from the right.
        return parts[-hops] if len(parts) >= hops else parts[0]
    return request.client.host if request.client else "unknown"


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


@app.post("/api/recommend", response_model=RecommendResponse)
async def recommend(
    prefs: Preferences, request: Request, user_id: str | None = Depends(optional_user_id)
) -> RecommendResponse:
    http: httpx.AsyncClient = request.app.state.http
    started = time.monotonic()
    key = cache_key(prefs)

    if cached := await cache_get(http, key):  # cache hits skip the limiter and OpenAI
        log.info("recommend cache hit user=%s", user_id)
        return RecommendResponse.model_validate({**cached, "cached": True})

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

    picks: list[LLMPick] = []
    llm_failed = False
    if cands and settings.openai_api_key:
        try:
            picks = await llm.rank_with_llm(http, prefs, cands)
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as e:
            log.error("LLM ranking failed, falling back to data-only ranking: %r", e)
            llm_failed = True
    results = llm.assemble(prefs, cands, picks)

    notices = []
    if relaxed:
        notices.append(f"Not enough exact matches, so we relaxed: {', '.join(relaxed)}.")
    if len(results) < TARGET_RESULTS:
        notices.append(
            f"Only {len(results)} car{'s' if len(results) != 1 else ''} match your must-haves "
            "(body type, fuel, transmission, seats). Try widening them."
        )
    if cands and not picks:
        notices.append("AI ranking is unavailable right now, so these are data-based matches without price estimates.")
    out = RecommendResponse(results=results, relaxed=relaxed, notice=" ".join(notices) or None)

    if not llm_failed:  # don't pin a degraded answer in the cache for 7 days
        await cache_put(http, key, out.model_dump(exclude={"cached"}))
    log.info(
        "recommend ip=%s user=%s candidates=%d picks=%d relaxed=%s %.1fs",
        ip,
        user_id,
        len(cands),
        len(picks),
        relaxed,
        time.monotonic() - started,
    )
    return out
