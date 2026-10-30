"""Top 10 rankings ("Top 10 new SUVs under $40,000") built from real CarMatch searches.

Run from backend/ with OPENAI_API_KEY set:  python -m app.seo [en pt-BR es ja]   (default: all four)
Writes frontend/public/rankings.{lang}.json (the app's Rankings page, one file per language). The English pass also
writes the static SEO pages (frontend/public/best/*.html, sitemap.xml). The output is static: nothing regenerates it
on its own, so pass only the languages you want rebuilt.
Add --photos to keep the saved lists (no OpenAI calls) and only refresh their photos.
"""

import asyncio
import json
import os
import sys
from collections.abc import Mapping
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import quote, urlencode

import httpx

from . import llm
from .candidates import build_candidates
from .config import USER_AGENT
from .images import find_image
from .models import MAX_YEAR, CarImage, CarResult, Preferences
from .vehicles import catalog, load_catalog

SITE = "https://mycarmatch.vercel.app"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public")
# 5-10 years old, so honest used prices fit the budgets
USED = {"condition": "used", "year_min": MAX_YEAR - 11, "year_max": MAX_YEAR - 6}
NEW = {"condition": "new", "year_min": MAX_YEAR - 1, "year_max": MAX_YEAR}

RANK_SIZE = 10  # "Top 10" lists; the app's searches show 9

# slug, preferences (anything left out takes the Preferences default)
GUIDES: list[tuple[str, dict[str, object]]] = [
    ("new-suvs-under-40000", {**NEW, "body_types": ["SUV"], "budget": 40_000, "priorities": ["family", "reliability"]}),
    (
        "used-suvs-under-30000",
        {**USED, "body_types": ["SUV"], "budget": 30_000, "priorities": ["reliability", "family"]},
    ),
    (
        "new-sedans-under-30000",
        {**NEW, "body_types": ["Sedan"], "budget": 30_000, "priorities": ["reliability", "fuel_economy"]},
    ),
    (
        "new-trucks-under-50000",
        {**NEW, "body_types": ["Truck"], "budget": 50_000, "priorities": ["towing", "reliability"]},
    ),
    ("electric-cars-under-50000", {**NEW, "fuel_types": ["Electric"], "budget": 50_000, "priorities": ["commuting"]}),
    (
        "hybrids-under-35000",
        {**NEW, "fuel_types": ["Hybrid"], "budget": 35_000, "priorities": ["fuel_economy", "reliability"]},
    ),
    (
        "3-row-suvs-under-50000",
        {**NEW, "body_types": ["SUV"], "budget": 50_000, "seats": [7, 8], "priorities": ["family"]},
    ),
    (
        "first-cars-under-20000",
        {
            **USED,
            "body_types": ["Sedan", "Hatchback", "Compact"],
            "budget": 20_000,
            "priorities": ["reliability", "fuel_economy"],
        },
    ),
    (
        "sports-cars-under-50000",
        {
            "condition": "either",
            "year_min": MAX_YEAR - 5,
            "year_max": MAX_YEAR,
            "body_types": ["Coupe", "Convertible"],
            "budget": 50_000,
            "priorities": ["performance"],
        },
    ),
    ("luxury-suvs-under-70000", {**NEW, "body_types": ["SUV"], "budget": 70_000, "priorities": ["luxury"]}),
]

