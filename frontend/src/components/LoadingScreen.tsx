import { CarFront, Check } from "lucide-react"
import { useEffect, useState } from "react"

import { Progress } from "@/components/ui/progress"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"

/** Shown while a search runs. Steps advance on a clock until real progress (cars found so far) overtakes it. */
export function LoadingScreen({ found, total }: { found: number; total: number }) {
  const { t } = useI18n()
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 0.25), 250)
    return () => clearInterval(id)
  }, [])

  const steps = [
    { label: t("load.step1"), done: secs >= 1 || found > 0 },
    { label: t("load.step2"), done: found > 0 },
    { label: t("load.step3"), done: found >= total * 0.6 },
    { label: t("load.step4"), done: found >= total },
  ]
  // Eases toward 90% over ~6s (a typical search), then real progress takes over.
  const progress = Math.max(90 * (1 - Math.exp(-secs / 2.5)), (found / total) * 100)
  const current = steps.findIndex((s) => !s.done)

  return (
    <div
      className="relative grid min-h-[420px] overflow-hidden rounded-[26px] bg-card md:grid-cols-2"
      role="status"
      aria-label={t("load.label")}
    >
      <div aria-hidden className="absolute -top-20 -left-[60px] h-[300px] w-[calc(100%+60px)] rounded-br-[300px] bg-primary md:h-[calc(100%+160px)] md:w-[62%] md:rounded-br-[520px]" />
      <div className="relative flex min-h-[220px] flex-col justify-between p-7 text-white">
        <p className="text-[13px] font-extrabold tracking-[2px] uppercase">CarMatch AI</p>
        <div className="grid gap-3">
          <CarFront className="size-12 motion-safe:animate-bounce" aria-hidden />
          <h2 className="text-[clamp(26px,3vw,40px)] leading-[1.05]">
            <span className="block font-extralight uppercase">{t("load.finding")}</span>
            <span className="block font-extrabold">{t("load.yours")}</span>
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
              <span className="sr-only">{s.done ? ` ${t("load.done")}` : i === current ? ` ${t("load.now")}` : ""}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-2">
          <Progress value={progress} className="h-2" aria-label={t("load.progress")} />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {found ? t("load.found", { n: found, total }) : t("load.usually")}
          </p>
        </div>
      </div>
    </div>
  )
}
