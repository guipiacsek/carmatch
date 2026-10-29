import { CarFront, ExternalLink, Heart, Pencil } from "lucide-react"
import { lazy, Suspense, useState } from "react"
import { Link } from "react-router-dom"

import { arcColor } from "@/components/CarCard"
import { ResultList } from "@/components/ResultList"
import { Button } from "@/components/ui/button"
import { MAX_FAVORITES, useAccount } from "@/hooks/account"
import { useCarImage } from "@/hooks/useCarImage"
import { money, t, useI18n } from "@/i18n"
import { carName, efficiency, priceRange } from "@/lib/format"
import { listingsUrl } from "@/lib/listings"
import { prefChips } from "@/lib/preferences"
import { KEYS, save } from "@/lib/storage"
import type { CarResult, Preferences } from "@/lib/types"
import { cn } from "@/lib/utils"

const CarDetailsDialog = lazy(() => import("@/components/CarDetailsDialog"))

type Open = (car: CarResult, color: string) => void

function Details({ car, color, onClose }: { car: CarResult; color: string; onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <CarDetailsDialog car={car} image={useCarImage(car)} color={color} onClose={onClose} />
    </Suspense>
  )
}

/** The best match as a giant arc card. */
function Hero({ car, onOpen }: { car: CarResult; onOpen: Open }) {
  const { isFavorite, toggleFavorite } = useAccount()
  const image = useCarImage(car)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const fav = isFavorite(car.car_key)
  const color = arcColor(1)
  const open = () => onOpen(car, color)
  const photo = "aspect-video w-[calc(100%-30px)] rounded-[22px] shadow-[0_26px_40px_#0003] max-sm:ml-[60px] sm:-ml-[60px] sm:w-[calc(100%+30px)]"

  return (
    <article
      className="relative grid cursor-pointer overflow-hidden rounded-[26px] bg-card transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_40px_#0000001a] sm:min-h-[360px] sm:grid-cols-2 lg:col-span-8"
      style={{ "--c": color } as React.CSSProperties}
      onClick={(e) => {
        const target = e.target as HTMLElement // same guard as CarCard: skip own controls and portal clicks
        if (e.currentTarget.contains(target) && !target.closest("a, button")) open()
      }}
    >
      <div
        aria-hidden
        className="absolute -top-20 -left-[60px] h-[330px] w-[calc(100%+60px)] rounded-br-[300px] bg-[var(--c)] sm:h-[calc(100%+160px)] sm:w-[64%] sm:rounded-br-[520px]"
      />
      <div className="relative flex min-h-[150px] flex-col p-6 text-white sm:px-7">
        <p className="text-[13px] font-extrabold tracking-[2px] uppercase">{t("dash.best", { score: car.match_score })}</p>
        <h2 className="mt-auto pt-6 leading-[1.02]">
          <button type="button" className="text-left underline-offset-4 focus-visible:underline" onClick={open} aria-haspopup="dialog">
            <span className="block text-[clamp(26px,3vw,40px)] font-extralight tracking-wide uppercase">{car.make}</span>
            <span className="block max-w-[85%] text-[clamp(26px,2.8vw,40px)] font-extrabold">{car.model}</span>
            <span className="mt-1 block text-sm font-light opacity-85">
              {car.year} · {car.drivetrain.split(" / ")[0]} · {efficiency(car)}
            </span>
            <span className="sr-only">{t("dash.moreDetails")}</span>
          </button>
        </h2>
      </div>
      <div className="relative grid min-w-0 content-between gap-[18px] pb-6 sm:pt-9">
        {image && !failed ? (
          <img src={image.url} alt={carName(car)} decoding="async" onError={() => setFailed(true)} className={cn(photo, "bg-white/30 object-cover")} />
        ) : (
          <div className={cn(photo, "grid place-items-center bg-muted text-muted-foreground")} role="img" aria-label={t("card.noPhoto", { name: carName(car) })}>
            <CarFront className="size-12" aria-hidden />
          </div>
        )}
        <div className="grid gap-2.5 px-6 sm:pr-7 sm:pl-0">
          <p className="label-caps text-muted-foreground">
            {t("card.aiEstimate")} {car.over_budget && <span className="ml-2 text-primary">{t("card.aboveBudget")}</span>}
          </p>
          <p className="text-2xl font-extrabold">{priceRange(car)}</p>
          <ul className="grid gap-1 text-[13px] font-medium">
            {car.bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="text-primary" aria-hidden>•</span>
                {b}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 pt-1">
            <Button asChild size="sm" className="rounded-full">
              <a href={listingsUrl(car)} target="_blank" rel="noopener noreferrer sponsored">
                Cars.com <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only"> {t("card.listingsFor", { name: carName(car) })}</span>
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label={fav ? t("card.unsave", { name: carName(car) }) : t("card.save", { name: carName(car) })}
              aria-pressed={fav}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await toggleFavorite({ ...car, image: image ?? null })
                setBusy(false)
              }}
            >
              <Heart className={cn("size-5", fav && "fill-primary text-primary")} aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}

