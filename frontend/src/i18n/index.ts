import { useSyncExternalStore } from "react"

import { en, type Key } from "./en"
import { es } from "./es"
import { ja } from "./ja"
import { ptBR } from "./pt-BR"

// Each UI language shows prices in one currency: US-market prices, converted at the daily rate.
export const LANGS = {
  en: { name: "English", locale: "en-US", currency: "USD", dict: en },
  "pt-BR": { name: "Português", locale: "pt-BR", currency: "BRL", dict: ptBR },
  es: { name: "Español", locale: "es-MX", currency: "MXN", dict: es },
  ja: { name: "日本語", locale: "ja-JP", currency: "JPY", dict: ja },
} as const
export type Lang = keyof typeof LANGS
export const isLang = (v: unknown): v is Lang => typeof v === "string" && v in LANGS

export interface Rates {
  date: string | null
  rates: Partial<Record<string, number>>
}

const KEY = "carmatch.lang"
let lang: Lang = "en"
let rates: Rates | null = null
let version = 0 // bumps on any change, so subscribed components re-render
const listeners = new Set<() => void>()

try {
  const saved = localStorage.getItem(KEY)
  if (isLang(saved)) lang = saved
} catch {
  /* storage unavailable: English */
}
document.documentElement.lang = lang

function changed() {
  version++
  listeners.forEach((l) => l())
}

export const getLang = () => lang

export function setLang(next: Lang): void {
  lang = next
  document.documentElement.lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* the choice lasts for this page only */
  }
  changed()
}

export function setRates(next: Rates): void {
  rates = next
  changed()
}

/** Translate a key for the current language; `{name}` placeholders are filled from `vars`. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const text: string = LANGS[lang].dict[key] ?? en[key]
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text
}

/** A US-dollar amount in the current language's currency, rounded so converted prices don't look falsely exact. */
export function money(usd: number): string {
  const { locale, currency } = LANGS[lang]
  const rate = currency === "USD" ? 1 : rates?.rates[currency]
  if (!rate) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(usd)
  const step = currency === "USD" ? 1 : currency === "JPY" ? 10_000 : 100
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(
    Math.round((usd * rate) / step) * step,
  )
}

/** Shown under converted prices: "US prices converted at the 2026-10-29 rate", or null when showing USD. */
export function conversionNote(): string | null {
  const { currency } = LANGS[lang]
  const date = rates?.date
  return currency !== "USD" && date && rates?.rates[currency] ? t("currency.note", { currency, date }) : null
}

/** Re-renders the component when the language or exchange rates change. */
export function useI18n() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  return { lang, setLang, t, money }
}

export type { Key }
