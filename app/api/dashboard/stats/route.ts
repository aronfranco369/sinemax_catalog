import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export async function GET() {
  const supabase = supabaseServer()
  const [totalRes, statusRes, readyRes, publishedRes, attRes] = await Promise.all([
    supabase.from('titles').select('*', { count: 'exact', head: true }),
    supabase.from('titles').select('status'),
    supabase.from('titles').select('*', { count: 'exact', head: true }).eq('catalog_status', 'ready'),
    supabase.from('titles').select('*', { count: 'exact', head: true }).eq('catalog_status', 'published'),
    supabase.from('attachments').select('title_id'),
  ])

  const err = totalRes.error || statusRes.error || readyRes.error || publishedRes.error || attRes.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const byStatus: Record<string, number> = {}
  for (const row of statusRes.data || []) {
    const key = row.status || '(none)'
    byStatus[key] = (byStatus[key] || 0) + 1
  }
  const attachedTitles = new Set((attRes.data || []).map((r) => r.title_id))

  return NextResponse.json({
    total: totalRes.count || 0,
    by_status: byStatus,
    ready: readyRes.count || 0,
    published: publishedRes.count || 0,
    attached: attachedTitles.size,
  })
}
