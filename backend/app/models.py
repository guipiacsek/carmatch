"""API models. Mirrored by hand in frontend/src/lib/types.ts; keep them in sync."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

MIN_YEAR = 1990
MAX_YEAR = date.today().year + 1

BodyType = Literal["SUV", "Compact", "Sedan", "Hatchback", "Truck", "Coupe", "Convertible", "Minivan", "Wagon"]
FuelType = Literal["Gas", "Hybrid", "Plug-in Hybrid", "Electric", "Diesel"]
Priority = Literal["commuting", "family", "performance", "fuel_economy", "reliability", "towing", "off_road", "luxury"]
Condition = Literal["new", "used", "either"]
Transmission = Literal["auto", "manual", "any"]
Drivetrain = Literal["AWD", "FWD", "RWD", "4WD"]
Language = Literal["en", "pt-BR", "es", "ja"]  # the AI writes its text in this language
Seats = Annotated[int, Field(ge=2, le=9)]
# Shorter names shown everywhere instead of EPA's spelling; old names still arrive from cached lists and old links.
DISPLAY_NAMES = {"McLaren Automotive": "McLaren", "Mercedes-Benz": "Mercedes"}
Brand = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40, pattern=r"^[A-Za-z0-9 .&'\-]+$")
]


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brands: list[Brand] = Field(default_factory=list, max_length=50)  # empty = no preference; fits all 38 brands
    year_min: int = Field(ge=MIN_YEAR, le=MAX_YEAR)
    year_max: int = Field(ge=MIN_YEAR, le=MAX_YEAR)
    condition: Condition
    body_types: list[BodyType] = Field(default_factory=list, max_length=9)  # empty = any
    budget: int = Field(ge=1_000, le=500_000)
    fuel_types: list[FuelType] = Field(default_factory=list, max_length=5)  # empty = any
    priorities: list[Priority] = Field(default_factory=list, max_length=8)
    transmission: Transmission = "any"
    drivetrain: Drivetrain | Literal["any"] = "any"
    seats: list[Seats] = Field(default_factory=list, max_length=8)  # exact seat counts wanted; empty = any
    language: Language = "en"

    @field_validator("brands", "body_types", "fuel_types", "priorities", "seats")
    @classmethod
    def _dedupe_sort(cls, v: list[str]) -> list[str]:
        return sorted(set(v))

    @field_validator("brands")
    @classmethod
    def _rename(cls, v: list[str]) -> list[str]:
        return sorted({DISPLAY_NAMES.get(b, b) for b in v})

    def seats_ok(self, n: int) -> bool:
        return n in self.seats if self.seats else n >= 2

    @property
    def fewest_seats(self) -> int:
        """The smallest seat count asked for (2 = any), for prefilters that only know a class's upper bound."""
        return min(self.seats, default=2)

    @model_validator(mode="after")
    def _years_ordered(self) -> "Preferences":
        if self.year_min > self.year_max:
            raise ValueError("year_min must be <= year_max")
        return self


class CarImage(BaseModel):
    url: str
    page_url: str
    author: str
    license: str
    license_url: str | None = None


class CarResult(BaseModel):
    car_key: str
    rank: int
    match_score: int
    year: int
    make: str
    model: str
    body_type: BodyType
    fuel_type: FuelType
    mpg: int | None  # combined MPG (gas/hybrid/diesel/PHEV on gas)
    mpge: int | None  # combined MPGe (EV, PHEV on electricity)
    drivetrain: str
    transmission: str
    seats: int
    price_min: int | None  # AI estimate, USD
    price_max: int | None
    over_budget: bool
    bullets: list[str]
    image: CarImage | None = None  # filled by the frontend from /api/image (kept in saved favorites)


class RecommendResponse(BaseModel):
    results: list[CarResult]
    relaxed: list[str]  # soft constraints that were relaxed, in order
    notice: str | None = None
    cached: bool = False
    share_id: str | None = None  # opens these results at /r/<share_id> while they're cached (7 days)


# --- LLM structured output (schema sent to OpenAI) ---


class LLMPick(BaseModel):
    # Field order is generation order: facts (seats, price) come before the fit judgment.
    id: str
    seats: int = Field(ge=1, le=15)
    estimated_price_min: int = Field(ge=0)
    estimated_price_max: int = Field(ge=0)
    rank: int = Field(ge=1, le=10)  # the per-call schema narrows this to the picks requested
    match_score: int = Field(ge=0, le=100)
    bullets: list[str] = Field(min_length=3, max_length=3)


class LLMResponse(BaseModel):
    picks: list[LLMPick] = Field(min_length=1, max_length=10)


# --- Car details (second GPT call when a card is opened) ---


class CarDetailsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    year: int = Field(ge=MIN_YEAR, le=MAX_YEAR)
    make: Brand
    model: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60, pattern=r"^[A-Za-z0-9 .&'/+()\-]+$")
    ]
    fuel_type: FuelType
    language: Language = "en"


class Trim(BaseModel):
    name: str
    highlight: str  # what distinguishes it, e.g. "2.5L hybrid, AWD, heated seats"


class CarDetails(BaseModel):
    summary: str
    pros: list[str] = Field(min_length=3, max_length=4)
    cons: list[str] = Field(min_length=3, max_length=4)
    reliability: str
    trims: list[Trim] = Field(min_length=1, max_length=5)
    used_buying_tips: list[str] = Field(min_length=3, max_length=3)
    competitors: list[str] = Field(min_length=3, max_length=3)
    epa: dict[str, object] = Field(default_factory=dict)  # grounded facts we sent, echoed back for display
