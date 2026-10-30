import { ArrowLeft, ArrowRight, Search, Trophy } from "lucide-react"
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"

import { BodyIcon } from "@/components/BodyIcon"
import { MultiChoice, SingleChoice } from "@/components/ChoiceGroup"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { money, t, useI18n, type Key } from "@/i18n"
import { getMakes } from "@/lib/api"
import { BUDGET_RANGE, clampBudget, loadPrefs, savePrefs } from "@/lib/preferences"
import { KEYS, load, save } from "@/lib/storage"
import {
  BODY_TYPES,
  DRIVETRAINS,
  FUEL_TYPES,
  MAX_YEAR,
  MIN_YEAR,
  PRIORITIES,
  SEAT_COUNTS,
  type Condition,
  type Drivetrain,
  type Preferences,
  type Transmission,
} from "@/lib/types"

// Catalog values keep their English API value; only the label is translated.
const label = (v: string) => t(`v.${v}` as Key)

function Brands({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [makes, setMakes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  useEffect(() => {
    getMakes().then(setMakes, () => setError("brands.error"))
  }, [])
  const shown = useMemo(
    () => (makes ?? []).filter((m) => value.includes(m) || m.toLowerCase().includes(query.trim().toLowerCase())),
    [makes, query, value],
  )
  const toggle = (m: string) => onChange(value.includes(m) ? value.filter((b) => b !== m) : [...value, m])

  return (
    <div className="grid gap-4">
      <Toggle
        variant="outline"
        pressed={value.length === 0}
        onPressedChange={() => onChange([])}
        className="h-11 justify-start rounded-xl px-4 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        {t("brands.any")}
      </Toggle>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder={t("brands.search")}
          aria-label={t("brands.search")}
          className="h-11 pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("brands.error")}
        </p>
      )}
      <div
        role="group"
        aria-label={t("brands.group")}
        className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3"
      >
        {!makes && !error && Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
        {shown.map((m, i) => (
          <Fragment key={m}>
            {m[0].toUpperCase() !== shown[i - 1]?.[0].toUpperCase() && (
              <p aria-hidden className="col-span-full px-1 pt-2 text-lg font-extrabold text-primary first:pt-0">
                {m[0].toUpperCase()}
              </p>
            )}
            <Toggle
              variant="outline"
              pressed={value.includes(m)}
              onPressedChange={() => toggle(m)}
              className="h-10 justify-start rounded-xl px-3 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {m}
            </Toggle>
          </Fragment>
        ))}
        {makes && shown.length === 0 && <p className="col-span-full text-sm text-muted-foreground">{t("brands.none")}</p>}
      </div>
      {value.length > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("brands.selected", { list: value.join(", ") })}
        </p>
      )}
    </div>
  )
}

interface Step {
  title: Key
  help?: Key
  render: (p: Preferences, set: (patch: Partial<Preferences>) => void) => ReactNode
}

