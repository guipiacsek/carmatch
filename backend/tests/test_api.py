from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import main
from app.store import MemoryRateLimiter, _mem_cache, memory_limiter
from app.vehicles import catalog

from .conftest import fleet

BODY = {"year_min": 2015, "year_max": 2024, "condition": "used", "budget": 30000, "body_types": ["SUV"]}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    async def fake_load() -> None:
        catalog.load(fleet(), None)

    async def no_images(_client: object, cars: list[object]) -> list[None]:
        return [None] * len(cars)

    monkeypatch.setattr(main, "load_catalog", fake_load)
    monkeypatch.setattr(main, "find_images", no_images)
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


def test_recommend_returns_seven_grounded_results(client: TestClient) -> None:
    r = client.post("/api/recommend", json=BODY)
    assert r.status_code == 200
    data = r.json()
    assert len(data["results"]) == 7 and data["cached"] is False
    assert all(c["body_type"] == "SUV" for c in data["results"])


def test_rate_limit_429_and_cache_hits_are_free(client: TestClient) -> None:
    headers = {"X-Forwarded-For": "6.6.6.6, 10.0.0.1"}  # rightmost entry is the one our proxy saw
    for budget in (20000, 21000, 22000):  # limit is 3/hour in tests
        assert client.post("/api/recommend", json={**BODY, "budget": budget}, headers=headers).status_code == 200
    r = client.post("/api/recommend", json={**BODY, "budget": 23000}, headers=headers)
    assert r.status_code == 429
    assert 3500 < int(r.headers["Retry-After"]) <= 3600
    # Same preferences as an earlier search: served from cache, not counted.
    r = client.post("/api/recommend", json={**BODY, "budget": 20000}, headers=headers)
    assert r.status_code == 200 and r.json()["cached"] is True
    # Spoofing the left part of X-Forwarded-For doesn't reset the limit.
    spoofed = {"X-Forwarded-For": "1.1.1.1, 10.0.0.1"}
    assert client.post("/api/recommend", json={**BODY, "budget": 24000}, headers=spoofed).status_code == 429
    other = {"X-Forwarded-For": "10.0.0.2"}
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
