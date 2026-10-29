import { Heart, LogIn, LogOut, Search } from "lucide-react"
import type { ReactNode } from "react"
import { Link, NavLink, Outlet } from "react-router-dom"

import { useAccount } from "@/hooks/account"
import { KEYS, save } from "@/lib/storage"
import { cn } from "@/lib/utils"

const restart = () => [KEYS.prefs, KEYS.step, KEYS.results].forEach((k) => save(k, null))
const iconBtn = "grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:text-foreground"

function Nav() {
  const { enabled, user, openAuth, signOut } = useAccount()
  const link = (to: string, label: string, icon: ReactNode, onClick?: () => void) => (
    <NavLink
      to={to}
      end
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
      {link("/", "New search", <Search className="size-5" aria-hidden />, restart)}
      {enabled && link("/favorites", "My favorites", <Heart className="size-5" aria-hidden />)}
      {enabled && (
        <button
          type="button"
          className={iconBtn}
          onClick={user ? signOut : openAuth}
          aria-label={user ? `Sign out (${user.email})` : "Sign in"}
          title={user ? `Sign out (${user.email})` : "Sign in"}
        >
          {user ? <LogOut className="size-5" aria-hidden /> : <LogIn className="size-5" aria-hidden />}
        </button>
      )}
    </>
  )
}

export function Layout() {
  return (
    <div className="min-h-svh bg-background text-foreground md:grid md:grid-cols-[72px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">
        Skip to content
      </a>

      {/* Desktop: slim left rail. Mobile: top bar with the same links. */}
      <aside className="sticky top-0 hidden h-svh flex-col items-center justify-between py-7 md:flex">
        <Link to="/" onClick={restart} title="Start a new search" className="text-[26px] font-extrabold tracking-tighter">
          c<span className="text-primary">.</span>
          <span className="sr-only">CarMatch</span>
        </Link>
        <nav aria-label="Main" className="grid gap-5">
          <Nav />
        </nav>
        <span className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase [writing-mode:vertical-rl]">
          CarMatch
        </span>
      </aside>
      <header className="flex items-center justify-between px-4 pt-4 md:hidden">
        <Link to="/" onClick={restart} title="Start a new search" className="text-xl font-extrabold tracking-tight">
          Car<span className="text-primary">Match</span>
        </Link>
        <nav aria-label="Main" className="flex gap-1">
          <Nav />
        </nav>
      </header>

      <div className="flex min-w-0 flex-col">
        <main id="main" className="w-full max-w-[1400px] flex-1 px-4 pt-6 pb-10 md:pt-8 md:pr-8 md:pl-2">
          <Outlet />
        </main>
        <footer className="space-y-1 px-4 pb-24 text-[11px] text-muted-foreground md:pl-2">
          <p>
            <strong className="font-semibold">Prices are AI estimates, not offers.</strong> Always confirm price,
            availability and specs with the seller.
          </p>
          <p>
            Vehicle data from fueleconomy.gov (EPA/DOE) and NHTSA vPIC. Photos from Wikimedia Commons contributors,
            credited on each card. "See listings" links may become affiliate links.
          </p>
        </footer>
      </div>
    </div>
  )
}
