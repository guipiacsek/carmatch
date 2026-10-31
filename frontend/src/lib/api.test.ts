import { afterEach, expect, test, vi } from "vitest"

import { recommend } from "./api"
import type { CarResult, Preferences } from "./types"

const prefs = {} as Preferences // only forwarded to the (mocked) server

const car = (make: string, score: number) => ({ make, match_score: score, over_budget: false }) as CarResult

// The server's NDJSON split at awkward places: mid-line and mid-JSON, like real network chunks.
function streamOf(chunks: string[]): Response {
  const body = new ReadableStream({
    start(c) {
      chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s)))
      c.close()
    },
  })
  return new Response(body, { status: 200 })
}

afterEach(() => vi.unstubAllGlobals())

test("recommend joins lines split across chunks and streams cars in final order", async () => {
  const lines = [
    { type: "meta", relaxed: [], cached: false },
    { type: "cars", cars: [car("Kia", 70)] },
    { type: "cars", cars: [car("Mazda", 90)] },
    { type: "done", results: [car("Mazda", 90), car("Kia", 70)], relaxed: [], share_id: "abc" },
  ]
  const text = lines.map((l) => JSON.stringify(l) + "\n").join("")
  const cuts = [10, text.indexOf("Kia") + 1, text.indexOf("Mazda") + 2, text.length - 5]
  const chunks = [0, ...cuts].map((at, i) => text.slice(at, [...cuts, text.length][i]))
  vi.stubGlobal("fetch", vi.fn(async () => streamOf(chunks)))

  const seen: string[][] = []
  const done = await recommend(prefs, (cars) => seen.push(cars.map((c) => c.make)))

  expect(seen).toEqual([["Kia"], ["Mazda", "Kia"]])
  expect(done.share_id).toBe("abc")
  expect(done).not.toHaveProperty("type")
})

test("recommend reports a stream that ends before the done line", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => streamOf(['{"type":"meta","relaxed":[],"cached":false}\n'])))
  await expect(recommend(prefs, () => {})).rejects.toThrow(/dropped/)
})