# Per language and slug: title, short label (shown under a "TOP 10" badge), intro.
# Budgets stay in US dollars: these are U.S.-market prices.
TEXT: dict[str, dict[str, tuple[str, str, str]]] = {
    "en": {
        "new-suvs-under-40000": ("Top 10 new SUVs under $40,000", "New SUVs under $40,000",
            "The new SUVs that balance space, tech and price at or under $40k MSRP."),
        "used-suvs-under-30000": ("Top 10 used SUVs under $30,000", "Used SUVs under $30,000",
            "Room for passengers and cargo without a new-car price: the used SUVs that give the most for $30k."),
        "new-sedans-under-30000": ("Top 10 new sedans under $30,000", "New sedans under $30,000",
            "Comfortable, efficient and affordable: the new sedans worth shortlisting for under $30k."),
        "new-trucks-under-50000": ("Top 10 new pickup trucks under $50,000", "New pickup trucks under $50,000",
            "Pickups that tow, haul and hold their value, for under $50k new."),
        "electric-cars-under-50000": ("Top 10 electric cars under $50,000", "Electric cars under $50,000",
            "New EVs with real-world range and fast charging for under $50k."),
        "hybrids-under-35000": ("Top 10 new hybrids under $35,000", "New hybrids under $35,000",
            "High-MPG hybrids that cut fuel bills, for under $35k new."),
        "3-row-suvs-under-50000": ("Top 10 3-row family SUVs under $50,000", "3-row family SUVs under $50,000",
            "Seven seats or more for growing families, new and under $50k."),
        "first-cars-under-20000": ("Top 10 used first cars under $20,000", "Used first cars under $20,000",
            "Safe, reliable and cheap to insure: used cars for new drivers under $20k."),
        "sports-cars-under-50000": ("Top 10 sports cars under $50,000", "Sports cars under $50,000",
            "Coupes and convertibles that are fun to drive, new or nearly new, for under $50k."),
        "luxury-suvs-under-70000": ("Top 10 new luxury SUVs under $70,000", "New luxury SUVs under $70,000",
            "Premium cabins and badges, new and under $70k."),
    },
    "pt-BR": {
        "new-suvs-under-40000": ("Top 10 SUVs novos até US$ 40.000", "SUVs novos até US$ 40.000",
            "Os SUVs novos que equilibram espaço, tecnologia e preço por até US$ 40 mil."),
        "used-suvs-under-30000": ("Top 10 SUVs usados até US$ 30.000", "SUVs usados até US$ 30.000",
            "Espaço para passageiros e bagagem sem preço de carro novo: "
            "os SUVs usados que mais entregam por US$ 30 mil."),
        "new-sedans-under-30000": ("Top 10 sedãs novos até US$ 30.000", "Sedãs novos até US$ 30.000",
            "Confortáveis, econômicos e acessíveis: os sedãs novos que valem a pena por até US$ 30 mil."),
        "new-trucks-under-50000": ("Top 10 picapes novas até US$ 50.000", "Picapes novas até US$ 50.000",
            "Picapes que rebocam, carregam e mantêm o valor, por até US$ 50 mil novas."),
        "electric-cars-under-50000": ("Top 10 carros elétricos até US$ 50.000", "Carros elétricos até US$ 50.000",
            "Elétricos novos com autonomia real e recarga rápida por até US$ 50 mil."),
        "hybrids-under-35000": ("Top 10 híbridos novos até US$ 35.000", "Híbridos novos até US$ 35.000",
            "Híbridos econômicos que reduzem o gasto com combustível, por até US$ 35 mil novos."),
        "3-row-suvs-under-50000": ("Top 10 SUVs familiares de 3 fileiras até US$ 50.000",
            "SUVs de 3 fileiras até US$ 50.000",
            "Sete lugares ou mais para famílias em crescimento, novos e por até US$ 50 mil."),
        "first-cars-under-20000": ("Top 10 primeiros carros usados até US$ 20.000",
            "Primeiro carro usado até US$ 20.000",
            "Seguros, confiáveis e baratos de segurar: carros usados para novos motoristas por até US$ 20 mil."),
        "sports-cars-under-50000": ("Top 10 esportivos até US$ 50.000", "Esportivos até US$ 50.000",
            "Cupês e conversíveis divertidos de dirigir, novos ou seminovos, por até US$ 50 mil."),
        "luxury-suvs-under-70000": ("Top 10 SUVs de luxo novos até US$ 70.000", "SUVs de luxo novos até US$ 70.000",
            "Cabines e marcas premium, novos e por até US$ 70 mil."),
    },
    "es": {
        "new-suvs-under-40000": ("Top 10 SUVs nuevas por menos de US$40,000", "SUVs nuevas por menos de US$40,000",
            "Las SUVs nuevas que equilibran espacio, tecnología y precio por US$40 mil o menos."),
        "used-suvs-under-30000": ("Top 10 SUVs usadas por menos de US$30,000", "SUVs usadas por menos de US$30,000",
            "Espacio para pasajeros y equipaje sin precio de auto nuevo: "
            "las SUVs usadas que más ofrecen por US$30 mil."),
        "new-sedans-under-30000": ("Top 10 sedanes nuevos por menos de US$30,000",
            "Sedanes nuevos por menos de US$30,000",
            "Cómodos, eficientes y accesibles: los sedanes nuevos que vale la pena considerar por menos de US$30 mil."),
        "new-trucks-under-50000": ("Top 10 pickups nuevas por menos de US$50,000",
            "Pickups nuevas por menos de US$50,000",
            "Pickups que remolcan, cargan y conservan su valor, nuevas por menos de US$50 mil."),
        "electric-cars-under-50000": ("Top 10 autos eléctricos por menos de US$50,000",
            "Autos eléctricos por menos de US$50,000",
            "Eléctricos nuevos con autonomía real y carga rápida por menos de US$50 mil."),
        "hybrids-under-35000": ("Top 10 híbridos nuevos por menos de US$35,000",
            "Híbridos nuevos por menos de US$35,000",
            "Híbridos de alto rendimiento que reducen el gasto en gasolina, nuevos por menos de US$35 mil."),
        "3-row-suvs-under-50000": ("Top 10 SUVs familiares de 3 filas por menos de US$50,000",
            "SUVs de 3 filas por menos de US$50,000",
            "Siete asientos o más para familias que crecen, nuevas y por menos de US$50 mil."),
        "first-cars-under-20000": ("Top 10 primeros autos usados por menos de US$20,000",
            "Primer auto usado por menos de US$20,000",
            "Seguros, confiables y baratos de asegurar: autos usados para conductores nuevos por menos de US$20 mil."),
        "sports-cars-under-50000": ("Top 10 deportivos por menos de US$50,000", "Deportivos por menos de US$50,000",
            "Coupés y convertibles divertidos de manejar, nuevos o seminuevos, por menos de US$50 mil."),
        "luxury-suvs-under-70000": ("Top 10 SUVs de lujo nuevas por menos de US$70,000",
            "SUVs de lujo nuevas por menos de US$70,000",
            "Interiores y marcas premium, nuevas y por menos de US$70 mil."),
    },
    "ja": {
        "new-suvs-under-40000": ("4万ドル以下の新車SUV トップ10", "4万ドル以下の新車SUV",
            "広さ、装備、価格のバランスがとれた4万ドル以下の新車SUV。"),
        "used-suvs-under-30000": ("3万ドル以下の中古SUV トップ10", "3万ドル以下の中古SUV",
            "新車価格を払わずに人も荷物もたっぷり。3万ドルで最も満足できる中古SUV。"),
        "new-sedans-under-30000": ("3万ドル以下の新車セダン トップ10", "3万ドル以下の新車セダン",
            "快適で燃費がよく手頃。3万ドル以下で候補に入れたい新車セダン。"),
        "new-trucks-under-50000": ("5万ドル以下の新車ピックアップ トップ10", "5万ドル以下の新車ピックアップ",
            "牽引も積載もこなし、価値が落ちにくい5万ドル以下の新車ピックアップ。"),
        "electric-cars-under-50000": ("5万ドル以下の電気自動車 トップ10", "5万ドル以下の電気自動車",
            "実用的な航続距離と急速充電を備えた5万ドル以下の新車EV。"),
        "hybrids-under-35000": ("3万5千ドル以下の新車ハイブリッド トップ10", "3万5千ドル以下の新車ハイブリッド",
            "燃料代を抑える高燃費ハイブリッド。新車で3万5千ドル以下。"),
        "3-row-suvs-under-50000": ("5万ドル以下の3列シートSUV トップ10", "5万ドル以下の3列シートSUV",
            "家族が増えても安心の7人乗り以上。新車で5万ドル以下。"),
        "first-cars-under-20000": ("2万ドル以下の初めての中古車 トップ10", "2万ドル以下の初めての中古車",
            "安全で信頼性が高く保険料も安い、初心者ドライバー向けの2万ドル以下の中古車。"),
        "sports-cars-under-50000": ("5万ドル以下のスポーツカー トップ10", "5万ドル以下のスポーツカー",
            "運転が楽しいクーペとオープンカー。新車または高年式で5万ドル以下。"),
        "luxury-suvs-under-70000": ("7万ドル以下の新車高級SUV トップ10", "7万ドル以下の新車高級SUV",
            "上質な室内とブランド力。新車で7万ドル以下。"),
    },
}  # fmt: skip


