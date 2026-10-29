import { Heart } from "lucide-react"
import { Link, NavLink, Outlet } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useAccount } from "@/hooks/account"
import { KEYS, save } from "@/lib/storage"

export function Layout() {
  const { enabled, user, openAuth, signOut } = useAccount()
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">
        Skip to content
      </a>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight"
            title="Start a new search"
            onClick={() => [KEYS.prefs, KEYS.step, KEYS.results].forEach((k) => save(k, null))}
          >
            Car<span className="text-primary">Match</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            {enabled && (
              <Button asChild variant="ghost" size="sm">
                <NavLink to="/favorites">
                  <Heart className="size-4" aria-hidden /> My favorites
                </NavLink>
              </Button>
            )}
            {enabled &&
              (user ? (
                <Button variant="outline" size="sm" onClick={signOut} title={user.email}>
                  Sign out
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={openAuth}>
                  Sign in
                </Button>
              ))}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-6 text-xs text-muted-foreground">
          <p>
            <strong>Prices are AI estimates, not offers.</strong> Always confirm price, availability and specs with the
            seller.
          </p>
          <p>
            Vehicle data from fueleconomy.gov (EPA/DOE) and NHTSA vPIC. Photos from Wikimedia Commons contributors, credited
            on each card. "See listings" links may become affiliate links.
          </p>
        </div>
      </footer>
    </div>
  )
}
