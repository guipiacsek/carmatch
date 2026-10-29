import { Heart, LogIn, LogOut, Moon, Search, Sun, Trophy } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Link, NavLink, Outlet } from "react-router-dom"

import { LanguageMenu } from "@/components/LanguageMenu"
import { useAccount } from "@/hooks/account"
import { conversionNote, useI18n } from "@/i18n"
import { KEYS, save } from "@/lib/storage"
import { isDark, onSystemChange, setDark } from "@/lib/theme"
import { cn } from "@/lib/utils"

const restart = () => [KEYS.prefs, KEYS.step, KEYS.results].forEach((k) => save(k, null))
const iconBtn = "grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:text-foreground"

function Nav({ dark, onTheme, side }: { dark: boolean; onTheme: () => void; side: "right" | "bottom" }) {
  const { enabled, user, openAuth, signOut } = useAccount()
  const { t } = useI18n()
  const link = (to: string, label: string, icon: ReactNode, onClick?: () => void, end = true) => (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={({ isActive }) => cn(iconBtn, isActive && "bg-card text-foreground shadow-[0_4px_14px_#0000001a]")}
    >
      {icon}
    </NavLink>
  )
  return (
    <>
      {link("/", t("nav.newSearch"), <Search className="size-5" aria-hidden />, restart)}
      {link("/rankings", t("nav.rankings"), <Trophy className="size-5" aria-hidden />, undefined, false)}
      {enabled && link("/favorites", t("nav.favorites"), <Heart className="size-5" aria-hidden />)}
      {enabled && (
        <button
          type="button"
          className={iconBtn}
          onClick={user ? signOut : openAuth}
          aria-label={user ? t("nav.signOut", { email: user.email ?? "" }) : t("nav.signIn")}
          title={user ? t("nav.signOut", { email: user.email ?? "" }) : t("nav.signIn")}
        >
          {user ? <LogOut className="size-5" aria-hidden /> : <LogIn className="size-5" aria-hidden />}
        </button>
      )}
      <button
        type="button"
        className={iconBtn}
        onClick={onTheme}
        aria-label={dark ? t("nav.toLight") : t("nav.toDark")}
        title={dark ? t("nav.toLight") : t("nav.toDark")}
      >
        {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
      </button>
      <LanguageMenu className={iconBtn} side={side} />
    </>
  )
}

export function Layout() {
  const { t } = useI18n()
  const note = conversionNote()
  const [dark, setDarkState] = useState(isDark)
  useEffect(() => onSystemChange(() => setDarkState(isDark())), []) // keep the icon right when the OS theme flips
  const toggleTheme = () => {
    setDark(!dark)
    setDarkState(!dark)
  }
  return (
    <div className="min-h-svh bg-background text-foreground md:grid md:grid-cols-[72px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">
        {t("nav.skip")}
      </a>

      {/* Desktop: slim left rail. Mobile: top bar with the same links. */}
      <aside className="sticky top-0 z-10 hidden h-svh flex-col items-center justify-between py-7 md:flex">
        <Link to="/" onClick={restart} title={t("nav.restart")} className="text-[26px] font-extrabold tracking-tighter">
          c<span className="text-primary">.</span>
          <span className="sr-only">CarMatch</span>
        </Link>
        <nav aria-label="Main" className="grid gap-5">
          <Nav dark={dark} onTheme={toggleTheme} side="right" />
        </nav>
        <span className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase [writing-mode:vertical-rl]">
          CarMatch
        </span>
      </aside>
      <header className="flex items-center justify-between px-4 pt-4 md:hidden">
        <Link to="/" onClick={restart} title={t("nav.restart")} className="text-xl font-extrabold tracking-tight">
          Car<span className="text-primary">Match</span>
        </Link>
        <nav aria-label="Main" className="flex gap-1">
          <Nav dark={dark} onTheme={toggleTheme} side="bottom" />
        </nav>
      </header>

      <div className="flex min-w-0 flex-col">
        <main id="main" className="w-full max-w-[1400px] flex-1 px-4 pt-6 pb-10 md:pt-8 md:pr-8 md:pl-2">
          <Outlet />
        </main>
        <footer className="space-y-1 px-4 pb-24 text-[11px] text-muted-foreground md:pl-2">
          <p>
            <strong className="font-semibold">{t("footer.estimates")}</strong> {t("footer.confirm")}
            {note && ` ${note}`}
          </p>
          <p>
            {t("footer.data")}{" "}
            <a href="/best" className="underline underline-offset-2">
              {t("footer.guides")}
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}
