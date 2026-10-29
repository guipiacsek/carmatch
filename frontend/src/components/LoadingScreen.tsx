import { CarFront, Check } from "lucide-react"
import { useEffect, useState } from "react"

import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

/** Shown while a search runs. Steps advance on a clock until real progress (cars found so far) overtakes it. */
export function LoadingScreen({ found, total }: { found: number; total: number }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 0.25), 250)
    return () => clearInterval(id)
  }, [])

  const steps = [
    { label: "Filtering 39,000+ EPA vehicles", done: secs >= 1 || found > 0 },
    { label: "AI is ranking your best fits", done: found > 0 },
    { label: "Estimating prices and writing reasons", done: found >= total * 0.6 },
    { label: "Lining up photos", done: found >= total },
  ]
  // Eases toward 90% over ~6s (a typical search), then real progress takes over.
  const progress = Math.max(90 * (1 - Math.exp(-secs / 2.5)), (found / total) * 100)
  const current = steps.findIndex((s) => !s.done)

  return (
    <div
      className="relative grid min-h-[420px] overflow-hidden rounded-[26px] bg-card md:grid-cols-2"
      role="status"
      aria-label="Finding your matches"
    >
      <div aria-hidden className="absolute -top-20 -left-[60px] h-[300px] w-[calc(100%+60px)] rounded-br-[300px] bg-primary md:h-[calc(100%+160px)] md:w-[62%] md:rounded-br-[520px]" />
      <div className="relative flex min-h-[220px] flex-col justify-between p-7 text-white">
        <p className="text-[13px] font-extrabold tracking-[2px] uppercase">CarMatch AI</p>
        <div className="grid gap-3">
          <CarFront className="size-12 motion-safe:animate-bounce" aria-hidden />
          <h2 className="text-[clamp(26px,3vw,40px)] leading-[1.05]">
            <span className="block font-extralight uppercase">Finding</span>
            <span className="block font-extrabold">your matches</span>
          </h2>
        </div>
      </div>
      <div className="relative grid content-center gap-6 p-7">
        <ol className="grid gap-4">
          {steps.map((s, i) => (
            <li key={s.label} className={cn("flex items-center gap-3 text-sm font-semibold", !s.done && i !== current && "text-muted-foreground")}>
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs",
                  s.done && "bg-primary text-primary-foreground",
                  i === current && "ring-2 ring-primary motion-safe:animate-pulse",
                )}
              >
                {s.done ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              {s.label}
              <span className="sr-only">{s.done ? " (done)" : i === current ? " (in progress)" : ""}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-2">
          <Progress value={progress} className="h-2" aria-label="Search progress" />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {found ? `${found} of ${total} cars found` : "Usually takes about 5 seconds"}
          </p>
        </div>
      </div>
    </div>
  )
}
