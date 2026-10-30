import asyncio
from datetime import date

import httpx

from app import images

INFO = {
    "mime": "image/jpeg",
    "url": "https://upload/full.jpg",
    "thumburl": "https://upload/500px.jpg",
    "descriptionurl": "https://commons/File:x.jpg",
    "extmetadata": {"Artist": {"value": "<a>Jane</a>"}, "LicenseShortName": {"value": "CC BY-SA 4.0"}},
}


def lead(title: str, file: str, disambiguation: bool = False) -> dict[str, object]:
    page: dict[str, object] = {"title": title, "pageimage": file}
    if disambiguation:
        page["pageprops"] = {"disambiguation": ""}
    return page


def run(year: int, make: str, model: str, wiki_pages: list[list[dict[str, object]]]) -> images.CarImage | None:
    """wiki_pages: the pages returned by the title lookup, then by the search fallback."""
    answers = iter(wiki_pages)

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.host == "en.wikipedia.org":
            return httpx.Response(200, json={"query": {"pages": next(answers)}})
        return httpx.Response(200, json={"query": {"pages": [{"imageinfo": [INFO]}]}})

    async def go() -> images.CarImage | None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await images._wiki_lead(client, make, model, year)

    return asyncio.run(go())


def test_lead_photo_of_the_same_generation_is_used() -> None:
    img = run(2027, "Mitsubishi", "Outlander", [[lead("Mitsubishi Outlander", "2025_Mitsubishi_Outlander_PHEV.jpg")]])
    assert img and img.url == "https://upload/500px.jpg" and img.author == "Jane"


def test_old_cars_skip_a_newer_generation_photo() -> None:
    # the model year is the first year in the name; the later one is the photo's date
    assert run(2025, "Ram", "1500", [[lead("Ram 1500", "2017_Ram_1500_Crew_Cab,_09-02-2022.jpg")]]) is None
    assert run(2012, "Toyota", "Camry", [[lead("Toyota Camry", "2018_Toyota_Camry.jpg")]]) is None


def test_undated_lead_photo_is_never_trusted() -> None:
    # Wikipedia's "Alfa Romeo Giulia" is the 1962 car; its photo name has no year
    pages = [[lead("Alfa Romeo Giulia", "Alfa_Romeo_Giulia_Super_(cropped).jpg")]]
    assert run(date.today().year, "Alfa Romeo", "Giulia", pages) is None


def test_disambiguation_falls_back_to_search_and_checks_the_make() -> None:
    hit = [lead("Honda Civic", "2022_Honda_Civic.jpg")]
    assert run(2024, "Honda", "Civic", [[lead("Civic", "x.jpg", disambiguation=True)], hit]) is not None
    assert run(2024, "Honda", "Civic", [[], [lead("Civic Center", "2023_Civic.jpg")]]) is None  # wrong article


def test_bad_views_are_skipped_in_commons_search() -> None:
    assert images._BAD_VIEW.search("2020 Porsche Macan GTS grey rear")
    assert not images._BAD_VIEW.search("2020 Porsche Macan GTS grey front")
