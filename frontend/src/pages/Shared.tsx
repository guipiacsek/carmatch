import { Info, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { ResultList } from "@/components/ResultList"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n, type Key } from "@/i18n"
import { ApiError, getSharedResults } from "@/lib/api"
import type { RecommendResponse } from "@/lib/types"

export default function Shared() {
  const { shareId = "" } = useParams()
  const [data, setData] = useState<RecommendResponse | null>(null)
  const { t } = useI18n()
  const [error, setError] = useState<Key | null>(null)

  useEffect(() => {
    getSharedResults(shareId).then(setData, (e: unknown) =>
      setError(e instanceof ApiError && e.status === 404 ? "sh.expired" : "sh.error"),
    )
  }, [shareId])

  const startLink = (
    <Button asChild>
      <Link to="/">
        <Search aria-hidden /> {t("sh.find")}
      </Link>
    </Button>
  )

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(28px,4vw,44px)] leading-tight font-bold">{t("sh.title")}</h1>
          <p className="text-sm font-light text-muted-foreground">{t("sh.sub")}</p>
        </div>
        {startLink}
      </div>
      <div aria-live="polite" aria-busy={!data && !error}>
        {error && (
          <Card>
            <CardContent className="grid justify-items-start gap-4">
              <p role="alert">{t(error)}</p>
              {startLink}
            </CardContent>
          </Card>
        )}
        {!data && !error && <p className="text-sm font-light text-muted-foreground">{t("sh.loading")}</p>}
        {data && (
          <div className="grid gap-6">
            {data.notice && (
              <div className="flex gap-3 rounded-xl border bg-muted/50 p-4 text-sm">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{data.notice}</p>
              </div>
            )}
            <ResultList cars={data.results} />
          </div>
        )}
      </div>
    </div>
  )
}
