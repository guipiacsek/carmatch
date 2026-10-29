import { ArrowLeft, CarFront, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, Navigate, useParams } from "react-router-dom"

import { arcColor } from "@/components/CarCard"
import { ResultList } from "@/components/ResultList"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getRankings } from "@/lib/api"
import type { RankingsData } from "@/lib/types"
import { cn } from "@/lib/utils"

const monthYear = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })

// "Top 10 new SUVs under $40,000" -> "New SUVs under $40,000", where a "TOP 10" label is already shown
const short = (title: string) => title.replace(/^Top 10 (.)/, (_, c: string) => c.toUpperCase())

/** /rankings: the 10 static top-10 lists. /rankings/:slug: one list, with the app's cards, compare and favorites. */
export default function Rankings() {
  const { slug } = useParams()
  const [data, setData] = useState<RankingsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getRankings().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the rankings."))
  }, [])

  if (error) return <p role="alert">{error}</p>
  if (!data)
    return (
      <div className="grid gap-5" aria-busy>
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-[26px]" />
          ))}
        </div>
      </div>
    )

  const updated = `Updated ${monthYear(data.updated)} · Ranked by AI from EPA vehicle data · Prices are AI estimates`
  const list = slug ? data.lists.find((l) => l.slug === slug) : null
  if (slug && !list) return <Navigate to="/rankings" replace />

  if (!list)
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="text-[clamp(28px,4vw,44px)] leading-tight font-bold">Rankings</h1>
          <p className="text-sm font-light text-muted-foreground">{updated}</p>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.lists.map((l, i) => {
            const top = l.cars[0]
            return (
              <li key={l.slug}>
                <Link
                  to={`/rankings/${l.slug}`}
                  className="flex h-full flex-col overflow-hidden rounded-[26px] bg-card transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_40px_#0000001a]"
                  style={{ "--c": arcColor(i) } as React.CSSProperties}
                >
                  <div className="relative h-36 shrink-0 overflow-hidden">
                    <div aria-hidden className="absolute -top-16 -left-10 h-[200px] w-[80%] rounded-br-[200px] bg-[var(--c)]" />
                    <span className="absolute top-4 left-5 text-[13px] font-extrabold tracking-[2px] text-white">TOP 10</span>
                    {top?.image ? (
                      <img
                        src={top.image.url}
                        alt=""
                        loading="lazy"
                        className="absolute top-8 -right-6 h-24 w-44 rounded-[14px] object-cover shadow-[0_14px_24px_#0003]"
                      />
                    ) : (
                      <CarFront className="absolute top-10 right-8 size-14 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="grid gap-1 px-5 pt-2 pb-5">
                    <h2 className="text-base leading-tight font-extrabold">{short(l.title)}</h2>
                    <p className="truncate text-xs font-light text-muted-foreground">
                      #1 {top ? `${top.year} ${top.make} ${top.model}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    )

  const personalize = `/results?p=${encodeURIComponent(JSON.stringify(list.prefs))}`
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="mr-auto grid gap-1">
          <Link to="/rankings" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden /> All rankings
          </Link>
          <h1 className="text-[clamp(28px,4vw,44px)] leading-tight font-bold">{list.title}</h1>
          <p className="max-w-2xl text-sm font-light text-muted-foreground">{list.intro}</p>
        </div>
        <Button asChild className="h-14 rounded-[22px] px-6 text-base font-bold shadow-[0_10px_30px_#d42e2e40]">
          <Link to={personalize}>
            <SlidersHorizontal aria-hidden /> Personalize
          </Link>
        </Button>
      </div>
      <nav aria-label="Other rankings" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {data.lists.map((l) => (
          <Link
            key={l.slug}
            to={`/rankings/${l.slug}`}
            aria-current={l.slug === list.slug ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground",
              l.slug === list.slug && "bg-primary text-primary-foreground hover:text-primary-foreground",
            )}
          >
            {short(l.title)}
          </Link>
        ))}
      </nav>
      <ResultList key={list.slug} cars={list.cars} />
      <p className="text-xs text-muted-foreground">{updated}</p>
    </div>
  )
}
