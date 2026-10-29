// Mirrors backend/app/models.py. Keep the two in sync.

export const BODY_TYPES = ["SUV", "Compact", "Sedan", "Hatchback", "Truck", "Coupe", "Convertible", "Minivan", "Wagon"] as const
export const FUEL_TYPES = ["Gas", "Hybrid", "Plug-in Hybrid", "Electric", "Diesel"] as const
export const PRIORITIES = [
  "commuting",
  "family",
  "performance",
  "fuel_economy",
  "reliability",
  "towing",
  "off_road",
  "luxury",
] as const
export const DRIVETRAINS = ["AWD", "FWD", "RWD", "4WD"] as const

export type BodyType = (typeof BODY_TYPES)[number]
export type FuelType = (typeof FUEL_TYPES)[number]
export type Priority = (typeof PRIORITIES)[number]
export type Condition = "new" | "used" | "either"
export type Transmission = "auto" | "manual" | "any"
export type Drivetrain = (typeof DRIVETRAINS)[number] | "any"

export const MIN_YEAR = 1990
export const MAX_YEAR = new Date().getFullYear() + 1

export interface Preferences {
  brands: string[] // empty = no preference
  year_min: number
  year_max: number
  condition: Condition
  body_types: BodyType[] // empty = any
  budget: number
  fuel_types: FuelType[] // empty = any
  priorities: Priority[]
  transmission: Transmission
  drivetrain: Drivetrain
  min_seats: number
}

export interface CarImage {
  url: string
  page_url: string
  author: string
  license: string
  license_url: string | null
}

export interface CarResult {
  car_key: string
  rank: number
  match_score: number
  year: number
  make: string
  model: string
  body_type: BodyType
  fuel_type: FuelType
  mpg: number | null
  mpge: number | null
  drivetrain: string
  transmission: string
  seats: number
  price_min: number | null
  price_max: number | null
  over_budget: boolean
  bullets: string[]
  image: CarImage | null
}

export interface RecommendResponse {
  results: CarResult[]
  relaxed: string[]
  notice: string | null
  cached: boolean
}

export type RecommendEvent =
  | { type: "meta"; relaxed: string[]; cached: boolean }
  | { type: "cars"; cars: CarResult[] }
  | ({ type: "done" } & RecommendResponse)
