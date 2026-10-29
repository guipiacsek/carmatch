from collections import Counter

from app.candidates import MAX_CANDIDATES, build_candidates, matches
from app.models import MAX_YEAR
from app.vehicles import Catalog, classify_body, classify_drive, classify_fuel

from .conftest import fleet, prefs, veh


def fuels(vs):  # type: ignore[no-untyped-def]
    out: dict[tuple[str, str], set[str]] = {}
    for v in vs:
        out.setdefault((v.make, v.base_model), set()).add(v.fuel)
    return out


def test_hard_filters() -> None:
    rav = veh(1, 2020, "Toyota", "RAV4", drive=("AWD",))
    assert matches(rav, prefs())
    assert not matches(rav, prefs(year_min=2021))
    assert not matches(rav, prefs(brands=["Honda"]))
    assert matches(rav, prefs(brands=["toyota"]))  # case-insensitive
    assert not matches(rav, prefs(body_types=["Sedan"]))
    assert not matches(rav, prefs(fuel_types=["Electric"]))
    assert not matches(rav, prefs(drivetrain="FWD"))
    assert not matches(rav, prefs(transmission="manual"))
    assert matches(rav, prefs(min_seats=7))  # small SUVs can seat 7
    assert not matches(rav, prefs(min_seats=8))
    assert not matches(veh(2, 2020, "Mazda", "MX-5", vclass="Two Seaters"), prefs(min_seats=4))


def test_new_condition_limits_to_recent_model_years() -> None:
    assert not matches(veh(1, MAX_YEAR - 3, "Toyota", "RAV4"), prefs(condition="new", year_max=MAX_YEAR))
    assert matches(veh(1, MAX_YEAR - 1, "Toyota", "RAV4"), prefs(condition="new", year_max=MAX_YEAR))


def test_classification() -> None:
    assert classify_fuel("EV", "Electricity") == "Electric"
    assert classify_fuel("", "Diesel") == "Diesel"
    assert classify_fuel("FFV", "Gasoline or E85") == "Gas"
    assert classify_fuel("FCV", "Hydrogen") is None
    assert classify_drive("4-Wheel or All-Wheel Drive", "") == {"AWD", "4WD"}
    assert classify_body("Compact Cars", "Civic", four_door=True) == {"Sedan", "Compact"}
    assert classify_body("Large Cars", "Civic 5Dr", hatch=True) == {"Hatchback"}
    assert classify_body("Minicompact Cars", "BRZ", two_door=True) == {"Coupe", "Compact"}
    assert classify_body("Compact Cars", "M440i Gran Coupe", four_door=True) == {"Sedan", "Compact"}
    assert classify_body("Subcompact Cars", "430i Convertible", two_door=True) == {"Convertible", "Compact"}
    assert classify_body("Midsize Cars", "Golf SportWagen") == {"Wagon"}  # no volume data: name hints
    assert classify_body("Two Seaters", "MX-5 Miata Roadster") == {"Convertible"}
    assert classify_body("Vans, Cargo Type", "Transit") == frozenset()


def test_candidates_are_grouped_diverse_and_capped() -> None:
    vs = fleet()
    cands, relaxed = build_candidates(vs, prefs(body_types=["SUV"]), fuels(vs))
    assert relaxed == []
    assert len(cands) <= MAX_CANDIDATES
    assert len({c.key for c in cands}) == len(cands)
    assert Counter((c.make, c.model) for c in cands).most_common(1)[0][1] <= 2  # <=2 model years per model
    assert {c.id for c in cands} == {f"c{i + 1}" for i in range(len(cands))}
    assert all("SUV" in c.body_types for c in cands)


def test_cap_round_robins_across_makes() -> None:
    vs = [veh(i, 2020, f"Make{i % 8}", f"Model{i}") for i in range(200)]
    cands, _ = build_candidates(vs, prefs(), fuels(vs))
    assert len(cands) == MAX_CANDIDATES
    assert set(Counter(c.make for c in cands).values()) == {5}


def test_relaxes_brand_then_drivetrain_then_years() -> None:
    vs = fleet()
    # Only Tesla Model Y matches brand; relaxing brand gives plenty of AWD SUVs.
    _, relaxed = build_candidates(vs, prefs(brands=["Tesla"], drivetrain="AWD", body_types=["SUV"]), fuels(vs))
    assert relaxed == ["brand"]

    # Brand + RWD SUVs don't exist: relax brand, then drivetrain.
    _, relaxed = build_candidates(vs, prefs(brands=["Tesla"], drivetrain="RWD", body_types=["SUV"]), fuels(vs))
    assert relaxed == ["brand", "drivetrain"]

    # Years outside the data: all three, in order.
    cands, relaxed = build_candidates(
        vs, prefs(brands=["Tesla"], drivetrain="RWD", body_types=["SUV"], year_min=1995, year_max=2000), fuels(vs)
    )
    assert relaxed == ["brand", "drivetrain", "year range"]
    assert len(cands) >= 7


def test_relaxation_skips_unset_constraints_and_keeps_hard_ones() -> None:
    vs = fleet()
    cands, relaxed = build_candidates(vs, prefs(body_types=["Truck"]), fuels(vs))
    assert relaxed == ["year range"]  # no brand/drivetrain set, so only years can be relaxed
    assert [c.model for c in cands] == ["F150 Pickup"]  # body type is never relaxed


def test_used_skips_newest_year_and_spreads_two_years() -> None:
    vs = fleet()
    used, _ = build_candidates(vs, prefs(body_types=["SUV"], condition="used"), fuels(vs))
    rav = sorted(c.year for c in used if c.model == "RAV4")
    assert len(rav) == 2 and 2024 not in rav  # 2015-2024 offered; newest skipped
    new, _ = build_candidates(vs, prefs(body_types=["SUV"], condition="either"), fuels(vs))
    assert max(c.year for c in new if c.model == "RAV4") == 2024


def test_catalog_keeps_only_offered_brands() -> None:
    c = Catalog()
    c.load([*fleet(), veh(999, 2020, "Yugo", "GV")])
    assert "Yugo" not in c.makes and all(v.make != "Yugo" for v in c.vehicles)
    assert "Toyota" in c.makes
