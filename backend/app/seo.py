"""Static SEO guide pages ("Best used SUVs under $25,000") built from real CarMatch searches.

Run from backend/ with OPENAI_API_KEY set:  python -m app.seo
Writes frontend/public/best/*.html, frontend/public/sitemap.xml. Re-run monthly so prices and years stay current.
"""

import asyncio
import json
import os
from collections.abc import Mapping
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import quote, urlencode

import httpx

from . import llm
from .candidates import TARGET_RESULTS, build_candidates
from .config import USER_AGENT
from .images import find_image
from .models import MAX_YEAR, CarImage, CarResult, Preferences
from .vehicles import catalog, load_catalog

SITE = "https://mycarmatch.vercel.app"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public")
USED = {"condition": "used", "year_min": MAX_YEAR - 11, "year_max": MAX_YEAR - 1}
NEW = {"condition": "new", "year_min": MAX_YEAR - 1, "year_max": MAX_YEAR}

# slug, H1, intro, preferences (anything left out takes the Preferences default)
GUIDES: list[tuple[str, str, str, dict[str, object]]] = [
    ("used-suvs-under-25000", "Best used SUVs under $25,000",
     "Room for passengers and cargo without a new-car price: the used SUVs that give the most for $25k.",
     {**USED, "body_types": ["SUV"], "budget": 25_000, "priorities": ["reliability", "family"]}),
    ("used-sedans-under-20000", "Best used sedans under $20,000",
     "Comfortable, efficient and cheap to run: the used sedans worth shortlisting for under $20k.",
     {**USED, "body_types": ["Sedan"], "budget": 20_000, "priorities": ["reliability", "fuel_economy"]}),
    ("used-trucks-under-35000", "Best used pickup trucks under $35,000",
     "Pickups that tow, haul and hold their value, at used prices under $35k.",
     {**USED, "body_types": ["Truck"], "budget": 35_000, "priorities": ["towing", "reliability"]}),
    ("new-suvs-under-40000", "Best new SUVs under $40,000",
     "The new SUVs that balance space, tech and price at or under $40k MSRP.",
     {**NEW, "body_types": ["SUV"], "budget": 40_000, "priorities": ["family", "reliability"]}),
    ("electric-cars-under-50000", "Best electric cars under $50,000",
     "EVs with real-world range and fast charging for under $50k, new or nearly new.",
     {"condition": "either", "year_min": MAX_YEAR - 4, "year_max": MAX_YEAR, "fuel_types": ["Electric"],
      "budget": 50_000, "priorities": ["commuting"]}),
    ("used-hybrids-under-25000", "Best used hybrids under $25,000",
     "High-MPG hybrids that cut fuel bills, for under $25k used.",
     {**USED, "fuel_types": ["Hybrid"], "budget": 25_000, "priorities": ["fuel_economy", "reliability"]}),
    ("3-row-suvs-under-45000", "Best 3-row SUVs under $45,000",
     "Seven seats or more for growing families, without going over $45k.",
     {"condition": "either", "year_min": MAX_YEAR - 6, "year_max": MAX_YEAR, "body_types": ["SUV"],
      "budget": 45_000, "min_seats": 7, "priorities": ["family"]}),
    ("minivans", "Best minivans for families",
     "Sliding doors, three rows and endless cargo space: the minivans families pick.",
     {"condition": "either", "year_min": MAX_YEAR - 6, "year_max": MAX_YEAR, "body_types": ["Minivan"],
      "budget": 50_000, "priorities": ["family", "reliability"]}),
    ("first-cars-under-15000", "Best first cars under $15,000",
     "Safe, reliable and cheap to insure: used cars for new drivers under $15k.",
     {**USED, "body_types": ["Sedan", "Hatchback", "Compact"], "budget": 15_000,
      "priorities": ["reliability", "fuel_economy"]}),
    ("awd-suvs-under-30000", "Best AWD SUVs under $30,000",
     "All-wheel-drive SUVs for snow and rough roads, for under $30k used.",
     {**USED, "body_types": ["SUV"], "drivetrain": "AWD", "budget": 30_000, "priorities": ["reliability"]}),
    ("sports-cars-under-40000", "Best sports cars under $40,000",
     "Coupes and convertibles that are fun to drive, for under $40k.",
     {"condition": "either", "year_min": MAX_YEAR - 8, "year_max": MAX_YEAR, "body_types": ["Coupe", "Convertible"],
      "budget": 40_000, "priorities": ["performance"]}),
    ("luxury-suvs-under-60000", "Best luxury SUVs under $60,000",
     "Premium cabins and badges for under $60k, new or lightly used.",
     {"condition": "either", "year_min": MAX_YEAR - 4, "year_max": MAX_YEAR, "body_types": ["SUV"],
      "budget": 60_000, "priorities": ["luxury"]}),
]  # fmt: skip


