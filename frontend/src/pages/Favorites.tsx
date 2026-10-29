import { Link } from "react-router-dom"

import { CarCard } from "@/components/CarCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MAX_FAVORITES, useAccount } from "@/hooks/account"

export default function Favorites() {
  const { enabled, user, favorites, favoritesLoading, openAuth } = useAccount()

  let body
  if (!enabled) body = <p>Accounts aren't configured on this deployment.</p>
  else if (!user)
    body = (
      <>
        <p>Sign in to see the cars you've saved.</p>
        <Button onClick={openAuth}>Sign in</Button>
      </>
    )
  else if (favoritesLoading && favorites.length === 0) body = <p>Loading your favorites…</p>
  else if (favorites.length === 0)
    body = (
      <>
        <p>No favorites yet. Tap the heart on any result to save it here.</p>
        <Button asChild>
          <Link to="/">Find a car</Link>
        </Button>
      </>
    )

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My favorites</h1>
        <p className="text-sm text-muted-foreground">
          Up to {MAX_FAVORITES} cars. Saving more replaces your oldest one.
        </p>
      </div>
      {body ? (
        <Card>
          <CardContent className="grid justify-items-start gap-4">{body}</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((f) => (
            <li key={f.car_key} className="flex [&>*]:w-full">
              <CarCard car={f.car_data} showRank={false} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
