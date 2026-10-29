import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react"
import { useRef, useState } from "react"

import { CarCard, CarPhoto } from "@/components/CarCard"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useCarImage } from "@/hooks/useCarImage"
import { carName, efficiency, priceRange } from "@/lib/format"
import { listingsUrl } from "@/lib/listings"
import type { CarResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_COMPARE = 3

const CARD_STEP = 310 // card width (290) + gap (20)

/** Horizontal Color Arc carousel with "Compare" checkboxes, a floating control pill, and the compare dialog. */
export function ResultList({
  cars,
  showRank = true,
  ordered = true,
}: {
  cars: CarResult[]
  showRank?: boolean
  ordered?: boolean
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLOListElement & HTMLUListElement>(null)
  const chosen = picked.map((k) => cars.find((c) => c.car_key === k)).filter((c): c is CarResult => !!c)
  const toggle = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_COMPARE ? [...p, key] : p))
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * CARD_STEP, behavior: "smooth" })
  const List = ordered ? "ol" : "ul"

  return (
    <>
      <List
        ref={row}
        tabIndex={0}
        aria-label="Cars, scroll sideways for more"
        className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-4 px-4 pt-2 pb-8 outline-none [scrollbar-width:none] sm:-mx-1 sm:px-1 [&::-webkit-scrollbar]:hidden"
      >
        {cars.map((car, i) => (
          <li key={car.car_key} className="flex w-[290px] shrink-0 snap-start">
            <CarCard
              car={car}
              index={i}
              showRank={showRank}
              compare={{
                selected: picked.includes(car.car_key),
                disabled: !picked.includes(car.car_key) && picked.length >= MAX_COMPARE,
                onToggle: () => toggle(car.car_key),
              }}
            />
          </li>
        ))}
      </List>

      {cars.length > 1 && (
        <div
          className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-md bg-[#8c8c8c] p-1.5 text-white shadow-[0_10px_30px_#0003] dark:bg-[#3a3a3d]"
          role="toolbar"
          aria-label="Browse and compare"
        >
          <button type="button" className="rounded px-3 py-1.5 hover:bg-white/15" onClick={() => scroll(-1)} aria-label="Previous cars">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" className="rounded px-3 py-1.5 hover:bg-white/15" onClick={() => scroll(1)} aria-label="Next cars">
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-60 disabled:hover:bg-transparent"
            disabled={chosen.length < 2}
            onClick={() => setOpen(true)}
            title={chosen.length < 2 ? "Tick Compare on 2 or 3 cars" : undefined}
          >
            <ArrowLeftRight className="size-4" aria-hidden />
            <span aria-live="polite">Compare{chosen.length ? ` (${chosen.length})` : ""}</span>
          </button>
          {chosen.length > 0 && (
            <button type="button" className="rounded px-2 py-1.5 hover:bg-white/15" onClick={() => setPicked([])} aria-label="Clear comparison">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      )}

      <Dialog open={open && chosen.length > 1} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Compare cars</DialogTitle>
            <DialogDescription>Prices are AI estimates. Efficiency is the EPA combined rating.</DialogDescription>
          </DialogHeader>
          <CompareTable cars={chosen} onRemove={toggle} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function PhotoCell({ car }: { car: CarResult }) {
  return (
    <div className="overflow-hidden rounded-lg [&_figcaption]:hidden">
      <CarPhoto car={car} image={useCarImage(car)} />
    </div>
  )
}

function CompareTable({ cars, onRemove }: { cars: CarResult[]; onRemove: (key: string) => void }) {
  // Highlight the best value in rows where "best" is unambiguous.
  const lowest = Math.min(...cars.map((c) => c.price_min ?? Infinity))
  const mostSeats = Math.max(...cars.map((c) => c.seats))
  const bestMatch = Math.max(...cars.map((c) => c.match_score))

  const rows: { label: string; cell: (c: CarResult) => React.ReactNode; best?: (c: CarResult) => boolean }[] = [
    { label: "Photo", cell: (c) => <PhotoCell car={c} /> },
    {
      label: "AI price estimate",
      cell: (c) => (
        <>
          {priceRange(c)}
          {c.over_budget && <span className="block text-xs text-destructive">Above budget</span>}
        </>
      ),
      best: (c) => c.price_min === lowest,
    },
    { label: "Match", cell: (c) => `${c.match_score}%`, best: (c) => c.match_score === bestMatch },
    { label: "Body", cell: (c) => c.body_type },
    { label: "Efficiency", cell: efficiency },
    { label: "Fuel", cell: (c) => c.fuel_type },
    { label: "Drivetrain", cell: (c) => c.drivetrain },
    { label: "Transmission", cell: (c) => c.transmission },
    { label: "Seats", cell: (c) => c.seats, best: (c) => c.seats === mostSeats },
    {
      label: "Why it fits",
      cell: (c) => (
        <ul className="grid list-disc gap-1 pl-4 text-xs">
          {c.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ),
    },
    {
      label: "Listings",
      cell: (c) => (
        <a
          href={listingsUrl(c)}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          Cars.com <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only"> for {carName(c)} (opens in a new tab)</span>
        </a>
      ),
    },
  ]

  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
        <caption className="sr-only">Side-by-side comparison of {cars.length} cars</caption>
        <thead>
          <tr>
            <th scope="col" className="w-28 sm:w-36">
              <span className="sr-only">Attribute</span>
            </th>
            {cars.map((c) => (
              <th key={c.car_key} scope="col" className="p-2 text-left align-top font-semibold">
                <div className="flex items-start justify-between gap-2">
                  <span>{carName(c)}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(c.car_key)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Remove ${carName(c)} from comparison`}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t">
              <th scope="row" className="p-2 text-left align-top text-xs font-medium text-muted-foreground">
                {row.label}
              </th>
              {cars.map((c) => {
                const best = !!row.best?.(c) && !cars.every((o) => row.best?.(o)) // a full tie isn't a "best"
                return (
                  <td key={c.car_key} className={cn("p-2 align-top", best && "font-semibold text-primary")}>
                    {row.cell(c)}
                    {best && (
                      <span className="sr-only"> (best)</span>
                    )}
                    {best && <Check className="ml-1 inline size-3.5" aria-hidden />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