async def search(client: httpx.AsyncClient, p: Preferences) -> list[CarResult]:
    """The /api/recommend pipeline without streaming, caching or rate limiting, sized for a top 10.
    Only priced, within-budget cars: a list titled "under $X" can't include cars the app flags as over budget,
    and data-only fallbacks (no price) don't belong in a ranking."""
    cands, _ = build_candidates(catalog.vehicles, p, catalog.fuels_by_model)
    used: set[tuple[str, str]] = set()
    results: list[CarResult] = []
    pool = cands
    for _ in range(3):  # more rounds over models not tried yet while the budget cut leaves fewer than 10
        batches = llm.split_batches(pool, k=4)
        picks_per_batch = await asyncio.gather(
            *(llm.rank_with_llm(client, p, b, hide_budget=True) for b in batches), return_exceptions=True
        )
        for batch, picks in zip(batches, picks_per_batch, strict=True):
            if isinstance(picks, BaseException):
                raise RuntimeError(f"OpenAI call failed, not publishing a degraded page: {picks!r}")
            kept = llm.validate_batch(p, batch, picks, used, keep=llm.BATCH_PICKS)
            results += [r for r in kept if not r.over_budget and r.price_min is not None]
        pool = [c for c in cands if (c.make, c.model) not in used]
        if len(results) >= RANK_SIZE or not pool:
            break
    return llm.finalize(results, RANK_SIZE)


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
    others = "".join(f'<a href="/best/{s}">{escape(t)}</a>' for s, (t, _, _) in TEXT["en"].items() if s != slug)
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
        for i, (s, (t, _, intro)) in enumerate(TEXT["en"].items())
    )
    body = f"""<main><h1>Top 10 car rankings</h1><p class="lede">Ranked shortlists for common budgets and needs, \
built from EPA vehicle data and AI price estimates.</p><ol class="cars">{links}</ol></main>"""
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "CarMatch car buying guides"}
    return page("Top 10 car rankings", "Top 10 car shortlists for common budgets and needs.", "/best", body, ld)


