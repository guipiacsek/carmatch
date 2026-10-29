import os

# Settings are read at import time: force an offline, deterministic config before the app is imported.
os.environ.update(
    OPENAI_API_KEY="", SUPABASE_URL="", SUPABASE_SERVICE_ROLE_KEY="", RATE_LIMIT_PER_HOUR="3", TRUSTED_PROXY_HOPS="1"
)

from app.models import Preferences  # noqa: E402
from app.vehicles import Vehicle, classify_body, max_seats_for  # noqa: E402

SUV = "Small Sport Utility Vehicle 4WD"


def veh(
    i: int,
    year: int,
    make: str,
    model: str,
    vclass: str = SUV,
    fuel: str = "Gas",
    drive: tuple[str, ...] = ("AWD",),
    trans: str = "auto",
    mpg: int = 30,
) -> Vehicle:
    bodies = classify_body(vclass, model, model)
    return Vehicle(
        id=i,
        year=year,
        make=make,
        model=model,
        base_model=model,
        vclass=vclass,
        body_types=bodies,
        fuel=fuel,
        drive=frozenset(drive),
        transmission=trans,
        mpg=mpg,
        mpge=None,
        cylinders=4,
        max_seats=max_seats_for(vclass, bodies),
    )


def prefs(**kw: object) -> Preferences:
    base: dict[str, object] = {"year_min": 2015, "year_max": 2024, "condition": "used", "budget": 30000}
    return Preferences.model_validate({**base, **kw})


def fleet() -> list[Vehicle]:
    """10 SUV models across 5 makes, 2015-2024, plus a few sedans/trucks/EVs."""
    out, i = [], 0
    makes = {
        "Toyota": ["RAV4", "Highlander"],
        "Honda": ["CR-V", "Pilot"],
        "Ford": ["Escape", "Explorer"],
        "Subaru": ["Forester", "Outback SUV"],
        "Kia": ["Sportage", "Sorento"],
    }
    for make, models in makes.items():
        for model in models:
            for year in range(2015, 2025):
                i += 1
                out.append(veh(i, year, make, model, drive=("AWD",) if make == "Subaru" else ("FWD", "AWD")))
    out += [
        veh(900, 2022, "Toyota", "Camry", vclass="Midsize Cars", drive=("FWD",), mpg=32),
        veh(901, 2022, "Ford", "F150 Pickup", vclass="Standard Pickup Trucks 4WD", drive=("4WD",), mpg=20),
        veh(902, 2023, "Tesla", "Model Y", fuel="Electric", mpg=0),
        veh(903, 2020, "Mazda", "MX-5", vclass="Two Seaters", drive=("RWD",), trans="manual"),
    ]
    return out
