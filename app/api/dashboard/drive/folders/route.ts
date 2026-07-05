import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import type { FolderHit } from '@/lib/dashboardTypes'

type RpcRow = { folder_path: string; n_files: number }

// "Attach a whole folder at once" search mode. Folders are derived from
// files.folder_path (no folders table was migrated from the old Drive
// inventory), grouped with a video-file count via the search_folders_trgm
// RPC (PostgREST can't express a grouped count directly).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const videosOnly = searchParams.get('videosOnly') !== 'false'
  if (q.length < 2) return NextResponse.json({ data: [] })

  const supabase = supabaseServer()
  const { data, error } = await supabase.rpc('search_folders_trgm', {
    p_query: q,
    p_videos_only: videosOnly,
    p_limit: 200,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: FolderHit[] = ((data || []) as RpcRow[]).map((r) => ({
    id: r.folder_path,
    name: r.folder_path.split('/').pop() || r.folder_path,
    path: r.folder_path,
    n_files: r.n_files,
  }))
  return NextResponse.json({ data: rows })
}
