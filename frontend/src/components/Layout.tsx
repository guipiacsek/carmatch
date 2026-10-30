import type { User as AuthUser } from "@supabase/supabase-js"
import { Heart, History, LogOut, Moon, Search, Sun, Trash2, Trophy } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"

import { LanguageMenu, menuItem, Popover } from "@/components/LanguageMenu"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAccount } from "@/hooks/account"
import { conversionNote, useI18n } from "@/i18n"
import { KEYS, load, save } from "@/lib/storage"
import { isDark, onSystemChange, setDark } from "@/lib/theme"
import { cn } from "@/lib/utils"

const restart = () => [KEYS.prefs, KEYS.step, KEYS.results, KEYS.knowledge].forEach((k) => save(k, null))
// First letter of the name if the account has one, else of the email
const initial = (u: AuthUser) => ((u.user_metadata?.full_name as string | undefined) || u.email || "?").charAt(0).toUpperCase()
const iconBtn = "grid size-10 place-items-center rounded-full text-muted-foreground transition hover:text-foreground"
const roundBtn = "grid size-10 place-items-center rounded-full bg-card text-foreground shadow-[0_2px_8px_#00000014] transition hover:shadow-[0_4px_14px_#0000001f]"

const SAVED_FOR = 4 * 24 * 3600 * 1000 // the server keeps a search 4 days (store.CACHE_TTL)
function lastSearchId(): string | null {
  const last = load<{ id: string; at: number } | null>(KEYS.lastSearch, null, localStorage)
  return last && Date.now() - last.at < SAVED_FOR ? last.id : null
}

function Links() {
  const { enabled } = useAccount()
  const { t } = useI18n()
  useLocation() // re-read the last search on every navigation
  const lastId = lastSearchId()
  const link = (to: string, label: string, icon: ReactNode, onClick?: () => void, end = true) => (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={({ isActive }) => cn(iconBtn, isActive && "bg-card text-foreground shadow-[0_2px_8px_#00000014]")}
    >
      {icon}
    </NavLink>
  )
  return (
    <nav aria-label="Main" className="flex gap-1">
      {link("/", t("nav.newSearch"), <Search className="size-5" aria-hidden />, restart)}
      {lastId && link(`/r/${lastId}`, t("nav.lastSearch"), <History className="size-5" aria-hidden />)}
      {link("/rankings", t("nav.rankings"), <Trophy className="size-5" aria-hidden />, undefined, false)}
      {enabled && link("/favorites", t("nav.favorites"), <Heart className="size-5" aria-hidden />)}
    </nav>
  )
}

/** Rightmost: a "Log in" pill, or the account's initial in a red circle with an email + sign-out menu. */
function Account() {
  const { enabled, user, openAuth, signOut, deleteAccount } = useAccount()
  const { t } = useI18n()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  if (!enabled) return null
  if (!user)
    return (
      <button
        type="button"
        onClick={openAuth}
        className="h-10 rounded-full bg-primary px-4 text-sm font-bold whitespace-nowrap text-primary-foreground shadow-[0_6px_18px_#d42e2e40] transition hover:brightness-110"
      >
        {t("nav.signIn")}
      </button>
    )
  return (
    <>
      <Popover
        className="grid size-10 place-items-center rounded-full bg-primary text-base font-extrabold text-primary-foreground shadow-[0_6px_18px_#d42e2e40]"
        label={t("nav.account", { email: user.email ?? "" })}
        trigger={initial(user)}
      >
        {(close) => (
          <>
            <p className="max-w-56 truncate px-3 pt-2 pb-1 text-xs text-muted-foreground">{user.email}</p>
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              onClick={() => {
                close()
                signOut()
              }}
            >
              <LogOut className="size-4" aria-hidden /> {t("nav.signOut")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={cn(menuItem, "text-destructive")}
              onClick={() => {
                close()
                setConfirming(true)
              }}
            >
              <Trash2 className="size-4" aria-hidden /> {t("nav.delete")}
            </button>
          </>
        )}
      </Popover>
      <Dialog open={confirming} onOpenChange={(o) => !deleting && setConfirming(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 grid size-12 place-items-center rounded-full bg-destructive/15 text-destructive">
              <Trash2 className="size-5" aria-hidden />
            </div>
            <DialogTitle>{t("nav.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("nav.deleteConfirm", { email: user.email ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="lg" disabled={deleting} onClick={() => setConfirming(false)}>
              {t("nav.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="lg"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true)
                await deleteAccount()
                setDeleting(false)
                setConfirming(false)
              }}
            >
              {deleting ? t("auth.wait") : t("nav.deleteYes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const wrap = "mx-auto w-full max-w-[1400px] px-4 md:px-8"
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">
        {t("nav.skip")}
      </a>

      <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background/85 backdrop-blur-md">
        <div className={cn(wrap, "flex h-16 items-center gap-1 sm:gap-3")}>
          <Link to="/" onClick={restart} title={t("nav.restart")} className="mr-1 flex items-baseline text-[26px] font-extrabold tracking-tighter sm:mr-3">
            c<span className="text-primary">.</span>
            <span className="ml-2 hidden text-lg tracking-tight sm:inline">
              Car<span className="text-primary">Match</span>
            </span>
            <span className="sr-only sm:hidden">CarMatch</span>
          </Link>
          <Links />
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
            <LanguageMenu className={cn(roundBtn, "flex w-auto gap-2 px-2.5 sm:px-3")} />
            <button
              type="button"
              className={roundBtn}
              onClick={toggleTheme}
              aria-label={dark ? t("nav.toLight") : t("nav.toDark")}
              title={dark ? t("nav.toLight") : t("nav.toDark")}
            >
              {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
            </button>
            <Account />
          </div>
        </div>
      </header>

      <main id="main" className={cn(wrap, "flex-1 pt-6 pb-10 md:pt-8")}>
        <Outlet />
      </main>
      <footer className={cn(wrap, "space-y-1 pb-24 text-[11px] text-muted-foreground")}>
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
  )
}
