import { KEYS, load, save } from "./storage"
import { BODY_TYPES, DRIVETRAINS, FUEL_TYPES, MAX_YEAR, PRIORITIES, type Condition, type Preferences } from "./types"

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

const ALLOWED: Partial<Record<keyof Preferences, readonly unknown[]>> = {
  condition: ["new", "used", "either"],
  transmission: ["auto", "manual", "any"],
  drivetrain: [...DRIVETRAINS, "any"],
  body_types: BODY_TYPES,
  fuel_types: FUEL_TYPES,
  priorities: PRIORITIES,
}

// Same shape as the default (and an allowed value where the set is fixed), so the wizard and results can't crash.
function validField(key: keyof Preferences, v: unknown): boolean {
  const d = DEFAULT_PREFS[key]
  const ok = (x: unknown) => ALLOWED[key]?.includes(x) ?? true
  if (Array.isArray(d)) return Array.isArray(v) && v.every((x) => typeof x === "string" && ok(x))
  if (typeof d === "number") return Number.isFinite(v)
  return typeof v === typeof d && ok(v)
}

/** Ranking and guide pages link to /results?p=<preferences JSON>; adopt those answers as the current search.
 *  The link is untrusted input: fields of the wrong shape fall back to defaults, and the backend validates ranges. */
export function takePresetFromUrl(): void {
  const raw = new URLSearchParams(window.location.search).get("p")
  if (!raw) return
  try {
    const p = JSON.parse(raw) as Record<string, unknown>
    const picked = Object.fromEntries(
      Object.entries(p).filter(([k, v]) => k in DEFAULT_PREFS && validField(k as keyof Preferences, v)),
    )
    savePrefs({ ...DEFAULT_PREFS, ...picked } as Preferences)
  } catch {
    /* malformed link: fall through to the saved search or the wizard */
  }
  window.history.replaceState(null, "", window.location.pathname)
}

const PRIORITY_LABEL: Record<string, string> = {
  commuting: "Commuting", family: "Family", performance: "Performance", fuel_economy: "Fuel economy",
  reliability: "Reliability", towing: "Towing", off_road: "Off-road", luxury: "Luxury",
}

/** Short labels summarizing the answers, shown as chips above the results. */
export function prefChips(p: Preferences): string[] {
  return [
    { new: "New", used: "Used", either: "New or used" }[p.condition],
    p.body_types.length ? p.body_types.join(" · ") : "Any body",
    `≤ $${p.budget.toLocaleString("en-US")}`,
    `${p.year_min}–${p.year_max}`,
    ...(p.brands.length ? [p.brands.slice(0, 3).join(" · ") + (p.brands.length > 3 ? ` +${p.brands.length - 3}` : "")] : []),
    ...(p.fuel_types.length ? [p.fuel_types.join(" · ")] : []),
    ...(p.drivetrain !== "any" ? [p.drivetrain] : []),
    ...(p.transmission !== "any" ? [p.transmission === "auto" ? "Automatic" : "Manual"] : []),
    ...(p.min_seats > 2 ? [`${p.min_seats}+ seats`] : []),
    ...(p.priorities.length ? [p.priorities.map((x) => PRIORITY_LABEL[x]).join(" · ")] : []),
  ]
}
