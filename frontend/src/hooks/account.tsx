import type { User } from "@supabase/supabase-js"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { AuthDialog } from "@/components/AuthDialog"
import { KEYS, load, save } from "@/lib/storage"
import { supabase } from "@/lib/supabase"
import type { CarResult } from "@/lib/types"

export const MAX_FAVORITES = 10 // enforced by a DB trigger; mirrored here only for messaging

export interface Favorite {
  car_key: string
  car_data: CarResult
  created_at: string
}

interface Account {
  enabled: boolean
  user: User | null
  favorites: Favorite[]
  favoritesLoading: boolean
  isFavorite: (carKey: string) => boolean
  toggleFavorite: (car: CarResult) => Promise<void>
  openAuth: () => void
  signOut: () => Promise<void>
}

const AccountContext = createContext<Account | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [favoritesLoading, setFavoritesLoading] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from("favorites")
      .select("car_key, car_data, created_at")
      .order("created_at", { ascending: false })
    if (error) {
      toast.error("Couldn't load your favorites.")
      return []
    }
    setFavorites(data as Favorite[])
    return data as Favorite[]
  }, [])

  const add = useCallback(
    async (car: CarResult, current: Favorite[]) => {
      if (!supabase) return
      if (current.some((f) => f.car_key === car.car_key)) return
      const { error } = await supabase.from("favorites").insert({ car_key: car.car_key, car_data: car })
      if (error && error.code !== "23505") {
        toast.error("Couldn't save that favorite. Please try again.")
        return
      }
      await refresh()
      toast.success(
        current.length >= MAX_FAVORITES
          ? `Saved. You can keep ${MAX_FAVORITES} favorites, so your oldest one was removed.`
          : `Saved ${car.year} ${car.make} ${car.model} to favorites.`,
      )
    },
    [refresh],
  )

  // On sign-in: close the dialog, load favorites, then finish a favorite the guest clicked before signing in.
  const userId = user?.id
  useEffect(() => {
    if (!userId) {
      setFavorites([])
      return
    }
    setAuthOpen(false)
    let cancelled = false
    setFavoritesLoading(true)
    refresh().then(async (current) => {
      setFavoritesLoading(false)
      const pending = load<CarResult | null>(KEYS.pendingFavorite, null, localStorage)
      if (pending && !cancelled) {
        save(KEYS.pendingFavorite, null, localStorage)
        await add(pending, current)
      }
    })
    return () => {
      cancelled = true
    }
  }, [userId, refresh, add]) // keyed on id: token refreshes emit a new User object

  const toggleFavorite = useCallback(
    async (car: CarResult) => {
      if (!supabase) {
        toast.error("Accounts aren't configured on this deployment.")
        return
      }
      if (!user) {
        save(KEYS.pendingFavorite, car, localStorage)
        setAuthOpen(true)
        return
      }
      if (favorites.some((f) => f.car_key === car.car_key)) {
        const { error } = await supabase.from("favorites").delete().eq("car_key", car.car_key)
        if (error) toast.error("Couldn't remove that favorite.")
        await refresh()
      } else {
        await add(car, favorites)
      }
    },
    [user, favorites, refresh, add],
  )

  const value = useMemo<Account>(
    () => ({
      enabled: !!supabase,
      user,
      favorites,
      favoritesLoading,
      isFavorite: (key) => favorites.some((f) => f.car_key === key),
      toggleFavorite,
      openAuth: () => setAuthOpen(true),
      signOut: async () => {
        await supabase?.auth.signOut()
      },
    }),
    [user, favorites, favoritesLoading, toggleFavorite],
  )

  return (
    <AccountContext.Provider value={value}>
      {children}
      <AuthDialog
        open={authOpen}
        onClose={(keepPending) => {
          setAuthOpen(false)
          if (!keepPending) save(KEYS.pendingFavorite, null, localStorage)
        }}
      />
    </AccountContext.Provider>
  )
}

export function useAccount(): Account {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider")
  return ctx
}
