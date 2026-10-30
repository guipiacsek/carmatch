import type { SupabaseClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// False when not configured: the wizard and results still work, accounts/favorites are disabled.
export const supabaseEnabled = Boolean(url && anonKey)

let client: Promise<SupabaseClient> | null = null

// Whether this visit needs supabase-js right away: a saved login, or a link from a confirmation/reset email.
// Everyone else loads it only when they open login or favorites.
export function needsAuthNow(): boolean {
  const fromEmail = /access_token|type=recovery|error_description/.test(location.hash)
  if (fromEmail || /[?&]code=/.test(location.search)) return true
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
  } catch {
    return false
  }
}

// supabase-js is the largest dependency, so it loads after first paint instead of in the main bundle.
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseEnabled) return Promise.resolve(null)
  client ??= import("@supabase/supabase-js").then(({ createClient }) => createClient(url!, anonKey!))
  return client
}
