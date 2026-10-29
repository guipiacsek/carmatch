import { AlertTriangle, CheckCircle2, ExternalLink, RotateCcw, Sparkles, Wrench } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { CarPhoto } from "@/components/CarCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { getCarDetails } from "@/lib/api"
import { carName, efficiency, priceRange } from "@/lib/format"
import { listingsUrl } from "@/lib/listings"
import type { CarDetails, CarImage, CarResult } from "@/lib/types"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Bullets({ items, icon: Icon, tone }: { items: string[]; icon: typeof CheckCircle2; tone: string }) {
  return (
    <ul className="grid gap-1.5 text-sm">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  )
}

export default function CarDetailsDialog({
  car,
  image,
  color,
  onClose,
}: {
  car: CarResult
  image: CarImage | null | undefined
  color: string
  onClose: () => void
}) {
  const [details, setDetails] = useState<CarDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = carName(car)

  const load = useCallback(() => {
    setError(null)
    getCarDetails(car).then(setDetails, (e: Error) => setError(e.message))
  }, [car])
  useEffect(load, [load])

  const facts = [
    ["AI price estimate", priceRange(car)],
    ["Efficiency (EPA)", efficiency(car)],
    ["Body", car.body_type],
    ["Fuel", car.fuel_type],
    ["Drivetrain", car.drivetrain],
    ["Transmission", car.transmission],
    ["Seats", String(car.seats)],
    ["EPA class", details?.epa.epa_class ?? "…"],
  ]

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[92svh] grid-cols-[minmax(0,1fr)] gap-0 overflow-y-auto rounded-[28px] p-0 sm:max-w-3xl [&>button:last-child]:text-white"
        style={{ "--c": color } as React.CSSProperties}
      >
        <div className="grid items-center gap-5 bg-[var(--c)] p-6 text-white sm:grid-cols-2 sm:p-7">
          <div className="overflow-hidden rounded-[18px] bg-white/20 [&_figcaption]:text-white/80 [&_figcaption_a]:text-white/90">
            <CarPhoto car={car} image={image} />
          </div>
          <DialogHeader className="text-left">
            <DialogTitle className="leading-[1.05] text-white">
              <span className="block text-2xl font-extralight tracking-wide uppercase">{car.make}</span>
              <span className="block text-3xl font-extrabold">{car.model}</span>
            </DialogTitle>
            <DialogDescription className="text-white/85">
              {car.year} · {car.match_score}% match{car.over_budget ? " · above budget" : ""}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-6 sm:p-7">
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-[14px] bg-background px-3 py-2.5 text-sm dark:bg-secondary">
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Specs are EPA data. The overview, pros and cons below are AI-written and can be wrong, so verify before buying.
        </p>

        <div aria-live="polite" aria-busy={!details && !error} className="grid gap-5">
          {error && (
            <div className="grid justify-items-start gap-3 rounded-xl border p-4">
              <p role="alert" className="text-sm">{error}</p>
              <Button size="sm" variant="outline" onClick={load}>
                <RotateCcw aria-hidden /> Try again
              </Button>
            </div>
          )}

          {!details && !error && (
            <div className="grid gap-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="size-4" aria-hidden /> Researching this car…
              </p>
              <Skeleton className="h-16 w-full" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {details && (
            <>
              <p className="text-sm leading-relaxed">{details.summary}</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Section title="Pros">
                  <Bullets items={details.pros} icon={CheckCircle2} tone="text-emerald-600 dark:text-emerald-400" />
                </Section>
                <Section title="Cons">
                  <Bullets items={details.cons} icon={AlertTriangle} tone="text-amber-600 dark:text-amber-400" />
                </Section>
              </div>
              <Section title="Reliability">
                <p className="text-sm">{details.reliability}</p>
              </Section>
              <Section title="Main trims">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {details.trims.map((t) => (
                    <li key={t.name} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                      <span className="font-medium">{t.name}</span>
                      <span className="block text-xs text-muted-foreground">{t.highlight}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="If you're buying used">
                <Bullets items={details.used_buying_tips} icon={Wrench} tone="text-primary" />
              </Section>
              <Section title="Also consider">
                <div className="flex flex-wrap gap-2">
                  {details.competitors.map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>

        <Button asChild className="h-auto w-full rounded-full py-2.5 whitespace-normal sm:w-fit">
          <a href={listingsUrl(car)} target="_blank" rel="noopener noreferrer sponsored">
            See {name} on Cars.com <ExternalLink aria-hidden />
          </a>
        </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
