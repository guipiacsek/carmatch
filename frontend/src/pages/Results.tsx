import { Info, Pencil, RotateCcw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"

import { Dashboard } from "@/components/Dashboard"
import { LoadingScreen } from "@/components/LoadingScreen"
import { ShareButton } from "@/components/ShareButton"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { t, useI18n } from "@/i18n"
import { ApiError, getImage, recommend } from "@/lib/api"
import { hasSavedPrefs, loadPrefs, prefChips, takePresetFromUrl } from "@/lib/preferences"
import { KEYS, load, save } from "@/lib/storage"
import type { CarResult, RecommendResponse } from "@/lib/types"

const MAX_RESULTS = 9 // backend TARGET_RESULTS: 3 batches x 3

interface Stored {
  prefs: string
  data: RecommendResponse
}

function friendlyError(e: unknown): string {
  const status = e instanceof ApiError ? e.status : -1
  if (e instanceof ApiError && status === 429) {
    const mins = e.retryAfter ? Math.max(1, Math.ceil(e.retryAfter / 60)) : null
    return `${t("err.limit")} ${mins ? t("err.tryIn", { n: mins }) : t("err.later")} ${t("err.cachedOk")}`
  }
  if (status === 422) return t("err.invalid")
  if (status === 0) return t("err.network")
  return t("err.generic")
}

export default function Results() {
  useState(takePresetFromUrl) // once, before the saved-prefs check below
  const { lang } = useI18n()
  const [state, setState] = useState<
    | { kind: "loading"; cars: CarResult[] } // cars stream in as each GPT batch finishes
    | { kind: "error"; message: string; retryable: boolean }
    | { kind: "done"; data: RecommendResponse }
  >({ kind: "loading", cars: [] })

  const run = useCallback((signal?: AbortSignal) => {
    const prefs = { ...loadPrefs(), language: lang } // AI text in the UI language; switching language re-runs
    const key = JSON.stringify(prefs)
    const stored = load<Stored | null>(KEYS.results, null)
    if (stored?.prefs === key) {
      setState({ kind: "done", data: stored.data })
      return
    }
    setState({ kind: "loading", cars: [] })
    const onCars = (cars: CarResult[]) => {
      cars.forEach(getImage) // start photo downloads while the loading screen is still up
      setState({ kind: "loading", cars })
    }
    recommend(prefs, onCars, signal).then(
      (data) => {
        save(KEYS.results, { prefs: key, data } satisfies Stored)
        if (data.share_id) save(KEYS.lastSearch, { id: data.share_id, at: Date.now() }, localStorage)
        setState({ kind: "done", data })
      },
      (e: unknown) => {
        if (signal?.aborted) return
        setState({ kind: "error", message: friendlyError(e), retryable: !(e instanceof ApiError && e.status === 429) })
      },
    )
  }, [lang])

  useEffect(() => {
    const ctrl = new AbortController()
    run(ctrl.signal)
    return () => ctrl.abort()
  }, [run])

  if (!hasSavedPrefs()) return <Navigate to="/" replace />

  const editLink = (
    <Button asChild variant="secondary" size="icon" className="size-14 rounded-[18px] shadow-[0_6px_20px_#0000001a]">
      <Link to="/" onClick={() => save(KEYS.step, 0)} aria-label={t("res.edit")} title={t("res.edit")}>
        <Pencil className="size-5" aria-hidden />
      </Link>
    </Button>
  )

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="mr-auto">
          <h1 className="text-[clamp(28px,4vw,44px)] leading-tight font-bold">{t("res.title")}</h1>
          <p className="text-sm font-light text-muted-foreground">{t("res.subtitle")}</p>
        </div>
        <div className="flex gap-3">
          {state.kind === "done" && state.data.share_id && <ShareButton shareId={state.data.share_id} />}
          {editLink}
        </div>
      </div>
      {state.kind !== "done" && (
        <ul className="-mt-2 flex flex-wrap gap-2" aria-label={t("res.answers")}>
          {prefChips(loadPrefs()).map((c) => (
            <li key={c} className="rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {c}
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" && (
          <LoadingScreen found={Math.min(state.cars.length, MAX_RESULTS)} total={MAX_RESULTS} />
        )}

        {state.kind === "error" && (
          <Card>
            <CardContent className="grid justify-items-start gap-4">
              <p role="alert">{state.message}</p>
              {state.retryable && (
                <Button onClick={() => run()}>
                  <RotateCcw aria-hidden /> {t("res.tryAgain")}
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
                  <p>{t("res.none")}</p>
                  {editLink}
                </CardContent>
              </Card>
            ) : (
              <Dashboard cars={state.data.results} prefs={loadPrefs()} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
