import { CarFront, ExternalLink, Heart } from "lucide-react"
import { lazy, Suspense, useState } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccount } from "@/hooks/account"
import { t, useI18n, type Key } from "@/i18n"
import { useCarImage } from "@/hooks/useCarImage"
import { carName, priceRange } from "@/lib/format"
import { listingsUrl } from "@/lib/listings"
import type { CarImage, CarResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const CarDetailsDialog = lazy(() => import("@/components/CarDetailsDialog"))

export function CarPhoto({ car, image }: { car: CarResult; image: CarImage | null | undefined }) {
  const [failed, setFailed] = useState(false)
  const name = `${car.year} ${car.make} ${car.model}`
  if (image === undefined) return <Skeleton className="aspect-[16/10] rounded-none" />
  if (!image || failed) {
    return (
      <div
        className="flex aspect-[16/10] flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-muted/40 text-muted-foreground"
        role="img"
        aria-label={t("card.noPhoto", { name })}
      >
        <CarFront className="size-12" aria-hidden />
        <span className="text-sm">{car.make} {car.model}</span>
      </div>
    )
  }
  return (
    <figure>
      <img
        src={image.url}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="aspect-[16/10] w-full bg-muted object-cover"
      />
      <figcaption className="truncate px-4 pt-1.5 text-[11px] text-muted-foreground">
        {t("card.photo")}{" "}
        <a href={image.page_url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          {image.author}
        </a>
        {", "}
        {image.license_url ? (
          <a href={image.license_url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
            {image.license}
          </a>
        ) : (
          image.license
        )}
        {` ${t("card.viaCommons")}`}
      </figcaption>
    </figure>
  )
}

export interface CompareControl {
  selected: boolean
  disabled: boolean
  onToggle: () => void
}

/** Arc color by position: gray, red, mustard, navy (see --arc-* in index.css). */
export const arcColor = (index: number) => `var(--arc-${(index % 4) + 1})`

const fuelShort = (f: CarResult["fuel_type"]) =>
  t((f === "Plug-in Hybrid" || f === "Electric" ? `short.${f}` : `v.${f}`) as Key)

function ArcPhoto({ car, image }: { car: CarResult; image: CarImage | null | undefined }) {
  const [failed, setFailed] = useState(false)
  const box = "absolute top-12 -right-9 h-[140px] w-[270px] rounded-[18px] shadow-[0_18px_30px_#0003]"
  if (image === undefined) return <Skeleton className={cn(box, "bg-white/40")} />
  if (!image || failed) {
    return (
      <div className={cn(box, "grid place-items-center bg-white/25 text-white")} role="img" aria-label={t("card.noPhoto", { name: carName(car) })}>
        <CarFront className="size-12" aria-hidden />
      </div>
    )
  }
  return (
    <img
      src={image.url}
      alt={carName(car)}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(box, "bg-white/30 object-cover")}
    />
  )
}

export function CarCard({
  car,
  index = 0,
  showRank = true,
  compare,
}: {
  car: CarResult
  index?: number
  showRank?: boolean
  compare?: CompareControl
}) {
  const { isFavorite, toggleFavorite } = useAccount()
  useI18n()
  const fav = isFavorite(car.car_key)
  const [busy, setBusy] = useState(false)
  const name = carName(car)
  const image = useCarImage(car)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const color = arcColor(index)

  const chips = [
    { label: t("card.fuel"), value: fuelShort(car.fuel_type) },
    { label: t("drive.label"), value: car.drivetrain.split(" / ")[0] },
    { label: t("seats.label"), value: car.seats, unit: t("card.seatsUnit") },
    { label: t("card.efficiency"), value: car.fuel_type === "Electric" ? car.mpge : car.mpg, unit: car.fuel_type === "Electric" ? "mpge" : "mpg" },
  ]

  return (
    <article
      className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[26px] bg-card text-card-foreground shadow-[0_2px_0_#0000000a] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_22px_40px_#0000001f]"
      style={{ "--c": color } as React.CSSProperties}
      onClick={(e) => {
        // The whole card opens details, except its own controls (heart, compare, links). Clicks inside the
        // dialog also bubble here through the React portal; they aren't inside the card's DOM, so skip them.
        const target = e.target as HTMLElement
        if (e.currentTarget.contains(target) && !target.closest("a, button, input, label")) setDetailsOpen(true)
      }}
    >
      <div className="relative h-[300px] shrink-0 text-white">
        <div aria-hidden className="absolute -top-[60px] -left-10 h-[380px] w-[calc(100%+30px)] rounded-br-[300px] bg-[var(--c)] opacity-95" />
        {showRank && (
          <p className="absolute top-4 left-[18px] text-[13px] font-extrabold tracking-[2px]">
            #{car.rank} · {car.match_score}%<span className="sr-only"> {t("card.match")}</span>
          </p>
        )}
        <ArcPhoto car={car} image={image} />
        <h2 className="absolute right-14 bottom-[18px] left-[18px] leading-[1.05]">
          <button
            type="button"
            className="text-left underline-offset-4 focus-visible:underline"
            onClick={() => setDetailsOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="block text-2xl font-extralight tracking-wide uppercase">{car.make}</span>
            <span className="block text-[22px] font-extrabold">{car.model}</span>
            <span className="block text-xs font-light opacity-85">{car.year}</span>
            <span className="sr-only">{t("dash.moreDetails")}</span>
          </button>
        </h2>
        <button
          type="button"
          className="absolute right-3 bottom-4 grid size-10 place-items-center rounded-full text-white transition hover:bg-white/20 disabled:opacity-60"
          aria-label={fav ? t("card.unsave", { name }) : t("card.save", { name })}
          aria-pressed={fav}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await toggleFavorite({ ...car, image: image ?? null }) // keep the photo credit with the favorite
            setBusy(false)
          }}
        >
          <Heart className={cn("size-5", fav && "fill-white")} aria-hidden />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 px-[18px] pt-[18px] pb-4">
        <p className="label-caps text-muted-foreground">{t("card.moreInfo")}</p>
        <dl className="flex gap-2.5">
          {chips.map((c, i) => (
            <div
              key={c.label}
              title={c.label}
              className={cn(
                "grid size-[46px] place-items-center rounded-full bg-muted text-center text-[10px] leading-tight font-bold text-muted-foreground",
                i === 0 && "bg-[var(--c)] text-white",
              )}
            >
              <dt className="sr-only">{c.label}</dt>
              <dd>
                {c.value ?? "–"}
                {c.unit && <span className="block font-semibold">{c.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>

        <p className="label-caps text-muted-foreground">
          {t("card.aiEstimate")}
          {car.over_budget && <span className="ml-2 text-primary">{t("card.aboveBudget")}</span>}
        </p>
        <dl className="grid gap-2 rounded-[10px] border px-3 py-2.5 text-xs">
          <div>
            <dt className="label-caps text-[9px] text-muted-foreground">{t("card.priceRange")}</dt>
            <dd className="text-sm font-semibold">{priceRange(car)}</dd>
          </div>
          <div>
            <dt className="label-caps text-[9px] text-muted-foreground">{t("card.why")}</dt>
            <dd>
              <ul className="mt-1 grid gap-1">
                {car.bullets.map((b) => (
                  <li key={b} className="flex gap-1.5 font-medium">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--c)]" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {compare ? (
            <label
              className={cn(
                "flex cursor-pointer items-center gap-2 text-xs font-semibold select-none",
                compare.disabled && "cursor-not-allowed opacity-50",
              )}
              title={compare.disabled ? t("card.compareMax") : undefined}
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={compare.selected}
                disabled={compare.disabled}
                onChange={compare.onToggle}
              />
              {t("card.compare")}
            </label>
          ) : (
            <span />
          )}
          <Button asChild size="sm" className="rounded-full">
            <a href={listingsUrl(car)} target="_blank" rel="noopener noreferrer sponsored">
              Cars.com <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only"> {t("card.listingsFor", { name })}</span>
            </a>
          </Button>
        </div>
        {image && (
          <p className="truncate text-[9px] text-muted-foreground">
            {t("card.photo")}{" "}
            <a href={image.page_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {image.author}, {image.license}
            </a>
          </p>
        )}
      </div>
      {detailsOpen && (
        <Suspense fallback={null}>
          <CarDetailsDialog car={car} image={image} color={color} onClose={() => setDetailsOpen(false)} />
        </Suspense>
      )}
    </article>
  )
}
