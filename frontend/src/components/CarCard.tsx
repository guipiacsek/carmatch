import { CarFront, ExternalLink, Fuel, Gauge, Heart, Users, Cog } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccount } from "@/hooks/account"
import { getImage } from "@/lib/api"
import type { CarImage, CarResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

// Outbound hook for future affiliate links: swap this for a partner URL builder.
function listingsUrl(car: CarResult): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${car.year} ${car.make} ${car.model} for sale`)}`
}

function efficiency(car: CarResult): string {
  if (car.fuel_type === "Electric") return car.mpge ? `${car.mpge} MPGe` : "n/a"
  if (car.fuel_type === "Plug-in Hybrid" && car.mpge) return `${car.mpg ?? "?"} MPG · ${car.mpge} MPGe`
  return car.mpg ? `${car.mpg} MPG` : "n/a"
}

function CarPhoto({ car, image }: { car: CarResult; image: CarImage | null | undefined }) {
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

export function CarCard({ car, showRank = true }: { car: CarResult; showRank?: boolean }) {
  const { isFavorite, toggleFavorite } = useAccount()
  const fav = isFavorite(car.car_key)
  const [busy, setBusy] = useState(false)
  const name = `${car.year} ${car.make} ${car.model}`
  // undefined = still loading; saved favorites already carry their image
  const [image, setImage] = useState<CarImage | null | undefined>(car.image ?? undefined)
  useEffect(() => {
    if (car.image) return
    let live = true
    getImage(car).then((img) => live && setImage(img))
    return () => {
      live = false
    }
  }, [car])

  const specs = [
    { icon: CarFront, label: "Body", value: car.body_type },
    { icon: Gauge, label: "Efficiency", value: efficiency(car) },
    { icon: Fuel, label: "Fuel", value: car.fuel_type },
    { icon: Cog, label: "Drivetrain", value: car.drivetrain },
    { icon: Users, label: "Seats", value: String(car.seats) },
  ]

  return (
    <Card className="relative gap-0 overflow-hidden py-0">
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
          <h2 className="text-lg leading-tight font-semibold">{name}</h2>
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
          <p className="text-base font-semibold">
            {car.price_min != null && car.price_max != null
              ? `${usd.format(car.price_min)} – ${usd.format(car.price_max)}`
              : "No price estimate"}
          </p>
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

      <CardFooter className="mt-auto pt-4 pb-4">
        <Button asChild variant="outline" className="w-full">
          <a href={listingsUrl(car)} target="_blank" rel="noopener noreferrer sponsored">
            See listings <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only"> for {name} (opens in a new tab)</span>
          </a>
        </Button>
      </CardFooter>
    </Card>
  )
}
