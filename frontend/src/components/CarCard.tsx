import { CarFront, ExternalLink, Fuel, Gauge, Heart, Users, Cog } from "lucide-react"
import { lazy, Suspense, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccount } from "@/hooks/account"
import { useCarImage } from "@/hooks/useCarImage"
import { carName, efficiency, priceRange } from "@/lib/format"
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
        aria-label={`No photo available for ${name}`}
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
        Photo:{" "}
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
        {" via Wikimedia Commons"}
      </figcaption>
    </figure>
  )
}

export interface CompareControl {
  selected: boolean
  disabled: boolean
  onToggle: () => void
}

export function CarCard({
  car,
  showRank = true,
  compare,
}: {
  car: CarResult
  showRank?: boolean
  compare?: CompareControl
}) {
  const { isFavorite, toggleFavorite } = useAccount()
  const fav = isFavorite(car.car_key)
  const [busy, setBusy] = useState(false)
  const name = carName(car)
  const image = useCarImage(car)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const specs = [
    { icon: CarFront, label: "Body", value: car.body_type },
    { icon: Gauge, label: "Efficiency", value: efficiency(car) },
    { icon: Fuel, label: "Fuel", value: car.fuel_type },
    { icon: Cog, label: "Drivetrain", value: car.drivetrain },
    { icon: Users, label: "Seats", value: String(car.seats) },
  ]

  return (
    <Card
      className="relative cursor-pointer gap-0 overflow-hidden py-0 transition-shadow hover:shadow-lg hover:ring-1 hover:ring-primary/40"
      onClick={(e) => {
        // The whole card opens details, except its own controls (heart, compare, links). Clicks inside the
        // dialog also bubble here through the React portal; they aren't inside the card's DOM, so skip them.
        const target = e.target as HTMLElement
        if (e.currentTarget.contains(target) && !target.closest("a, button, input, label")) setDetailsOpen(true)
      }}
    >
      {showRank && (
        <Badge className="absolute top-3 left-3 z-10 shadow" aria-label={`Rank ${car.rank}`}>
          #{car.rank}
        </Badge>
      )}
      <Button
        size="icon"
        variant="secondary"
        className="absolute top-2 right-2 z-10 size-10 rounded-full shadow"
        aria-label={fav ? `Remove ${name} from favorites` : `Save ${name} to favorites`}
        aria-pressed={fav}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await toggleFavorite({ ...car, image: image ?? null }) // keep the photo credit with the favorite
          setBusy(false)
        }}
      >
        <Heart className={cn("size-5", fav && "fill-red-500 text-red-500")} aria-hidden />
      </Button>

      <CarPhoto car={car} image={image} />

      <CardContent className="grid gap-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg leading-tight font-semibold">
            <button
              type="button"
              className="text-left underline-offset-4 hover:underline focus-visible:underline"
              onClick={() => setDetailsOpen(true)}
              aria-haspopup="dialog"
            >
              {name}
              <span className="sr-only">: more details</span>
            </button>
          </h2>
          {showRank && (
            <Badge variant="outline" className="shrink-0" title="How well this car fits your answers">
              {car.match_score}% match
            </Badge>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {specs.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">{label}</dt>
              <dd className="truncate">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AI estimate</span>
            {car.over_budget && <Badge variant="destructive">Above budget</Badge>}
          </div>
          <p className="text-base font-semibold">{priceRange(car)}</p>
        </div>

        <ul className="grid gap-1.5 text-sm">
          {car.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              {b}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-3 pt-4 pb-4">
        {compare && (
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 text-sm select-none",
              compare.disabled && "cursor-not-allowed opacity-50",
            )}
            title={compare.disabled ? "You can compare up to 3 cars" : undefined}
          >
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={compare.selected}
              disabled={compare.disabled}
              onChange={compare.onToggle}
            />
            Compare
          </label>
        )}
        <Button asChild variant="outline" className="w-full">
          <a href={listingsUrl(car)} target="_blank" rel="noopener noreferrer sponsored">
            See on Cars.com <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only"> for {name} (opens in a new tab)</span>
          </a>
        </Button>
      </CardFooter>
      {detailsOpen && (
        <Suspense fallback={null}>
          <CarDetailsDialog car={car} image={image} onClose={() => setDetailsOpen(false)} />
        </Suspense>
      )}
    </Card>
  )
}
