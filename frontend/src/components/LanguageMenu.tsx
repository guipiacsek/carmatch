import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { LANGS, useI18n, type Lang } from "@/i18n"
import { cn } from "@/lib/utils"

// Inline SVG flags: emoji flags show as plain letters on Windows.
function Flag({ lang, className }: { lang: Lang; className?: string }) {
  const box = cn("h-3.5 w-5 shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_#0000001f]", className)
  switch (lang) {
    case "en":
      return (
        <svg viewBox="0 0 20 14" className={box} aria-hidden>
          <rect width="20" height="14" fill="#fff" />
          {[0, 2, 4, 6, 8, 10, 12].map((i) => (
            <rect key={i} y={(i * 14) / 13} width="20" height={14 / 13} fill="#b22234" />
          ))}
          <rect width="8" height={(14 * 7) / 13} fill="#3c3b6e" />
        </svg>
      )
    case "pt-BR":
      return (
        <svg viewBox="0 0 20 14" className={box} aria-hidden>
          <rect width="20" height="14" fill="#009c3b" />
          <path d="M10 1.6 18.2 7 10 12.4 1.8 7z" fill="#ffdf00" />
          <circle cx="10" cy="7" r="3.2" fill="#002776" />
        </svg>
      )
    case "es":
      return (
        <svg viewBox="0 0 20 14" className={box} aria-hidden>
          <rect width="20" height="14" fill="#aa151b" />
          <rect y="3.5" width="20" height="7" fill="#f1bf00" />
        </svg>
      )
    case "ja":
      return (
        <svg viewBox="0 0 20 14" className={box} aria-hidden>
          <rect width="20" height="14" fill="#fff" />
          <circle cx="10" cy="7" r="4.2" fill="#bc002d" />
        </svg>
      )
  }
}

/** A nav button that opens a small menu; closes on outside click or Escape. */
export function Popover({
  className,
  label,
  trigger,
  children,
}: {
  className: string
  label: string
  trigger: ReactNode
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", close)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", close)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className={className}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute top-full right-0 z-50 mt-2 grid min-w-40 gap-0.5 rounded-2xl bg-card p-1.5 shadow-[0_16px_40px_#00000026]"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export const menuItem = "flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-muted"

/** Flag button next to the theme toggle; opens a list of the 4 languages. */
export function LanguageMenu({ className }: { className: string }) {
  const { lang, setLang, t } = useI18n()
  return (
    <Popover className={className} label={`${t("nav.language")}: ${LANGS[lang].name}`} trigger={
        <>
          <Flag lang={lang} />
          <span className="hidden text-xs font-bold sm:inline">{lang.split("-")[0].toUpperCase()}</span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" aria-hidden />
        </>
      }
    >
      {(close) =>
        (Object.keys(LANGS) as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            role="menuitemradio"
            aria-checked={l === lang}
            lang={l}
            onClick={() => {
              setLang(l)
              close()
            }}
            className={cn(menuItem, l === lang && "bg-muted font-bold")}
          >
            <Flag lang={l} />
            {LANGS[l].name}
          </button>
        ))
      }
    </Popover>
  )
}
