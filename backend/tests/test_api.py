import dataclasses
from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.candidates import TARGET_RESULTS
from app.models import CarImage
from app.store import MemoryRateLimiter, _mem_cache, memory_limiter
from app.vehicles import catalog

from .conftest import fleet


def stream(resp: object) -> list[dict[str, object]]:
    import json

    return [json.loads(line) for line in resp.text.splitlines() if line]  # type: ignore[attr-defined]


def done(resp: object) -> dict[str, object]:
    return stream(resp)[-1]


BODY = {"year_min": 2015, "year_max": 2024, "condition": "used", "budget": 30000, "body_types": ["SUV"]}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    async def fake_load() -> None:
        catalog.load(fleet())

    async def fake_image(_client: object, year: int, make: str, model: str) -> CarImage:
        return CarImage(url=f"https://img/{year}-{model}.jpg", page_url="https://p", author="A", license="CC0")

    monkeypatch.setattr(main, "load_catalog", fake_load)
    monkeypatch.setattr(main, "find_image", fake_image)
    memory_limiter.hits.clear()
    _mem_cache.clear()
    with TestClient(main.app) as c:
        yield c


def test_memory_rate_limiter_sliding_window() -> None:
    rl = MemoryRateLimiter(limit=2, window=3600)
    assert rl.hit("a", now=0) == (True, 0)
    assert rl.hit("a", now=10) == (True, 0)
    assert rl.hit("a", now=20) == (False, 3580)
    assert rl.hit("b", now=20) == (True, 0)  # per key
    assert rl.hit("a", now=3600) == (True, 0)  # first hit expired


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok", "catalog_loaded": True}


def test_recommend_streams_meta_cars_then_done(client: TestClient) -> None:
    r = client.post("/api/recommend", json=BODY)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/x-ndjson")
    events = stream(r)
    assert events[0]["type"] == "meta" and events[-1]["type"] == "done"
    streamed = [c for e in events if e["type"] == "cars" for c in e["cars"]]  # type: ignore[union-attr]
    final = events[-1]["results"]
    assert isinstance(final, list) and len(final) == TARGET_RESULTS and events[-1]["cached"] is False
    assert {c["car_key"] for c in streamed} == {c["car_key"] for c in final}
    assert all(c["body_type"] == "SUV" for c in final)
    assert [c["rank"] for c in final] == list(range(1, TARGET_RESULTS + 1))


def test_rate_limit_429_and_cache_hits_are_free(client: TestClient) -> None:
    headers = {"X-Forwarded-For": "6.6.6.6, 104.22.14.138, 10.199.1.1"}  # client, Cloudflare, Render LB
    for budget in (20000, 21000, 22000):  # limit is 3/hour in tests
        assert client.post("/api/recommend", json={**BODY, "budget": budget}, headers=headers).status_code == 200
    r = client.post("/api/recommend", json={**BODY, "budget": 23000}, headers=headers)
    assert r.status_code == 429
    assert 3500 < int(r.headers["Retry-After"]) <= 3600
    # Same preferences as an earlier search: served from cache, not counted.
    r = client.post("/api/recommend", json={**BODY, "budget": 20000}, headers=headers)
    assert r.status_code == 200 and done(r)["cached"] is True
    # Spoofing the left part of X-Forwarded-For doesn't reset the limit.
    spoofed = {"X-Forwarded-For": "1.1.1.1, 6.6.6.6, 104.22.14.138, 10.199.1.1"}
    assert client.post("/api/recommend", json={**BODY, "budget": 24000}, headers=spoofed).status_code == 429
    other = {"X-Forwarded-For": "8.8.4.4, 104.22.14.138, 10.199.1.1"}
    assert client.post("/api/recommend", json={**BODY, "budget": 24000}, headers=other).status_code == 200


def test_rejects_oversized_and_invalid_payloads(client: TestClient) -> None:
    big = {**BODY, "brands": ["A" * 30] * 400}
    assert client.post("/api/recommend", json=big).status_code == 413
    assert client.post("/api/recommend", json={**BODY, "budget": -5}).status_code == 422


