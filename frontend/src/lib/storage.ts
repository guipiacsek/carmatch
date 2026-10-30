// sessionStorage can throw (private mode, blocked storage); the app must keep working without it.
export function load<T>(key: string, fallback: T, store: Storage = sessionStorage): T {
  try {
    const raw = store.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown, store: Storage = sessionStorage): void {
  try {
    if (value === null) store.removeItem(key)
    else store.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

export const KEYS = {
  prefs: "carmatch.prefs",
  step: "carmatch.step",
  results: "carmatch.results",
  pendingFavorite: "carmatch.pendingFavorite", // localStorage: survives the email-confirmation tab
  lastSearch: "carmatch.lastSearch", // localStorage: { id, at } of the last saved search, for the top-bar button
}
