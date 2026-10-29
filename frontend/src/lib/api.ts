import { getSupabase } from "./supabase"
import type { CarDetails, CarImage, CarResult, Preferences, RecommendEvent, RecommendResponse } from "./types"

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "")

export class ApiError extends Error {
  status: number
  retryAfter: number | null

  constructor(message: string, status: number, retryAfter: number | null = null) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, init)
  } catch {
    throw new ApiError("Can't reach the CarMatch server. Check your connection and try again.", 0)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === "string" ? body.detail : "Something went wrong. Please try again."
    const retry = Number(res.headers.get("Retry-After"))
    throw new ApiError(detail, res.status, Number.isFinite(retry) && retry > 0 ? retry : null)
  }
  return res
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>
}

// Same order the backend uses for the final list: within budget first, then best match.
export function sortCars(cars: CarResult[]): CarResult[] {
  return [...cars].sort((a, b) => Number(a.over_budget) - Number(b.over_budget) || b.match_score - a.match_score)
}

export async function getMakes(): Promise<string[]> {
  return (await request<{ makes: string[] }>("/api/makes")).makes
}

// The backend streams one NDJSON line per event: meta, a "cars" line per finished GPT batch, then "done".
export async function recommend(
  prefs: Preferences,
  onCars: (cars: CarResult[]) => void,
  signal?: AbortSignal,
): Promise<RecommendResponse> {
  const token = (await (await getSupabase())?.auth.getSession())?.data.session?.access_token
  const res = await send("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(prefs),
    signal,
  })
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  let shown: CarResult[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let nl: number
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      const event = JSON.parse(line) as RecommendEvent
      if (event.type === "cars") {
        shown = sortCars([...shown, ...event.cars])
        onCars(shown)
      } else if (event.type === "done") {
        const { type: _type, ...data } = event
        return data
      }
    }
  }
  throw new ApiError("The connection dropped before all results arrived. Please try again.", 0)
}

// Render's free tier sleeps when idle: wake it on page load so it's up by the time the wizard is done.
export function warmUp(): void {
  fetch(`${API_URL}/health`).catch(() => {})
}

const images = new Map<string, Promise<CarImage | null>>()

// Photos load per card after results show, so they never delay the ranking.
export function getImage(car: Pick<CarResult, "year" | "make" | "model">): Promise<CarImage | null> {
  const qs = new URLSearchParams({ year: String(car.year), make: car.make, model: car.model }).toString()
  let p = images.get(qs)
  if (!p) {
    p = request<CarImage | null>(`/api/image?${qs}`).catch(() => null)
    images.set(qs, p)
  }
  return p
}

export function getSharedResults(shareId: string): Promise<RecommendResponse> {
  return request<RecommendResponse>(`/api/results/${encodeURIComponent(shareId)}`)
}

const details = new Map<string, Promise<CarDetails>>()

// Second GPT call when a card is opened; the backend caches it, and so do we for the session.
export function getCarDetails(car: Pick<CarResult, "year" | "make" | "model" | "fuel_type">): Promise<CarDetails> {
  const body = JSON.stringify({ year: car.year, make: car.make, model: car.model, fuel_type: car.fuel_type })
  let p = details.get(body)
  if (!p) {
    p = request<CarDetails>("/api/car-details", { method: "POST", headers: { "Content-Type": "application/json" }, body })
    p.catch(() => details.delete(body)) // let a failed load be retried
    details.set(body, p)
  }
  return p
}
