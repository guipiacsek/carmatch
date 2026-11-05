import { useEffect, useState } from "react"

import { money, t } from "@/i18n"
import { getListings } from "@/lib/api"
import type { CarResult, ListingSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

/** "For sale now: from $X · N listings" from live dealer listings; nothing while loading or when there are none. */
export function ListedPrice({ car, className }: { car: Pick<CarResult, "year" | "make" | "model">; className?: string }) {
  const [found, setFound] = useState<ListingSummary | null>(null)
  const { year, make, model } = car
  useEffect(() => {
    let live = true
    getListings({ year, make, model }).then((s) => live && setFound(s))
    return () => {
      live = false
    }
  }, [year, make, model])
  if (!found?.count || found.min_price == null) return null
  return (
    <p className={cn("text-xs", className)}>
      <span className="label-caps mr-2 text-muted-foreground">{t("card.forSale")}</span>
      <b className="font-semibold">{t("card.listed", { price: money(found.min_price), n: found.count })}</b>
    </p>
  )
}