def test_cors_restricted_to_allowed_origins(client: TestClient) -> None:
    pre = {"Access-Control-Request-Method": "POST"}
    ok = client.options("/api/recommend", headers={**pre, "Origin": "http://localhost:5173"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options("/api/recommend", headers={**pre, "Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers


def test_image_endpoint_validates_and_caches(client: TestClient) -> None:
    ok = client.get("/api/image", params={"year": 2020, "make": "Toyota", "model": "RAV4"})
    assert ok.status_code == 200 and ok.json()["url"] == "https://img/2020-RAV4.jpg"
    assert "max-age" in ok.headers["cache-control"]
    assert client.get("/api/image", params={"year": 2020, "make": "Nope", "model": "X"}).status_code == 404
    assert client.get("/api/image", params={"year": 1800, "make": "Toyota", "model": "RAV4"}).status_code == 422
    assert client.get("/api/image", params={"year": 2020, "make": "Toyota", "model": "<script>"}).status_code == 422


def test_parallel_batches_stream_and_survive_one_failure(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from dataclasses import replace

    import httpx

    from app import llm
    from app.models import LLMPick

    calls: list[int] = []

    async def fake_rank(_http: object, _p: object, batch: list[llm.Candidate]) -> list[LLMPick]:
        calls.append(len(batch))
        if len(calls) == 2:
            raise httpx.ConnectError("boom")
        return [
            LLMPick(
                id=c.id,
                seats=7,
                estimated_price_min=20000,
                estimated_price_max=25000,
                rank=i + 1,
                match_score=90 - i,
                bullets=["a", "b", "c"],
            )
            for i, c in enumerate(batch[: llm.BATCH_PICKS])
        ]

    monkeypatch.setattr(main, "settings", replace(main.settings, openai_api_key="sk-test"))
    monkeypatch.setattr(llm, "rank_with_llm", fake_rank)
    events = stream(client.post("/api/recommend", json={**BODY, "budget": 33333}))
    car_events = [e for e in events if e["type"] == "cars"]
    assert len(calls) == llm.BATCHES
    # the successful batches, then one data-only backfill event for the failed batch's slots
    assert [len(e["cars"]) for e in car_events] == [llm.BATCH_KEEP] * llm.BATCHES  # type: ignore[arg-type]
    final = events[-1]["results"]
    assert isinstance(final, list) and len(final) == TARGET_RESULTS
    assert sum(1 for c in final if c["price_min"] is None) == llm.BATCH_KEEP
    assert final[0]["price_min"] is not None  # priced, high-scoring picks rank above data-only backfill


def test_client_ip_skips_render_internal_hops(client: TestClient) -> None:
    ip = client.get(
        "/api/client-ip", headers={"X-Forwarded-For": "1.1.1.1, 8.8.8.8, 104.22.14.138, 10.199.143.70"}
    ).json()
    assert ip["ip"] == "8.8.8.8"  # 10.x = Render LB, 104.x = Cloudflare, 1.1.1.1 = client-supplied (ignored)


def test_share_link_round_trip(client: TestClient) -> None:
    final = done(client.post("/api/recommend", json={**BODY, "budget": 27500}))
    share_id = final["share_id"]
    assert isinstance(share_id, str) and len(share_id) == 64
    shared = client.get(f"/api/results/{share_id}").json()
    assert shared["results"] == final["results"] and shared["share_id"] == share_id
    assert client.get("/api/results/" + "0" * 64).status_code == 404
    assert client.get("/api/results/not-a-hash").status_code == 422


def test_car_details_grounded_cached_and_validated(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from dataclasses import replace

    from app import llm
    from app.models import CarDetails, Trim

    calls: list[dict[str, object]] = []

    async def fake_details(_http: object, req: object, epa: dict[str, object]) -> CarDetails:
        calls.append(epa)
        return CarDetails(
            summary="s",
            pros=["a", "b", "c"],
            cons=["d", "e", "f"],
            reliability="r",
            trims=[Trim(name="LE", highlight="base")],
            used_buying_tips=["x", "y", "z"],
            competitors=["Honda CR-V", "Mazda CX-5", "Kia Sportage"],
            epa=epa,
        )

    monkeypatch.setattr(main, "settings", replace(main.settings, openai_api_key="sk-test"))
    monkeypatch.setattr(llm, "car_details", fake_details)
    body = {"year": 2020, "make": "Toyota", "model": "RAV4", "fuel_type": "Gas"}
    first = client.post("/api/car-details", json=body)
    assert first.status_code == 200 and first.json()["epa"]["drivetrains"] == ["AWD", "FWD"]
    assert client.post("/api/car-details", json=body).json() == first.json()
    assert len(calls) == 1  # second open served from cache
    assert client.post("/api/car-details", json={**body, "model": "Batmobile"}).status_code == 404
    assert client.post("/api/car-details", json={**body, "model": "<script>"}).status_code == 422


def test_warm_up_is_throttled(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    calls = 0

    class FakeHttp:
        async def get(self, *args: object, **kwargs: object) -> None:
            nonlocal calls
            calls += 1

    from dataclasses import replace

    monkeypatch.setattr(main, "settings", replace(main.settings, openai_api_key="sk-test"))
    monkeypatch.setattr(main, "_last_warm", 0.0)

    async def spam() -> None:
        for _ in range(5):  # e.g. someone hammering /health?warm=1
            await main.warm_connections(FakeHttp())  # type: ignore[arg-type]

    asyncio.run(spam())
    assert calls == 1 + int(main.settings.supabase_enabled)  # one warm-up's worth of requests, not five


def test_rates_are_cached_for_a_day_and_survive_an_outage(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio
    from types import SimpleNamespace

    import httpx

    fetches = 0
    up = True

    class FakeHttp:
        async def get(self, url: str, **kwargs: object) -> httpx.Response:
            nonlocal fetches
            fetches += 1
            if not up:
                raise httpx.ConnectError("down")
            body = {"date": "2026-10-29", "rates": {"BRL": 5.35, "JPY": 158.1, "MXN": 18.7}}
            return httpx.Response(200, json=body, request=httpx.Request("GET", url))

    req = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(http=FakeHttp())))
    monkeypatch.setattr(main, "_rates", {})
    monkeypatch.setattr(main, "_rates_at", -float(main.RATES_TTL))

    async def get() -> dict[str, object]:
        return await main.rates(req, main.Response())  # type: ignore[arg-type]

    first = asyncio.run(get())
    assert first["rates"] == {"BRL": 5.35, "JPY": 158.1, "MXN": 18.7}
    asyncio.run(get())
    assert fetches == 1  # second call within a day uses the cached rates

    up = False
    monkeypatch.setattr(main, "_rates_at", main.time.monotonic() - main.RATES_TTL - 1)  # a day later, source down
    assert asyncio.run(get()) == first  # last good rates still served


def test_delete_account_requires_sign_in(client: TestClient) -> None:
    assert client.post("/api/account/delete").status_code == 401


def test_delete_account_calls_supabase_admin(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    async def fake_delete(url: str, **_: object) -> httpx.Response:
        calls.append(url)
        return httpx.Response(200, request=httpx.Request("DELETE", url))

    main.app.dependency_overrides[main.optional_user_id] = lambda: "user-1"
    fake = dataclasses.replace(main.settings, supabase_url="https://x.supabase.co", supabase_service_role_key="k")
    monkeypatch.setattr(main, "settings", fake)
    monkeypatch.setattr(main.app.state.http, "delete", fake_delete)
    try:
        assert client.post("/api/account/delete").status_code == 204
    finally:
        main.app.dependency_overrides.clear()
    assert calls == ["https://x.supabase.co/auth/v1/admin/users/user-1"]
