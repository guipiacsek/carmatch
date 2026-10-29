import { supabase } from "./supabase"
import type { CarImage, CarResult, Preferences, RecommendResponse } from "./types"

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  return res.json() as Promise<T>
}

export async function getMakes(): Promise<string[]> {
  return (await request<{ makes: string[] }>("/api/makes")).makes
}

export async function recommend(prefs: Preferences, signal?: AbortSignal): Promise<RecommendResponse> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token
  return request<RecommendResponse>("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(prefs),
    signal,
  })
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