async def search(client: httpx.AsyncClient, p: Preferences) -> list[CarResult]:
    """The /api/recommend pipeline without streaming, caching or rate limiting."""
    cands, _ = build_candidates(catalog.vehicles, p, catalog.fuels_by_model)
    batches = llm.split_batches(cands)
    used: set[tuple[str, str]] = set()
    results: list[CarResult] = []
    picks_per_batch = await asyncio.gather(*(llm.rank_with_llm(client, p, b) for b in batches), return_exceptions=True)
    for batch, picks in zip(batches, picks_per_batch, strict=True):
        if isinstance(picks, BaseException):
            raise RuntimeError(f"OpenAI call failed, not publishing a degraded page: {picks!r}")
        results += llm.validate_batch(p, batch, picks, used)
    results += llm.backfill(p, cands, used, TARGET_RESULTS - len(results))
    return llm.finalize(results)


def usd(n: int | None) -> str:
    return f"${n:,}" if n is not None else "?"


def efficiency(c: CarResult) -> str:
    if c.fuel_type == "Electric":
        return f"{c.mpge} MPGe" if c.mpge else "n/a"
    return f"{c.mpg} MPG" if c.mpg else "n/a"


def listings_url(c: CarResult) -> str:  # mirrors frontend/src/lib/listings.ts
    slug = "".join(ch for ch in c.make.lower().replace(" ", "_").replace("-", "_") if ch.isalnum() or ch == "_")
    params = {"stock_type": "all" if c.year >= MAX_YEAR - 1 else "used", "makes[]": slug, "year_min": c.year,
              "year_max": c.year, "keyword": c.model, "maximum_distance": "all", "zip": ""}  # fmt: skip
    return "https://www.cars.com/shopping/results/?" + urlencode(params)


CSS = Path(__file__).with_name("seo.css").read_text()


def page(title: str, description: str, path: str, body: str, json_ld: Mapping[str, object]) -> str:
    url = SITE + path
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)} | CarMatch</title>
<meta name="description" content="{escape(description)}">
<link rel="canonical" href="{url}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="article"><meta property="og:site_name" content="CarMatch">
<meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}">
<meta property="og:url" content="{url}"><meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@200;300;500;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json">{json.dumps(json_ld).replace("</", "<\\/")}</script>
<style>{CSS}</style>
</head>
<body><div class="wrap">
<header><a class="logo" href="/">c<i>.</i> CarMatch</a><a class="cta" href="/">Find your car</a></header>
{body}
<footer><p><strong>Prices are AI estimates, not offers.</strong> Always confirm price, availability and specs with \
the seller. Vehicle data from fueleconomy.gov (EPA/DOE). Photos from Wikimedia Commons contributors, credited on \
each car.</p></footer>
</div></body></html>
"""


def car_card(c: CarResult, img: CarImage | None, i: int) -> str:
    alt = f"{c.year} {escape(c.make)} {escape(c.model)}"
    photo = f'<img src="{escape(img.url)}" alt="{alt}" loading="lazy">' if img else ""
    credit = (
        f'<p class="credit">Photo: <a href="{escape(img.page_url)}" rel="nofollow noopener" target="_blank">'
        f"{escape(img.author)}, {escape(img.license)}</a> via Wikimedia Commons</p>"
        if img
        else ""
    )
    price = f"{usd(c.price_min)} – {usd(c.price_max)}" if c.price_min is not None else "No estimate"
    bullets = "".join(f"<li>{escape(b)}</li>" for b in c.bullets)
    return f"""<li class="car" style="--c:var(--a{(i % 4) + 1})">
