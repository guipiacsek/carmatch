"""Candidate generation: hard-constraint filtering, grouping, diversity cap, and soft-constraint relaxation."""

import re
from collections.abc import Iterable
from dataclasses import dataclass, replace

from .models import MAX_YEAR, MIN_YEAR, Preferences
from .vehicles import Vehicle

MAX_CANDIDATES = 40
TARGET_RESULTS = 9  # 3 batches x 3 kept

LUXURY_MAKES = {
    "Acura",
    "Alfa Romeo",
    "Aston Martin",
    "Audi",
    "Bentley",
    "BMW",
    "Cadillac",
    "Genesis",
    "Infiniti",
    "Jaguar",
    "Land Rover",
    "Lexus",
    "Lincoln",
    "Lucid",
    "Maserati",
    "Mercedes-Benz",
    "Polestar",
    "Porsche",
    "Rivian",
    "Rolls-Royce",
    "Tesla",
    "Volvo",
}
EXOTIC_MAKES = {
    "Aston Martin",
    "Bentley",
    "Bugatti",
    "Ferrari",
    "Koenigsegg",
    "Lamborghini",
    "Lucid",
    "Maserati",
    "Maybach",
    "McLaren Automotive",
    "Pagani",
    "Rolls-Royce",
    "Spyker",
}
RELIABLE_MAKES = {"Toyota", "Lexus", "Honda", "Acura", "Mazda", "Subaru", "Kia", "Hyundai"}

BODY_DISPLAY_ORDER = ["Convertible", "Coupe", "Hatchback", "Wagon", "Minivan", "Truck", "SUV", "Sedan", "Compact"]
FUEL_SUFFIX = {"Hybrid": "Hybrid", "Plug-in Hybrid": "Plug-in Hybrid", "Electric": "Electric", "Diesel": "Diesel"}


@dataclass(frozen=True)
class Candidate:
    id: str  # short id sent to the LLM ("c1", "c2", ...)
    key: str  # stable car_key used for favorites
    year: int
    make: str
    model: str
    body_types: frozenset[str]
    body_type: str
    fuel: str
    drive: frozenset[str]
    transmissions: frozenset[str]
    mpg: int | None
    mpge: int | None
    max_seats: int
    vclass: str
    score: float


@dataclass(frozen=True)
class Relax:
    brand: bool = False
    drivetrain: bool = False
    years: bool = False


def year_bounds(p: Preferences, relax: Relax) -> tuple[int, int]:
    lo, hi = (MIN_YEAR, MAX_YEAR) if relax.years else (p.year_min, p.year_max)
    if p.condition == "new":
        lo = max(lo, MAX_YEAR - 2)  # next, current and leftover prior model year are sold new
    elif p.condition == "used":
        hi = min(hi, MAX_YEAR - 1)  # next model year cars aren't on the used market yet
    return lo, hi


NO_RELAX = Relax()


def matches(v: Vehicle, p: Preferences, relax: Relax = NO_RELAX) -> bool:
    lo, hi = year_bounds(p, relax)
    if not lo <= v.year <= hi:
        return False
    if p.brands and not relax.brand and v.make.lower() not in {b.lower() for b in p.brands}:
        return False
    if p.body_types and not v.body_types & set(p.body_types):
        return False
    if p.fuel_types and v.fuel not in p.fuel_types:
        return False
    if p.drivetrain != "any" and not relax.drivetrain and p.drivetrain not in v.drive:
        return False
    if p.transmission != "any" and v.transmission != p.transmission:
        return False
    return v.max_seats >= p.fewest_seats


def slug(*parts: object) -> str:
    return re.sub(r"[^a-z0-9]+", "-", " ".join(str(p) for p in parts).lower()).strip("-")


def heuristic(c: Candidate, p: Preferences) -> float:
    """Cheap relevance score used only to pick which ~40 candidates the LLM sees (and to order fallbacks)."""
    pr = set(p.priorities)
    eff = (c.mpge / 3 if c.mpge else c.mpg or 18) / 50
    s = (c.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR) * 0.5
    if "fuel_economy" in pr:
        s += eff * 2
    if "commuting" in pr:
        s += eff + 0.5 * bool(c.body_types & {"Compact", "Sedan", "Hatchback"})
    if "performance" in pr:
        s += bool(c.body_types & {"Coupe", "Convertible"}) + 0.5 * bool(c.drive & {"RWD", "AWD"})
    if "family" in pr:
        s += bool(c.body_types & {"Minivan", "SUV", "Wagon"}) + (c.max_seats >= 7)
    if "towing" in pr:
        s += 2 * ("Truck" in c.body_types) + ("Standard" in c.vclass) + 0.5 * ("4WD" in c.drive)
    if "off_road" in pr:
        s += bool(c.drive & {"4WD", "AWD"}) + bool(c.body_types & {"Truck", "SUV"})
    if "luxury" in pr:
        s += 2 * (c.make in LUXURY_MAKES)
    if "reliability" in pr:
        s += 1.5 * (c.make in RELIABLE_MAKES)
    if p.fewest_seats > 5:  # 3-row seating is mostly large SUVs and minivans; small SUVs rarely qualify
        s += 2 * (any(k in c.vclass for k in ("Standard Sport Utility", "Minivan", "Vans")))
    if p.budget < 100_000:
        s -= 3 * (c.make in EXOTIC_MAKES)
    return s


