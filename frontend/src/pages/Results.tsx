import { Info, Pencil, RotateCcw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"

import { CarCard } from "@/components/CarCard"
import { ResultList } from "@/components/ResultList"
import { ShareButton } from "@/components/ShareButton"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, recommend } from "@/lib/api"
import { hasSavedPrefs, loadPrefs } from "@/lib/preferences"
import { KEYS, load, save } from "@/lib/storage"
import type { CarResult, RecommendResponse } from "@/lib/types"

const MAX_RESULTS = 9 // backend TARGET_RESULTS: 3 batches x 3

interface Stored {
  prefs: string
  data: RecommendResponse
}

function friendlyError(e: unknown): string {
  if (e instanceof ApiError && e.status === 429) {
    const mins = e.retryAfter ? Math.max(1, Math.ceil(e.retryAfter / 60)) : null
    return `You've reached the hourly search limit. ${mins ? `Try again in about ${mins} minute${mins === 1 ? "" : "s"}.` : "Please try again later."} Searches you've already run still load instantly.`
  }
  if (e instanceof ApiError && e.status === 422) return "Some answers look invalid. Please review them and try again."
  return e instanceof Error ? e.message : "Something went wrong. Please try again."
}

export default function Results() {
  const [state, setState] = useState<
    | { kind: "loading"; cars: CarResult[] } // cars stream in as each GPT batch finishes
    | { kind: "error"; message: string; retryable: boolean }
    | { kind: "done"; data: RecommendResponse }
  >({ kind: "loading", cars: [] })

  const run = useCallback((signal?: AbortSignal) => {
    const prefs = loadPrefs()
    const key = JSON.stringify(prefs)
    const stored = load<Stored | null>(KEYS.results, null)
    if (stored?.prefs === key) {
      setState({ kind: "done", data: stored.data })
      return
    }
    setState({ kind: "loading", cars: [] })
    recommend(prefs, (cars) => setState({ kind: "loading", cars }), signal).then(
      (data) => {
        save(KEYS.results, { prefs: key, data } satisfies Stored)
        setState({ kind: "done", data })
      },
      (e: unknown) => {
        if (signal?.aborted) return
        setState({ kind: "error", message: friendlyError(e), retryable: !(e instanceof ApiError && e.status === 429) })
      },
    )
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    run(ctrl.signal)
    return () => ctrl.abort()
  }, [run])

  if (!hasSavedPrefs()) return <Navigate to="/" replace />

  const editLink = (
    <Button asChild variant="outline">
      <Link to="/" onClick={() => save(KEYS.step, 0)}>
        <Pencil aria-hidden /> Edit answers
      </Link>
    </Button>
  )

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your top matches</h1>
          <p className="text-sm text-muted-foreground">Ranked from EPA vehicle data by AI. Prices are estimates.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.kind === "done" && state.data.share_id && <ShareButton shareId={state.data.share_id} />}
          {editLink}
        </div>
      </div>

      <div aria-live="polite" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" && (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              {state.cars.length
                ? `Found ${state.cars.length} so far, finding more…`
                : "Finding cars that fit you. This takes a few seconds…"}
            </p>
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {state.cars.map((car, i) => (
                <li key={car.car_key} className="flex [&>*]:w-full">
                  <CarCard car={{ ...car, rank: i + 1 }} />
                </li>
              ))}
              {Array.from({ length: Math.max(0, MAX_RESULTS - state.cars.length) }, (_, i) => (
                <li key={`pending-${i}`} aria-hidden>
                  <Card className="gap-0 overflow-hidden py-0">
                    <Skeleton className="aspect-[16/10] rounded-none" />
                    <CardContent className="grid gap-3 py-4">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-12 w-full" />
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        )}

        {state.kind === "error" && (
          <Card>
            <CardContent className="grid justify-items-start gap-4">
              <p role="alert">{state.message}</p>
              {state.retryable && (
                <Button onClick={() => run()}>
                  <RotateCcw aria-hidden /> Try again
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {state.kind === "done" && (
          <div className="grid gap-6">
            {state.data.notice && (
              <div className="flex gap-3 rounded-xl border bg-muted/50 p-4 text-sm">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{state.data.notice}</p>
              </div>
            )}
            {state.data.results.length === 0 ? (
              <Card>
                <CardContent className="grid justify-items-start gap-4">
                  <p>No cars match those must-haves. Try allowing more body types or fuel types.</p>
                  {editLink}
                </CardContent>
              </Card>
            ) : (
              <ResultList cars={state.data.results} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
