"""Vehicle catalog: fueleconomy.gov dataset (grounding for all candidates) + NHTSA vPIC makes."""

import asyncio
import csv
import io
import logging
import os
import re
import time
import zipfile
from collections import Counter
from dataclasses import dataclass, replace

import httpx

from .config import USER_AGENT, settings
from .models import MIN_YEAR

log = logging.getLogger(__name__)

# The fueleconomy.gov web services' full dataset (same data as /ws/rest/vehicle/*), downloaded once instead of
# thousands of per-vehicle calls per request.
FE_DATASET_URL = "https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip"
VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/{}?format=json"


@dataclass(frozen=True, slots=True)
class Vehicle:
    id: int
    year: int
    make: str
    model: str  # full EPA model name, e.g. "RAV4 Hybrid AWD"
    base_model: str  # e.g. "RAV4"
    vclass: str
    body_types: frozenset[str]
    fuel: str  # one of models.FuelType
    drive: frozenset[str]  # subset of {AWD, FWD, RWD, 4WD}
    transmission: str  # "auto" | "manual"
    mpg: int | None
    mpge: int | None
    cylinders: int | None
    max_seats: int  # upper bound by class, used to prefilter min_seats


def classify_fuel(atv_type: str, fuel_type: str) -> str | None:
    if atv_type == "EV":
        return "Electric"
    if atv_type == "Plug-in Hybrid":
        return "Plug-in Hybrid"
    if atv_type == "Hybrid":
        return "Hybrid"
    if atv_type == "Diesel" or "Diesel" in fuel_type:
        return "Diesel"
    if atv_type in ("FCV", "eFCV", "CNG") or fuel_type in ("Hydrogen", "CNG"):
        return None  # not offered in the wizard
    return "Gas"  # includes FFV and bi-fuel vehicles, which run on gasoline


def classify_drive(drive: str, vclass: str) -> frozenset[str]:
    d = drive.lower()
    if "4-wheel or all-wheel" in d:
        return frozenset({"AWD", "4WD"})
    if "all-wheel" in d:
        return frozenset({"AWD"})
    if "4-wheel" in d:
        return frozenset({"4WD"})
    if "front" in d:
        return frozenset({"FWD"})
    if "rear" in d:
        return frozenset({"RWD"})
    if "2-wheel" in d:
        return frozenset({"RWD"})  # EPA "2-Wheel Drive" is used for older trucks/vans, which are RWD
    if "4wd" in vclass.lower():
        return frozenset({"4WD"})
    return frozenset()


_NAME_HINTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"convertible|cabrio|roadster|spyder|spider|volante", re.I), "Convertible"),
    (re.compile(r"coupe", re.I), "Coupe"),
    (re.compile(r"hatch|sportback|\b[35]-?door|\b[35]dr\b|liftback", re.I), "Hatchback"),
    (re.compile(r"wagon|allroad|sportwagen|avant|estate", re.I), "Wagon"),
]


def classify_body(
    vclass: str, model: str, two_door: bool = False, four_door: bool = False, hatch: bool = False
) -> frozenset[str]:
    """two_door/four_door/hatch come from EPA interior volumes (pv2/pv4/hpv); model-name hints fill gaps."""
    vc = vclass.lower()
    if "pickup" in vc:
        return frozenset({"Truck"})
    if "sport utility" in vc:
        return frozenset({"SUV"})
    if "minivan" in vc or "vans, passenger" in vc or vc == "vans passenger":
        return frozenset({"Minivan"})
    if "station wagon" in vc:
        return frozenset({"Wagon"})
    if "cars" not in vc and vc != "two seaters":
        return frozenset()  # cargo vans, special purpose vehicles

    hinted = {body for pattern, body in _NAME_HINTS if pattern.search(model)}
    if vc == "two seaters":
        return frozenset(hinted & {"Convertible"} or {"Coupe"})
    if two_door or four_door or hatch:  # measured body style beats names like "Gran Coupe" (a 4-door)
        bodies = hinted & {"Convertible", "Wagon"}
        if hatch:
            bodies.add("Hatchback")
        if two_door and "Convertible" not in bodies:
            bodies.add("Coupe")
        if four_door and "Wagon" not in bodies:
            bodies.add("Sedan")
    else:
        bodies = hinted or {"Sedan"}
    if vc in ("minicompact cars", "subcompact cars", "compact cars"):
        bodies.add("Compact")
    return frozenset(bodies)


def max_seats_for(vclass: str, bodies: frozenset[str]) -> int:
    vc = vclass.lower()
    if vc == "two seaters":
        return 2
    if "minivan" in vc or "vans" in vc:
        return 8
    if "standard sport utility" in vc or vc.startswith("sport utility vehicle"):
        return 8
    if "small sport utility" in vc:
        return 7
    if "standard pickup" in vc:
        return 6
    if "minicompact" in vc or "Convertible" in bodies or "Coupe" in bodies:
        return 4
    return 5


