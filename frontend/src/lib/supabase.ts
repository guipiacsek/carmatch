import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Null when not configured: the wizard and results still work, accounts/favorites are disabled.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