def sitemap() -> str:
    today = date.today().isoformat()
    urls = ["/", "/best", *(f"/best/{s}" for s, _ in GUIDES)]
    rows = "".join(f"<url><loc>{SITE}{u}</loc><lastmod>{today}</lastmod></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{rows}</urlset>\n'


async def main(langs: list[str], photos_only: bool = False) -> None:
    """photos_only: keep each saved list's cars (no OpenAI) and only look their photos up again."""
    saved: dict[str, dict[str, list[CarResult]]] = {}
    updated = {lang: date.today().isoformat() for lang in langs}
    if photos_only:
        for lang in langs:
            with open(os.path.join(OUT, f"rankings.{lang}.json")) as f:
                data = json.load(f)
            updated[lang] = data["updated"]  # the rankings themselves didn't change
            saved[lang] = {lst["slug"]: [CarResult.model_validate(c) for c in lst["cars"]] for lst in data["lists"]}
    else:
        await load_catalog()
    # Everything is built in memory and written only once every list succeeded, so a failed OpenAI call
    # can't leave frontend/public half old, half new.
    pages: dict[str, str] = {}
    files: dict[str, list[dict[str, object]]] = {}
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        for lang in langs:
            lists = files[lang] = []
            for slug, raw in GUIDES:
                title, short, intro = TEXT[lang][slug]
                p = Preferences.model_validate({**raw, "language": lang})
                cars = saved[lang][slug] if photos_only else await search(client, p)
                imgs = await asyncio.gather(*(find_image(client, c.year, c.make, c.model) for c in cars))
                if None in imgs:  # Commons lookups fail transiently under load; one retry
                    await asyncio.sleep(2)
                    imgs = [
                        i or await find_image(client, c.year, c.make, c.model) for c, i in zip(cars, imgs, strict=True)
                    ]
                if photos_only:  # a lookup that still failed keeps the photo the car already had
                    imgs = [i or c.image for c, i in zip(cars, imgs, strict=True)]
                if lang == "en":  # the SEO pages are English only
                    pages[f"{slug}.html"] = guide_page(slug, title, intro, p, cars, list(imgs))
                # The app's Rankings page reads the same lists, photos included so cards don't look them up.
                cars = [c.model_copy(update={"image": img}) for c, img in zip(cars, imgs, strict=True)]
                lists.append(
                    {
                        "slug": slug,
                        "title": title,
                        "short": short,
                        "intro": intro,
                        "prefs": p.model_dump(exclude={"language"}),
                        "cars": [c.model_dump() for c in cars],
                    }
                )
                print(f"{lang} {slug}: {len(cars)} cars, {sum(i is not None for i in imgs)} photos")
    if pages:
        pages["index.html"] = index_page()
        best = os.path.join(OUT, "best")
        os.makedirs(best, exist_ok=True)
        for old in os.listdir(best):  # categories change; don't leave orphaned pages behind
            os.remove(os.path.join(best, old))
        for name, html in pages.items():
            with open(os.path.join(best, name), "w") as f:
                f.write(html)
        with open(os.path.join(OUT, "sitemap.xml"), "w") as f:
            f.write(sitemap())
    for lang, lists in files.items():
        with open(os.path.join(OUT, f"rankings.{lang}.json"), "w") as f:
            json.dump({"updated": updated[lang], "lists": lists}, f, separators=(",", ":"), ensure_ascii=False)


if __name__ == "__main__":
    asyncio.run(main([a for a in sys.argv[1:] if a in TEXT] or list(TEXT), photos_only="--photos" in sys.argv))
