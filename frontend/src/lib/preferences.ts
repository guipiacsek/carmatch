import { KEYS, load, save } from "./storage"
import { MAX_YEAR, type Condition, type Preferences } from "./types"

export const BUDGET_RANGE: Record<Condition, { min: number; max: number; step: number }> = {
  new: { min: 15_000, max: 150_000, step: 1_000 },
  used: { min: 3_000, max: 100_000, step: 500 },
  either: { min: 3_000, max: 150_000, step: 1_000 },
}

export const DEFAULT_PREFS: Preferences = {
  brands: [],
  year_min: MAX_YEAR - 8,
  year_max: MAX_YEAR,
  condition: "either",
  body_types: [],
  budget: 35_000,
  fuel_types: [],
  priorities: [],
  transmission: "any",
  drivetrain: "any",
  min_seats: 2,
}

export function clampBudget(budget: number, condition: Condition): number {
  const { min, max } = BUDGET_RANGE[condition]
  return Math.min(max, Math.max(min, budget))
}

export const loadPrefs = (): Preferences => ({ ...DEFAULT_PREFS, ...load<Partial<Preferences>>(KEYS.prefs, {}) })
export const savePrefs = (p: Preferences) => save(KEYS.prefs, p)
export const hasSavedPrefs = () => load<Preferences | null>(KEYS.prefs, null) !== null
