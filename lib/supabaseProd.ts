import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Client for the PRODUCTION app database (the one the Flutter app reads:
// `media` + `files` tables). This is a different Supabase project from the
// curation dashboard's own DB, so it needs its own URL + key.
//
// Writes here must use a service-role key: `media`/`files` have RLS enabled
// with read-only anon policies, and this key must never reach the browser —
// it is only ever used from server-side API routes.
const PROD_URL = process.env.SUPABASE_PROD_URL || 'https://nawgqawbwmfvhywfvoke.supabase.co'
const PROD_SERVICE_KEY = process.env.SUPABASE_PROD_SERVICE_ROLE_KEY || ''

/** True when a service key is configured, i.e. publishing is possible. */
export function prodConfigured(): boolean {
  return Boolean(PROD_SERVICE_KEY)
}

/**
 * Returns a service-role client for the production app DB, or null when the
 * SUPABASE_PROD_SERVICE_ROLE_KEY env var is not set (so callers can return a
 * clear "not configured" error instead of a cryptic auth failure).
 */
export function supabaseProd(): SupabaseClient | null {
  if (!PROD_SERVICE_KEY) return null
  return createClient(PROD_URL, PROD_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
