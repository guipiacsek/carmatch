import { money, t } from "@/i18n"

import type { CarResult } from "./types"

export const carName = (car: Pick<CarResult, "year" | "make" | "model">) => `${car.year} ${car.make} ${car.model}`

export function efficiency(car: CarResult): string {
  if (car.fuel_type === "Electric") return car.mpge ? `${car.mpge} MPGe` : "n/a"
  if (car.fuel_type === "Plug-in Hybrid" && car.mpge) return `${car.mpg ?? "?"} MPG · ${car.mpge} MPGe`
  return car.mpg ? `${car.mpg} MPG` : "n/a"
}

/** The AI price range in the current UI currency. */
export function priceRange(car: CarResult): string {
  return car.price_min != null && car.price_max != null
    ? `${money(car.price_min)} – ${money(car.price_max)}`
    : t("price.none")
}
