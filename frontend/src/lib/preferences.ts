import { money, t, type Key } from "@/i18n"

import { KEYS, load, save } from "./storage"
import {
  BODY_TYPES,
  DRIVETRAINS,
  FUEL_TYPES,
  LANGUAGES,
  MAX_YEAR,
  PRIORITIES,
  SEAT_COUNTS,
  type Condition,
  type Preferences,
} from "./types"

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
  seats: [],
  language: "en",
}

export function clampBudget(budget: number, condition: Condition): number {
  const { min, max } = BUDGET_RANGE[condition]
  return Math.min(max, Math.max(min, budget))
}

export const savePrefs = (p: Preferences) => save(KEYS.prefs, p)
export const hasSavedPrefs = () => load<Preferences | null>(KEYS.prefs, null) !== null

const ALLOWED: Partial<Record<keyof Preferences, readonly unknown[]>> = {
  condition: ["new", "used", "either"],
  transmission: ["auto", "manual", "any"],
  drivetrain: [...DRIVETRAINS, "any", "AWD/4WD"],
  body_types: BODY_TYPES,
  fuel_types: FUEL_TYPES,
  priorities: PRIORITIES,
  seats: SEAT_COUNTS,
  language: LANGUAGES,
}

// Same shape as the default (and an allowed value where the set is fixed), so the wizard and results can't crash.
function validField(key: keyof Preferences, v: unknown): boolean {
  const d = DEFAULT_PREFS[key]
  const ok = (x: unknown) => ALLOWED[key]?.includes(x) ?? true
  if (Array.isArray(d)) return Array.isArray(v) && v.every((x) => ok(x) && (key in ALLOWED || typeof x === "string"))
  if (typeof d === "number") return Number.isFinite(v)
  return typeof v === typeof d && ok(v)
}

/** Known fields of the right shape, on top of the defaults. Saved searches from older versions (e.g. the old
 *  `min_seats` field) would otherwise be sent as-is and rejected by the backend. */
function sanitize(p: unknown): Preferences {
  const picked = Object.entries(typeof p === "object" && p ? p : {}).filter(
    ([k, v]) => k in DEFAULT_PREFS && validField(k as keyof Preferences, v),
  )
  return { ...DEFAULT_PREFS, ...Object.fromEntries(picked) }
}

export const loadPrefs = (): Preferences => sanitize(load<unknown>(KEYS.prefs, {}))

/** Ranking and guide pages link to /results?p=<preferences JSON>; adopt those answers as the current search.
 *  The link is untrusted input: fields of the wrong shape fall back to defaults, and the backend validates ranges. */
export function takePresetFromUrl(): void {
  const raw = new URLSearchParams(window.location.search).get("p")
  if (!raw) return
  try {
    savePrefs(sanitize(JSON.parse(raw)))
  } catch {
    /* malformed link: fall through to the saved search or the wizard */
  }
  window.history.replaceState(null, "", window.location.pathname)
}

/** Short labels summarizing the answers, shown as chips above the results (in the current UI language). */
export function prefChips(p: Preferences): string[] {
  const v = (x: string) => t(`v.${x}` as Key)
  return [
    t({ new: "chip.new", used: "chip.used", either: "chip.both" }[p.condition] as Key),
    p.body_types.length ? p.body_types.map(v).join(" · ") : t("chip.anyBody"),
    t("chip.upTo", { amount: money(p.budget) }),
    `${p.year_min}–${p.year_max}`,
    ...(p.brands.length ? [p.brands.slice(0, 3).join(" · ") + (p.brands.length > 3 ? ` +${p.brands.length - 3}` : "")] : []),
    ...(p.fuel_types.length ? [p.fuel_types.map(v).join(" · ")] : []),
    ...(p.drivetrain !== "any" ? [p.drivetrain] : []),
    ...(p.transmission !== "any" ? [v(p.transmission === "auto" ? "Automatic" : "Manual")] : []),
    ...(p.seats.length ? [t("chip.seats", { list: p.seats.join(", ") })] : []),
    ...(p.priorities.length ? [p.priorities.map(v).join(" · ")] : []),
  ]
}