<div class="arc"><span class="rank">#{c.rank}</span>{photo}
<h2><span>{escape(c.make)}</span><b>{escape(c.model)}</b><small>{c.year}</small></h2></div>
<div class="body"><div class="facts"><span>{escape(c.fuel_type)}</span><span>{escape(efficiency(c))}</span>\
<span>{escape(c.drivetrain)}</span><span>{c.seats} seats</span></div>
<p class="price"><small>AI PRICE ESTIMATE</small>{price}</p><ul>{bullets}</ul>
<div class="links"><a href="{escape(listings_url(c))}" rel="nofollow sponsored noopener" target="_blank">\
Listings on Cars.com ↗</a></div>{credit}</div></li>"""


def guide_page(
    slug: str, h1: str, intro: str, p: Preferences, cars: list[CarResult], imgs: list[CarImage | None]
) -> str:
    month = date.today().strftime("%B %Y")
    title = f"{h1} ({date.today().year})"
    personalize = "/results?p=" + quote(p.model_dump_json(), safe="")
    others = "".join(f'<a href="/best/{s}">{escape(t)}</a>' for s, t, _, _ in GUIDES if s != slug)
    body = f"""<main><h1>{escape(title)}</h1><p class="lede">{escape(intro)}</p>
<p class="meta">Updated {month} · Ranked by AI from EPA vehicle data · \
<a href="{personalize}">Personalize this list →</a></p>
<ol class="cars">{"".join(car_card(c, img, i) for i, (c, img) in enumerate(zip(cars, imgs, strict=True)))}</ol>
<section class="how"><h2>How CarMatch picks these</h2>
<p>Every car comes from the U.S. EPA fuel-economy database, so models, years, MPG and drivetrains are real. An AI \
model then ranks the best fits for this budget and use, and estimates a typical U.S. price range. Prices are \
estimates, so check listings before you buy.</p>
<p>Your needs are different? <a href="{personalize}">Start from this list and adjust it</a> or \
<a href="/">answer a few questions</a> for your own ranked matches.</p>
<h2>More guides</h2><div class="more">{others}</div></section></main>"""
    json_ld = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": title,
        "itemListElement": [
            {"@type": "ListItem", "position": c.rank, "name": f"{c.year} {c.make} {c.model}"} for c in cars
        ],
    }
    return page(title, f"{intro} Updated {month}.", f"/best/{slug}", body, json_ld)


def index_page() -> str:
    links = "".join(
        f'<li class="car" style="--c:var(--a{(i % 4) + 1})"><a href="/best/{s}" style="text-decoration:none">'
        f'<div class="arc" style="height:120px"><h2><b>{escape(t)}</b></h2></div>'
        f'<div class="body"><p>{escape(intro)}</p></div></a></li>'
        for i, (s, t, intro, _) in enumerate(GUIDES)
    )
    body = f"""<main><h1>Car buying guides</h1><p class="lede">Ranked shortlists for common budgets and needs, \
built from EPA vehicle data and AI price estimates.</p><ol class="cars">{links}</ol></main>"""
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "CarMatch car buying guides"}
    return page("Car buying guides", "Ranked car shortlists for common budgets and needs.", "/best", body, ld)


def sitemap() -> str:
    today = date.today().isoformat()
    urls = ["/", "/best", *(f"/best/{s}" for s, _, _, _ in GUIDES)]
    rows = "".join(f"<url><loc>{SITE}{u}</loc><lastmod>{today}</lastmod></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{rows}</urlset>\n'


async def main() -> None:
    await load_catalog()
    os.makedirs(os.path.join(OUT, "best"), exist_ok=True)
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        for slug, h1, intro, raw in GUIDES:
            p = Preferences.model_validate(raw)
            # A page titled "under $X" can't list cars the app flags as over budget (the app shows them last).
            cars = [
                c.model_copy(update={"rank": i + 1})
                for i, c in enumerate(r for r in await search(client, p) if not r.over_budget)
            ]
            imgs = await asyncio.gather(*(find_image(client, c.year, c.make, c.model) for c in cars))
            if None in imgs:  # Commons lookups fail transiently under load; one retry
                await asyncio.sleep(2)
                imgs = [i or await find_image(client, c.year, c.make, c.model) for c, i in zip(cars, imgs, strict=True)]
            with open(os.path.join(OUT, "best", f"{slug}.html"), "w") as f:
                f.write(guide_page(slug, h1, intro, p, cars, list(imgs)))
            print(f"{slug}: {len(cars)} cars, {sum(i is not None for i in imgs)} photos")
    with open(os.path.join(OUT, "best", "index.html"), "w") as f:
        f.write(index_page())
    with open(os.path.join(OUT, "sitemap.xml"), "w") as f:
        f.write(sitemap())


if __name__ == "__main__":
    asyncio.run(main())
