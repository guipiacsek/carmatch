import { MAX_YEAR, type CarResult } from "./types"

// Cars.com search slugs: lowercase, spaces/hyphens -> "_" (e.g. "Mercedes-Benz" -> "mercedes_benz").
const slug = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "")

// Outbound link per car; the one place to add an affiliate/partner ID later.
// Make + year are hard filters; the model goes in as a keyword because EPA model names ("F150 Pickup")
// don't always match Cars.com's model slugs.
export function listingsUrl(car: Pick<CarResult, "year" | "make" | "model">): string {
  const params = new URLSearchParams({
    stock_type: car.year >= MAX_YEAR - 1 ? "all" : "used",
    "makes[]": slug(car.make),
    year_min: String(car.year),
    year_max: String(car.year),
    keyword: car.model,
    maximum_distance: "all",
    zip: "",
  })
  return `https://www.cars.com/shopping/results/?${params}`
}
