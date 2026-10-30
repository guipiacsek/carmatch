import type { User } from "@supabase/supabase-js";
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { t } from "@/i18n";

import { deleteAccount } from "@/lib/api";
import { KEYS, load, save } from "@/lib/storage";
import { getSupabase, supabaseEnabled } from "@/lib/supabase";
import type { CarResult } from "@/lib/types";

export const MAX_FAVORITES = 10; // enforced by a DB trigger; mirrored here only for messaging

export interface Favorite {
  car_key: string;
  car_data: CarResult;
  created_at: string;
}

interface Account {
  enabled: boolean;
  user: User | null;
  favorites: Favorite[];
  favoritesLoading: boolean;
  isFavorite: (carKey: string) => boolean;
  toggleFavorite: (car: CarResult) => Promise<void>;
  openAuth: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AccountContext = createContext<Account | null>(null);
const AuthDialog = lazy(() =>
  import("@/components/AuthDialog").then((m) => ({ default: m.AuthDialog })),
);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let live = true;
    getSupabase().then((supabase) => {
      if (!supabase || !live) return;
      supabase.auth
        .getSession()
        .then(({ data }) => setUser(data.session?.user ?? null));
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        setUser(session?.user ?? null);
        if (event === "PASSWORD_RECOVERY") setRecovering(true); // arrived from the reset-password email
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const supabase = await getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("favorites")
      .select("car_key, car_data, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(t("acc.loadFail"));
      return [];
    }
    setFavorites(data as Favorite[]);
    return data as Favorite[];
  }, []);

  const add = useCallback(
    async (car: CarResult, current: Favorite[]) => {
      const supabase = await getSupabase();
      if (!supabase) return;
      if (current.some((f) => f.car_key === car.car_key)) return;
      const { error } = await supabase
        .from("favorites")
        .insert({ car_key: car.car_key, car_data: car });
      if (error && error.code !== "23505") {
        toast.error(t("acc.saveFail"));
        return;
      }
      await refresh();
      toast.success(
        current.length >= MAX_FAVORITES
          ? t("acc.savedMax", { max: MAX_FAVORITES })
          : t("acc.saved", { name: `${car.year} ${car.make} ${car.model}` }),
      );
    },
    [refresh],
  );

  // On sign-in: close the dialog, load favorites, then finish a favorite the guest clicked before signing in.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setFavorites([]);
      return;
    }
    setAuthOpen(false);
    let cancelled = false;
    setFavoritesLoading(true);
    refresh().then(async (current) => {
      setFavoritesLoading(false);
      const pending = load<CarResult | null>(
        KEYS.pendingFavorite,
        null,
        localStorage,
      );
      if (pending && !cancelled) {
        save(KEYS.pendingFavorite, null, localStorage);
        await add(pending, current);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refresh, add]); // keyed on id: token refreshes emit a new User object

  const toggleFavorite = useCallback(
    async (car: CarResult) => {
      const supabase = await getSupabase();
      if (!supabase) {
        toast.error(t("fav.disabled"));
        return;
      }
      if (!user) {
        save(KEYS.pendingFavorite, car, localStorage);
        setAuthOpen(true);
        return;
      }
      if (favorites.some((f) => f.car_key === car.car_key)) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("car_key", car.car_key);
        if (error) toast.error(t("acc.removeFail"));
        await refresh();
      } else {
        await add(car, favorites);
      }
    },
    [user, favorites, refresh, add],
  );

  const value = useMemo<Account>(
    () => ({
      enabled: supabaseEnabled,
      user,
      favorites,
      favoritesLoading,
      isFavorite: (key) => favorites.some((f) => f.car_key === key),
      toggleFavorite,
      openAuth: () => setAuthOpen(true),
      signOut: async () => {
        await (await getSupabase())?.auth.signOut();
      },
      deleteAccount: async () => {
        try {
          await deleteAccount();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t("acc.deleteFail"));
          return;
        }
        await (await getSupabase())?.auth.signOut({ scope: "local" }); // the session no longer exists server-side
        toast.success(t("acc.deleted"));
      },
    }),
    [user, favorites, favoritesLoading, toggleFavorite],
  );

  return (
    <AccountContext.Provider value={value}>
      {children}
      {(authOpen || recovering) && ( // lazy: the dialog and its form code load the first time someone signs in
        <Suspense fallback={null}>
          <AuthDialog
            open={authOpen || recovering}
            recovery={recovering}
            onClose={(keepPending) => {
              setAuthOpen(false);
              setRecovering(false);
              if (!keepPending) save(KEYS.pendingFavorite, null, localStorage);
            }}
          />
        </Suspense>
      )}
    </AccountContext.Provider>
  );
}

export function useAccount(): Account {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}
