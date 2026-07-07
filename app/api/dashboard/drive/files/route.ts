import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import type { DriveFileHit } from '@/lib/dashboardTypes'

type RpcRow = { id: string; name: string; parent_id: string | null; path: string; size: number; mime: string }

// Keyword search (not a single contiguous match): every whitespace token
// must appear somewhere in the file name OR its folder path. Uses the
// search_files_multi RPC (fully parameterized) rather than building
// PostgREST .or() filter strings out of raw user input.
// Tokens under 3 chars are matched at word starts only ("ip" matches
// "Ip Man" but not "flip") — substring ILIKE on a 2-char token can't use
// the trigram indexes and blew the 3s statement timeout; see
// docs/sql/2026-07-07_fix_drive_search_statement_timeout.sql.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const videosOnly = searchParams.get('videosOnly') !== 'false'
  if (q.length < 2) return NextResponse.json({ data: [] })

  const supabase = supabaseServer()
  const { data, error } = await supabase.rpc('search_files_multi', {
    p_query: q,
    p_videos_only: videosOnly,
    p_limit: 200,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: DriveFileHit[] = ((data || []) as RpcRow[]).map((r) => ({
    ...r,
    view_url: `https://drive.google.com/file/d/${r.id}/view`,
    preview_url: `https://drive.google.com/file/d/${r.id}/preview`,
  }))
  return NextResponse.json({ data: rows })
}
