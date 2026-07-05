import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import type { CatalogRow } from '@/lib/dashboardTypes'

// Server-side filter + sort + LIMIT 300, all in one round trip via the
// catalog_list RPC (see migration add_curation_dashboard_schema). Sorting
// is resolved inside the SQL function against an allow-list of known sort
// keys, so nothing here ever string-builds an ORDER BY clause.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const supabase = supabaseServer()

  const { data, error } = await supabase.rpc('catalog_list', {
    p_status: searchParams.get('status') || null,
    p_tier: searchParams.get('tier') || null,
    p_type: searchParams.get('type') || null,
    p_catalog: searchParams.get('catalog') || null,
    p_q: searchParams.get('q') || null,
    p_sort: searchParams.get('sort') || null,
    p_limit: 300,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as CatalogRow[]
  const count = rows.length > 0 ? rows[0].total_count : 0
  return NextResponse.json({ count, rows })
}