const STEPS: Step[] = [
  {
    title: "brands.title",
    help: "brands.help",
    render: (p, set) => <Brands value={p.brands} onChange={(brands) => set({ brands })} />,
  },
  {
    title: "years.title",
    render: (p, set) => (
      <div className="grid gap-6 pt-4">
        <p className="text-center text-3xl font-semibold tabular-nums" aria-live="polite">
          {p.year_min} – {p.year_max}
        </p>
        <Slider
          min={MIN_YEAR}
          max={MAX_YEAR}
          step={1}
          minStepsBetweenThumbs={0}
          value={[p.year_min, p.year_max]}
          onValueChange={([year_min, year_max]) => set({ year_min, year_max })}
          thumbLabels={[t("years.oldest"), t("years.newest")]}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{MIN_YEAR}</span>
          <span>{MAX_YEAR}</span>
        </div>
      </div>
    ),
  },
  {
    title: "cond.title",
    render: (p, set) => (
      <SingleChoice<Condition>
        label={t("cond.label")}
        value={p.condition}
        onChange={(condition) => set({ condition, budget: clampBudget(p.budget, condition) })}
        options={[
          { value: "new", label: t("cond.new"), hint: t("cond.newHint") },
          { value: "used", label: t("cond.used") },
          { value: "either", label: t("cond.both"), hint: t("cond.bothHint") },
        ]}
      />
    ),
  },
  {
    title: "body.title",
    help: "wiz.anyHelp",
    render: (p, set) => (
      <MultiChoice
        label={t("body.label")}
        value={p.body_types}
        onChange={(body_types) => set({ body_types })}
        options={BODY_TYPES.map((b) => ({ value: b, label: label(b), icon: <BodyIcon type={b} /> }))}
      />
    ),
  },
  {
    title: "budget.title",
    help: "budget.help",
    render: (p, set) => {
      const r = BUDGET_RANGE[p.condition]
      return (
        <div className="grid gap-6 pt-4">
          <p className="text-center text-3xl font-semibold tabular-nums" aria-live="polite">
            {money(p.budget)}
            {p.budget >= r.max && "+"}
          </p>
          <Slider
            min={r.min}
            max={r.max}
            step={r.step}
            value={[clampBudget(p.budget, p.condition)]}
            onValueChange={([budget]) => set({ budget })}
            thumbLabels={[t("budget.thumb")]}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{money(r.min)}</span>
            <span>{money(r.max)}+</span>
          </div>
        </div>
      )
    },
  },
  {
    title: "fuel.title",
    help: "wiz.anyHelp",
    render: (p, set) => (
      <MultiChoice
        label={t("fuel.label")}
        value={p.fuel_types}
        onChange={(fuel_types) => set({ fuel_types })}
        options={FUEL_TYPES.map((f) => ({ value: f, label: label(f) }))}
      />
    ),
  },
  {
    title: "prio.title",
    help: "prio.help",
    render: (p, set) => (
      <MultiChoice
        label={t("prio.label")}
        value={p.priorities}
        onChange={(priorities) => set({ priorities })}
        options={PRIORITIES.map((x) => ({ value: x, label: label(x) }))}
      />
    ),
  },
  {
    title: "trans.title",
    render: (p, set) => (
      <SingleChoice<Transmission>
        label={t("trans.label")}
        value={p.transmission}
        onChange={(transmission) => set({ transmission })}
        options={[
          { value: "any", label: t("wiz.noPref") },
          { value: "auto", label: label("Automatic") },
          { value: "manual", label: label("Manual") },
        ]}
      />
    ),
  },
  {
    title: "drive.title",
    render: (p, set) => (
      <SingleChoice<Drivetrain>
        label={t("drive.label")}
        value={p.drivetrain}
        onChange={(drivetrain) => set({ drivetrain })}
        options={[
          { value: "any", label: t("wiz.noPref") },
          ...DRIVETRAINS.map((d) => ({ value: d, label: t(`drive.${d}`) })),
        ]}
      />
    ),
  },
  {
    title: "seats.title",
    help: "seats.help",
    render: (p, set) => (
      <MultiChoice
        label={t("seats.label")}
        value={p.seats.map(String)}
        onChange={(v) => set({ seats: v.map(Number).sort((a, b) => a - b) })}
        options={SEAT_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
        className="grid-cols-4 sm:grid-cols-7"
      />
    ),
  },
]

export default function Wizard() {
  useI18n() // re-render on language change
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<Preferences>(loadPrefs)
  const [step, setStep] = useState(() => Math.min(load<number>(KEYS.step, 0), STEPS.length - 1))
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)

  useEffect(() => savePrefs(prefs), [prefs])
  useEffect(() => {
    save(KEYS.step, step)
    if (first.current) first.current = false
    else heading.current?.focus() // announce the new question to screen readers
  }, [step])

  const set = (patch: Partial<Preferences>) => setPrefs((p) => ({ ...p, ...patch }))
  const last = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="mx-auto max-w-2xl">
      {step === 0 && (
        <Link
          to="/rankings"
          className="relative mb-6 flex items-center gap-3 overflow-hidden rounded-[22px] bg-card p-4 pl-5 transition hover:shadow-[0_12px_30px_#0000001a]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Trophy className="size-5" aria-hidden />
          </span>
          <span className="grid">
            <span className="text-sm font-bold">{t("wiz.browse")}</span>
            <span className="text-xs font-light text-muted-foreground">{t("wiz.browseSub")}</span>
          </span>
          <ArrowRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
        </Link>
      )}
      <div className="mb-6 grid gap-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            {t("wiz.question", { n: step + 1, total: STEPS.length })}
          </span>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} aria-label={t("wiz.progress")} />
      </div>

      <Card>
        <CardHeader>
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
            {t(current.title)}
          </h1>
          {current.help && <p className="text-sm text-muted-foreground">{t(current.help)}</p>}
        </CardHeader>
        <CardContent>{current.render(prefs, set)}</CardContent>
        <CardFooter className="justify-between gap-3">
          <Button variant="ghost" size="lg" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ArrowLeft aria-hidden /> {t("wiz.back")}
          </Button>
          {last ? (
            <Button size="lg" onClick={() => navigate("/results")}>
              <Search aria-hidden /> {t("wiz.find")}
            </Button>
          ) : (
            <Button size="lg" onClick={() => setStep((s) => s + 1)}>
              {t("wiz.next")} <ArrowRight aria-hidden />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
