import { ArrowLeft, ArrowRight, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"

import { MultiChoice, SingleChoice } from "@/components/ChoiceGroup"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { getMakes } from "@/lib/api"
import { BUDGET_RANGE, clampBudget, loadPrefs, savePrefs } from "@/lib/preferences"
import { KEYS, load, save } from "@/lib/storage"
import {
  BODY_TYPES,
  DRIVETRAINS,
  FUEL_TYPES,
  MAX_YEAR,
  MIN_YEAR,
  type Condition,
  type Drivetrain,
  type Preferences,
  type Priority,
  type Transmission,
} from "@/lib/types"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "commuting", label: "Commuting" },
  { value: "family", label: "Family" },
  { value: "performance", label: "Performance" },
  { value: "fuel_economy", label: "Fuel economy" },
  { value: "reliability", label: "Reliability" },
  { value: "towing", label: "Towing / hauling" },
  { value: "off_road", label: "Off-road" },
  { value: "luxury", label: "Luxury" },
]

function Brands({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [makes, setMakes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  useEffect(() => {
    getMakes().then(setMakes, (e: Error) => setError(e.message))
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
        No preference, show me any brand
      </Toggle>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="Search brands"
          aria-label="Search brands"
          className="h-11 pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        role="group"
        aria-label="Brands"
        className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3"
      >
        {!makes && !error && Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
        {shown.map((m) => (
          <Toggle
            key={m}
            variant="outline"
            pressed={value.includes(m)}
            onPressedChange={() => toggle(m)}
            className="h-10 justify-start rounded-xl px-3 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {m}
          </Toggle>
        ))}
        {makes && shown.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No brands match.</p>}
      </div>
      {value.length > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Selected: {value.join(", ")}
        </p>
      )}
    </div>
  )
}

interface Step {
  title: string
  help?: string
  render: (p: Preferences, set: (patch: Partial<Preferences>) => void) => ReactNode
}

const STEPS: Step[] = [
  {
    title: "Any favorite brands?",
    help: "Pick as many as you like, or skip.",
    render: (p, set) => <Brands value={p.brands} onChange={(brands) => set({ brands })} />,
  },
  {
    title: "Which model years?",
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
          thumbLabels={["Oldest model year", "Newest model year"]}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{MIN_YEAR}</span>
          <span>{MAX_YEAR}</span>
        </div>
      </div>
    ),
  },
  {
    title: "New or used?",
    render: (p, set) => (
      <SingleChoice<Condition>
        label="Condition"
        value={p.condition}
        onChange={(condition) => set({ condition, budget: clampBudget(p.budget, condition) })}
        options={[
          { value: "new", label: "New", hint: "Current model years" },
          { value: "used", label: "Used" },
          { value: "either", label: "Either" },
        ]}
      />
    ),
  },
  {
    title: "What body style?",
    help: "Choose one or more. Leave empty for any.",
    render: (p, set) => (
      <MultiChoice
        label="Body type"
        value={p.body_types}
        onChange={(body_types) => set({ body_types })}
        options={BODY_TYPES.map((b) => ({ value: b, label: b }))}
      />
    ),
  },
  {
    title: "What's your budget?",
    help: "Your maximum. We'll favor cars under it.",
    render: (p, set) => {
      const r = BUDGET_RANGE[p.condition]
      return (
        <div className="grid gap-6 pt-4">
          <p className="text-center text-3xl font-semibold tabular-nums" aria-live="polite">
            {usd.format(p.budget)}
            {p.budget >= r.max && "+"}
          </p>
          <Slider
            min={r.min}
            max={r.max}
            step={r.step}
            value={[clampBudget(p.budget, p.condition)]}
            onValueChange={([budget]) => set({ budget })}
            thumbLabels={["Maximum budget in US dollars"]}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{usd.format(r.min)}</span>
            <span>{usd.format(r.max)}+</span>
          </div>
        </div>
      )
    },
  },
  {
    title: "Which fuel types?",
    help: "Choose one or more. Leave empty for any.",
    render: (p, set) => (
      <MultiChoice
        label="Fuel type"
        value={p.fuel_types}
        onChange={(fuel_types) => set({ fuel_types })}
        options={FUEL_TYPES.map((f) => ({ value: f, label: f }))}
      />
    ),
  },
  {
    title: "What matters most?",
    help: "Pick your priorities.",
    render: (p, set) => (
      <MultiChoice
        label="Priorities"
        value={p.priorities}
        onChange={(priorities) => set({ priorities })}
        options={PRIORITY_OPTIONS}
      />
    ),
  },
  {
    title: "Transmission?",
    render: (p, set) => (
      <SingleChoice<Transmission>
        label="Transmission"
        value={p.transmission}
        onChange={(transmission) => set({ transmission })}
        options={[
          { value: "any", label: "No preference" },
          { value: "auto", label: "Automatic" },
          { value: "manual", label: "Manual" },
        ]}
      />
    ),
  },
  {
    title: "Drivetrain?",
    render: (p, set) => (
      <SingleChoice<Drivetrain>
        label="Drivetrain"
        value={p.drivetrain}
        onChange={(drivetrain) => set({ drivetrain })}
        options={[{ value: "any", label: "No preference" }, ...DRIVETRAINS.map((d) => ({ value: d, label: d }))]}
      />
    ),
  },
  {
    title: "How many seats, at least?",
    render: (p, set) => (
      <SingleChoice<string>
        label="Minimum seats"
        value={String(p.min_seats)}
        onChange={(v) => set({ min_seats: Number(v) })}
        options={["2", "4", "5", "6", "7", "8"].map((n) => ({ value: n, label: n === "2" ? "Any (2+)" : `${n}+` }))}
      />
    ),
  },
]

export default function Wizard() {
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
      <div className="mb-6 grid gap-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            Question {step + 1} of {STEPS.length}
          </span>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} aria-label="Wizard progress" />
      </div>

      <Card>
        <CardHeader>
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
            {current.title}
          </h1>
          {current.help && <p className="text-sm text-muted-foreground">{current.help}</p>}
        </CardHeader>
        <CardContent>{current.render(prefs, set)}</CardContent>
        <CardFooter className="justify-between gap-3">
          <Button variant="ghost" size="lg" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ArrowLeft aria-hidden /> Back
          </Button>
          {last ? (
            <Button size="lg" onClick={() => navigate("/results")}>
              <Search aria-hidden /> Find a car
            </Button>
          ) : (
            <Button size="lg" onClick={() => setStep((s) => s + 1)}>
              Next <ArrowRight aria-hidden />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
