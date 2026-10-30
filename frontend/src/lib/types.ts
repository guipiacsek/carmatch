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

export const LANGUAGES = ["en", "pt-BR", "es", "ja"] as const
export type Language = (typeof LANGUAGES)[number]
export const SEAT_COUNTS = [2, 3, 4, 5, 6, 7, 8] as const

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
  seats: number[] // exact seat counts wanted; empty = any
  language: Language // the AI writes its text in this language
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
  share_id: string | null // opens these results at /r/<share_id> for 4 days
}

/** public/rankings.{lang}.json, written by backend/app/seo.py */
export interface Ranking {
  slug: string
  title: string
  short: string // title without "Top 10", shown under the TOP 10 badge
  intro: string
  prefs: Preferences
  cars: CarResult[] // photos included
}

export interface RankingsData {
  updated: string // ISO date
  lists: Ranking[]
}

export type RecommendEvent =
  | { type: "meta"; relaxed: string[]; cached: boolean }
  | { type: "cars"; cars: CarResult[] }
  | ({ type: "done" } & RecommendResponse)

export interface CarDetails {
  summary: string
  pros: string[]
  cons: string[]
  reliability: string
  trims: { name: string; highlight: string }[]
  used_buying_tips: string[]
  competitors: string[]
  epa: {
    epa_class?: string
    mpg_combined?: string | null
    mpge_combined?: string | null
    drivetrains?: string[]
    transmissions?: string[]
    epa_model_variants?: string[]
  }
}