function Stat({ index, value, label }: { index: number; value: string; label: string }) {
  return (
    <div className="@container relative flex min-h-[132px] flex-col justify-end overflow-hidden rounded-[26px] bg-card p-5">
      <div aria-hidden className="absolute -top-10 -left-[30px] h-24 w-[110px] rounded-br-[90px]" style={{ background: arcColor(index) }} />
      {/* Shrinks long values ("R$ 187.300", "¥6,000,000") to the tile's width; a digit is about 0.6em */}
      <p
        className="relative text-[min(32px,calc(160cqi/var(--n)))] leading-tight font-extrabold whitespace-nowrap"
        style={{ "--n": value.length } as React.CSSProperties}
      >
        {value}
      </p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

const panel = "grid content-start gap-3 rounded-[26px] bg-card p-[22px]"
const panelTitle = "flex items-baseline justify-between text-[15px] font-bold"

function Pick({ title, note, car, index, onOpen }: { title: string; note: string; car: CarResult; index: number; onOpen: Open }) {
  const image = useCarImage(car)
  return (
    <section className={panel}>
      <h3 className={panelTitle}>
        {title} <small className="text-xs font-medium text-muted-foreground">{note}</small>
      </h3>
      <button type="button" className="flex items-center gap-3.5 text-left" onClick={() => onOpen(car, arcColor(index))} aria-haspopup="dialog">
        <span className="h-16 w-24 shrink-0 overflow-hidden rounded-[14px] pt-1.5 pl-3.5" style={{ background: arcColor(index) }}>
          {image ? (
            <img src={image.url} alt="" loading="lazy" className="h-[58px] w-[100px] rounded-[10px] object-cover" />
          ) : (
            <CarFront className="mt-2 ml-2 size-8 text-white" aria-hidden />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-extralight uppercase">{car.make}</span>
          <span className="block text-[15px] font-extrabold">{car.model}</span>
          <span className="block text-xs text-muted-foreground">
            {car.year} · {car.price_min != null ? priceRange(car) : efficiency(car)}
          </span>
        </span>
      </button>
    </section>
  )
}

function Saved({ best }: { best: CarResult }) {
  const { enabled, user, favorites, openAuth } = useAccount()
  if (!enabled) {
    // No accounts on this deployment: point at listings for the best match instead.
    return (
      <section className={cn(panel, "bg-[var(--arc-4)] text-white")}>
        <h3 className="text-xl leading-tight font-light">
          {t("dash.found")} <b className="block font-extrabold">{t("dash.checkListings")}</b>
        </h3>
        <Button asChild size="sm" className="justify-self-start rounded-full">
          <a href={listingsUrl(best)} target="_blank" rel="noopener noreferrer sponsored">
            {t("dash.seeListings")} <ExternalLink className="size-3.5" aria-hidden />
            <span className="sr-only"> {t("dash.seeListingsFor", { name: carName(best) })}</span>
          </a>
        </Button>
      </section>
    )
  }
  return (
    <section className={panel}>
      <h3 className={panelTitle}>
        {t("dash.saved")}{" "}
        {user && (
          <small className="text-xs font-medium text-muted-foreground">
            {t("dash.ofMax", { n: favorites.length, max: MAX_FAVORITES })}
          </small>
        )}
      </h3>
      <p className="text-[13px] font-light text-muted-foreground">
        {user ? t("dash.savedHint") : t("dash.signInHint")}
      </p>
      {user ? (
        <Button asChild size="sm" className="justify-self-start rounded-full">
          <Link to="/favorites">{t("nav.favorites")}</Link>
        </Button>
      ) : (
        <Button size="sm" className="justify-self-start rounded-full" onClick={openAuth}>
          {t("nav.signIn")}
        </Button>
      )}
    </section>
  )
}

/** Results as a dashboard: best-match hero, stat tiles, search / best value / saved panels, then every match. */
export function Dashboard({ cars, prefs }: { cars: CarResult[]; prefs: Preferences }) {
  useI18n()
  const [open, setOpen] = useState<{ car: CarResult; color: string } | null>(null)
  const onOpen: Open = (car, color) => setOpen({ car, color })
  const best = cars[0]

  const mpgs = cars.map((c) => c.mpg).filter((m): m is number => m != null)
  const priced = cars.filter((c) => c.price_min != null)
  const value = priced.length
    ? priced.reduce((a, b) => (b.price_min! < a.price_min! ? b : a))
    : cars.reduce((a, b) => ((b.mpg ?? b.mpge ?? 0) > (a.mpg ?? a.mpge ?? 0) ? b : a))

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-12">
        <Hero car={best} onOpen={onOpen} />
        <div className="grid grid-cols-2 gap-5 lg:col-span-4">
          <Stat index={0} value={String(cars.length)} label={t("dash.matches")} />
          <Stat index={1} value={mpgs.length ? String(Math.round(mpgs.reduce((s, m) => s + m, 0) / mpgs.length)) : "–"} label={t("dash.avgMpg")} />
          <Stat index={2} value={String(cars.filter((c) => !c.over_budget).length)} label={t("dash.inBudget")} />
          <Stat index={3} value={money(prefs.budget)} label={t("dash.budget")} />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <section className={panel}>
          <h3 className={panelTitle}>
            {t("dash.search")}
            <Link to="/" onClick={() => save(KEYS.step, 0)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Pencil className="size-3" aria-hidden /> {t("dash.edit")}
            </Link>
          </h3>
          <ul className="flex flex-wrap gap-2" aria-label={t("res.answers")}>
            {prefChips(prefs).map((c) => (
              <li key={c} className="rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {c}
              </li>
            ))}
          </ul>
        </section>
        <Pick
          title={priced.length ? t("dash.bestValue") : t("dash.mostEfficient")}
          note={priced.length ? t("dash.lowest") : t("dash.epaRating")}
          car={value}
          index={2}
          onOpen={onOpen}
        />
        <Saved best={best} />
      </div>

      <section className="grid gap-3">
        <h3 className="flex items-baseline justify-between text-[15px] font-bold">
          {t("dash.all")} <small className="text-xs font-medium text-muted-foreground">{t("dash.allHint")}</small>
        </h3>
        <ResultList cars={cars} />
      </section>

      {open && <Details car={open.car} color={open.color} onClose={() => setOpen(null)} />}
    </div>
  )
}
