import asyncio
from dataclasses import replace

import httpx
import pytest

from app import listings
from app.models import ListingSummary


def run(handler: object, monkeypatch: pytest.MonkeyPatch) -> ListingSummary | None:
    monkeypatch.setattr(listings, "settings", replace(listings.settings, autodev_api_key="k"))

    async def go() -> ListingSummary | None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:  # type: ignore[arg-type]
            return await listings.fetch_listings(client, 2022, "Mercedes", "GLC 300 Hybrid")

    return asyncio.run(go())


@pytest.fixture(autouse=True)
def unpaused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(listings, "_paused_until", 0.0)


def test_lowest_real_price_and_total(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        rows = [{"retailListing": {"price": p}} for p in (0, None, 31_500, 29_990.0)] + [{"retailListing": None}]
        return httpx.Response(200, json={"data": rows, "total": 57})

    found = run(handler, monkeypatch)
    assert found == ListingSummary(count=57, min_price=29_990, checked=listings.date.today().isoformat())
    q = seen[0].url.params
    assert q["vehicle.make"] == "Mercedes-Benz" and q["vehicle.model"] == "GLC 300" and q["sort"] == "price.asc"
    assert seen[0].headers["authorization"] == "Bearer k"


def test_no_priced_listings_is_an_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    empty = run(lambda _: httpx.Response(200, json={"data": [], "total": 0}), monkeypatch)
    assert empty is not None and empty.count == 0 and empty.min_price is None
    assert run(lambda _: httpx.Response(404, json={}), monkeypatch) == empty


def test_errors_are_unknown_and_quota_pauses_lookups(monkeypatch: pytest.MonkeyPatch) -> None:
    assert run(lambda _: httpx.Response(500), monkeypatch) is None
    assert run(lambda _: httpx.Response(200, json={"oops": 1}), monkeypatch) is None
    calls: list[int] = []

    def quota(_: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(429)

    assert run(quota, monkeypatch) is None
    assert run(quota, monkeypatch) is None  # paused: auto.dev isn't asked again
    assert len(calls) == 1
