import type { CarResult } from "./types"

export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

export const carName = (car: Pick<CarResult, "year" | "make" | "model">) => `${car.year} ${car.make} ${car.model}`

export function efficiency(car: CarResult): string {
  if (car.fuel_type === "Electric") return car.mpge ? `${car.mpge} MPGe` : "n/a"
  if (car.fuel_type === "Plug-in Hybrid" && car.mpge) return `${car.mpg ?? "?"} MPG · ${car.mpge} MPGe`
  return car.mpg ? `${car.mpg} MPG` : "n/a"
}

export function priceRange(car: CarResult): string {
  return car.price_min != null && car.price_max != null
    ? `${usd.format(car.price_min)} – ${usd.format(car.price_max)}`
    : "No price estimate"
}