def _int(v: str) -> int | None:
    try:
        n = int(float(v))
    except ValueError:
        return None
    return n or None


def parse_rows(rows: "csv.DictReader[str]") -> list[Vehicle]:
    out: list[Vehicle] = []
    for r in rows:
        year = _int(r["year"])
        if year is None or year < MIN_YEAR:
            continue
        fuel = classify_fuel(r["atvType"], r["fuelType"])
        bodies = classify_body(
            r["VClass"], r["model"], bool(_int(r["pv2"])), bool(_int(r["pv4"])), bool(_int(r["hpv"]))
        )
        drive = classify_drive(r["drive"], r["VClass"])
        if fuel is None or not bodies or not drive:
            continue
        mpg, alt = _int(r["comb08"]), _int(r["combA08"])
        out.append(
            Vehicle(
                id=int(r["id"]),
                year=year,
                make=r["make"].strip(),
                model=r["model"].strip(),
                base_model=(r["baseModel"] or r["model"]).strip(),
                vclass=r["VClass"],
                body_types=bodies,
                fuel=fuel,
                drive=drive,
                transmission="manual" if r["trany"].startswith("Manual") else "auto",
                mpg=None if fuel == "Electric" else mpg,
                mpge=mpg if fuel == "Electric" else (alt if fuel == "Plug-in Hybrid" else None),
                cylinders=_int(r["cylinders"]),
                max_seats=max_seats_for(r["VClass"], bodies),
            )
        )
    return out


class Catalog:
    def __init__(self) -> None:
        self.vehicles: list[Vehicle] = []
        self.makes: list[str] = []
        self.fuels_by_model: dict[tuple[str, str], set[str]] = {}
        self._ready = asyncio.Event()

    def load(self, vehicles: list[Vehicle], vpic_makes: set[str] | None) -> None:
        # EPA spells some makes inconsistently ("Mini"/"MINI"); use the most common spelling.
        counts = Counter(v.make for v in vehicles)
        canonical = {m.lower(): m for m, _ in reversed(counts.most_common())}
        vehicles = [
            v if canonical[v.make.lower()] == v.make else replace(v, make=canonical[v.make.lower()]) for v in vehicles
        ]
        self.vehicles = vehicles
        counts = Counter(v.make for v in vehicles)
        # Brand list = vPIC car/MPV/truck makes with EPA data, plus established EPA makes vPIC lacks (e.g. Scion).
        self.makes = sorted(
            (m for m, n in counts.items() if vpic_makes is None or m.upper() in vpic_makes or n >= 40), key=str.lower
        )
        self.fuels_by_model = {}
        for v in vehicles:
            self.fuels_by_model.setdefault((v.make, v.base_model), set()).add(v.fuel)
        self._ready.set()

    async def ready(self) -> None:
        await asyncio.wait_for(self._ready.wait(), timeout=60)


catalog = Catalog()


async def _dataset_bytes(client: httpx.AsyncClient) -> bytes:
    path = os.path.join(settings.data_dir, "vehicles.csv.zip")
    # Baked into the Docker image at build time; refresh if older than 30 days.
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < 30 * 86400:
        with open(path, "rb") as f:
            return f.read()
    resp = await client.get(FE_DATASET_URL, timeout=60)
    resp.raise_for_status()
    os.makedirs(settings.data_dir, exist_ok=True)
    with open(path, "wb") as f:
        f.write(resp.content)
    return resp.content


async def _vpic_makes(client: httpx.AsyncClient) -> set[str] | None:
    try:
        results = await asyncio.gather(
            *(
                client.get(VPIC_URL.format(t), timeout=20)
                for t in ("car", "multipurpose passenger vehicle (mpv)", "truck")
            ),
        )
        return {m["MakeName"].strip().upper() for r in results for m in r.raise_for_status().json()["Results"]}
    except (httpx.HTTPError, KeyError, ValueError) as e:
        log.warning("vPIC makes unavailable, using EPA makes only: %s", e)
        return None


async def load_catalog() -> None:
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        data, vpic = await asyncio.gather(_dataset_bytes(client), _vpic_makes(client))
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        text = z.read("vehicles.csv").decode("utf-8", errors="replace")
    vehicles = await asyncio.to_thread(parse_rows, csv.DictReader(io.StringIO(text)))
    catalog.load(vehicles, vpic)
    log.info("catalog loaded: %d vehicles, %d makes", len(vehicles), len(catalog.makes))


if __name__ == "__main__":  # used by the Dockerfile to bake the dataset into the image
    asyncio.run(load_catalog())
