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
Brand = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40, pattern=r"^[A-Za-z0-9 .&'\-]+$")
]


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brands: list[Brand] = Field(default_factory=list, max_length=25)  # empty = no preference
    year_min: int = Field(ge=MIN_YEAR, le=MAX_YEAR)
    year_max: int = Field(ge=MIN_YEAR, le=MAX_YEAR)
    condition: Condition
    body_types: list[BodyType] = Field(default_factory=list, max_length=9)  # empty = any
    budget: int = Field(ge=1_000, le=500_000)
    fuel_types: list[FuelType] = Field(default_factory=list, max_length=5)  # empty = any
    priorities: list[Priority] = Field(default_factory=list, max_length=8)
    transmission: Transmission = "any"
    drivetrain: Drivetrain | Literal["any"] = "any"
    min_seats: int = Field(default=2, ge=2, le=9)

    @field_validator("brands", "body_types", "fuel_types", "priorities")
    @classmethod
    def _dedupe_sort(cls, v: list[str]) -> list[str]:
        return sorted(set(v))

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