def group(
    vehicles: Iterable[Vehicle], p: Preferences, fuels_by_model: dict[tuple[str, str], set[str]]
) -> list[Candidate]:
    """One candidate per (year, make, base model, fuel); aggregates trims/drivetrains that passed the filters."""
    groups: dict[tuple[int, str, str, str], list[Vehicle]] = {}
    for v in vehicles:
        groups.setdefault((v.year, v.make, v.base_model, v.fuel), []).append(v)

    out = []
    for (year, make, base, fuel), vs in groups.items():
        model = base
        suffix = FUEL_SUFFIX.get(fuel)
        if suffix and len(fuels_by_model.get((make, base), ())) > 1 and suffix.split()[0].lower() not in base.lower():
            model = f"{base} {suffix}"
        bodies = frozenset().union(*(v.body_types for v in vs))
        wanted = bodies & set(p.body_types)
        body = next(b for b in BODY_DISPLAY_ORDER if b in (wanted or bodies))
        mpgs = [v.mpg for v in vs if v.mpg]
        mpges = [v.mpge for v in vs if v.mpge]
        c = Candidate(
            id="",
            key=slug(year, make, model),
            year=year,
            make=make,
            model=model,
            body_types=bodies,
            body_type=body,
            fuel=fuel,
            drive=frozenset().union(*(v.drive for v in vs)),
            transmissions=frozenset(v.transmission for v in vs),
            mpg=max(mpgs) if mpgs else None,
            mpge=max(mpges) if mpges else None,
            max_seats=max(v.max_seats for v in vs),
            vclass=vs[0].vclass,
            score=0.0,
        )
        out.append(replace(c, score=heuristic(c, p)))
    return out


def diversify(cands: list[Candidate], p: Preferences, limit: int = MAX_CANDIDATES) -> list[Candidate]:
    """Keep <=2 model years per model, then round-robin across makes.

    new: newest only. either: newest + middle. used: two years spread across the range, skipping the
    newest (a used current-year car prices like a new one), so the LLM can match a year to the budget.
    """
    by_model: dict[tuple[str, str, str], list[Candidate]] = {}
    for c in cands:
        by_model.setdefault((c.make, c.model, c.fuel), []).append(c)

    kept: list[Candidate] = []
    for versions in by_model.values():
        versions.sort(key=lambda c: c.year, reverse=True)
        if p.condition == "used" and len(versions) >= 3:
            kept += [versions[len(versions) // 3], versions[2 * len(versions) // 3]]
        else:
            kept.append(versions[0])
            if p.condition == "either" and len(versions) > 2:
                kept.append(versions[len(versions) // 2])

    by_make: dict[str, list[Candidate]] = {}
    for c in sorted(kept, key=lambda c: c.score, reverse=True):
        by_make.setdefault(c.make, []).append(c)

    picked: list[Candidate] = []
    queues = list(by_make.values())  # dict order = makes by their best candidate's score
    while queues and len(picked) < limit:
        for q in queues:
            if len(picked) < limit:
                picked.append(q.pop(0))
        queues = [q for q in queues if q]
    picked.sort(key=lambda c: c.score, reverse=True)
    return [replace(c, id=f"c{i + 1}") for i, c in enumerate(picked)]


def build_candidates(
    vehicles: list[Vehicle], p: Preferences, fuels_by_model: dict[tuple[str, str], set[str]]
) -> tuple[list[Candidate], list[str]]:
    """Returns (candidates, relaxed constraint names). Relaxes brand, then drivetrain, then year range."""
    steps = [
        ("brand", bool(p.brands), Relax(brand=True)),
        ("drivetrain", p.drivetrain != "any", Relax(brand=True, drivetrain=True)),
        (
            "year range",
            (p.year_min, p.year_max) != (MIN_YEAR, MAX_YEAR),
            Relax(brand=True, drivetrain=True, years=True),
        ),
    ]
    relax, relaxed = NO_RELAX, []
    cands = diversify(group((v for v in vehicles if matches(v, p, relax)), p, fuels_by_model), p)
    for name, applicable, next_relax in steps:
        if len(cands) >= TARGET_RESULTS:
            break
        relax = next_relax
        if applicable:
            relaxed.append(name)
            cands = diversify(group((v for v in vehicles if matches(v, p, relax)), p, fuels_by_model), p)
    return cands, relaxed
