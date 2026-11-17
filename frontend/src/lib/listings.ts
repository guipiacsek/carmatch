import { getLang } from "@/i18n"

import { MAX_YEAR, type CarResult } from "./types"

// Cars.com search slugs: lowercase, spaces/hyphens -> "_" (e.g. "Mercedes-Benz" -> "mercedes_benz").
const slug = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "")
const MAKE_SLUGS: Record<string, string> = { Mercedes: "mercedes_benz" } // we show the short name

// Outbound link per car; the one place to add an affiliate/partner ID later.
// Make + year are hard filters; the model goes in as a keyword because EPA model names ("F150 Pickup")
// don't always match Cars.com's model slugs.
export function listingsUrl(car: Pick<CarResult, "year" | "make" | "model">): string {
  const params = new URLSearchParams({
    stock_type: car.year >= MAX_YEAR - 1 ? "all" : "used",
    "makes[]": MAKE_SLUGS[car.make] ?? slug(car.make),
    year_min: String(car.year),
    year_max: String(car.year),
    keyword: car.model,
    maximum_distance: "all",
    zip: "",
  })
  return `https://www.cars.com/shopping/results/?${params}`
}

// Webmotors (Brazil) paths: /carros/estoque/<make>/<model>, lowercase with hyphens. EPA names carry the
// powertrain ("Escape Hybrid", "Bolt EV"), which Webmotors files under the base model, so it's dropped.
// shortcut: model slugs are guessed from EPA names (Webmotors blocks automated checks); a mismatch lands on
// an empty search. Add exceptions to WM_MODELS as they're found.
const wmSlug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
const WM_MAKES: Record<string, string> = { Mercedes: "mercedes-benz" }
const WM_MODELS: Record<string, string> = { F150: "f-150" }
const POWERTRAIN = / (Plug-in Hybrid|Hybrid|Electric|EV|Diesel)$/i

export function webmotorsUrl(car: Pick<CarResult, "make" | "model">): string {
  const model = car.model.replace(POWERTRAIN, "")
  return `https://www.webmotors.com.br/carros/estoque/${WM_MAKES[car.make] ?? wmSlug(car.make)}/${WM_MODELS[model] ?? wmSlug(model)}`
}

/** The listings site for the current language: Webmotors for Brazilian Portuguese, Cars.com otherwise. */
export function listingSite(car: Pick<CarResult, "year" | "make" | "model">) {
  return getLang() === "pt-BR"
    ? { name: "Webmotors", url: webmotorsUrl(car) }
    : { name: "Cars.com", url: listingsUrl(car) }
}
