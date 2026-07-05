import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { buildEvidenceResponse, RawFileMatch } from '@/lib/evidence'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TitleFileJoinRow = {
  match_method: string
  files: {
    id: string
    name: string
    path: string
    size: number
    mime: string
    ep_num: number | null
    md5: string | null
    parent_id: string | null
  } | null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (q && q.trim().length > 0) {
    const { data, error } = await supabase.rpc('search_files_trgm', { p_query: q, p_limit: 300 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows: RawFileMatch[] = (data || []) as RawFileMatch[]
    return NextResponse.json(buildEvidenceResponse(rows, q))
  }

  const { data: titleRow } = await supabase
    .from('titles')
    .select('raw_title, original_title')
    .eq('id', id)
    .single()

  const queryUsed = titleRow ? (titleRow.original_title || titleRow.raw_title || '') : ''

  const { data, error } = await supabase
    .from('title_files')
    .select('match_method, files(id, name, path, size, mime, ep_num, md5, parent_id)')
    .eq('title_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: RawFileMatch[] = ((data || []) as unknown as TitleFileJoinRow[])
    .filter((r): r is TitleFileJoinRow & { files: NonNullable<TitleFileJoinRow['files']> } => r.files != null)
    .map((r) => ({
      id: r.files.id,
      name: r.files.name,
      path: r.files.path,
      size: r.files.size,
      mime: r.files.mime,
      ep_num: r.files.ep_num,
      md5: r.files.md5,
      parent_id: r.files.parent_id,
      match_method: r.match_method,
    }))

  return NextResponse.json(buildEvidenceResponse(rows, queryUsed))
}
