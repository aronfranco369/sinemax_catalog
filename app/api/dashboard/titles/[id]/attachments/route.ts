import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { extractEpisodeNumber } from '@/lib/episodeParse'

type AttachBody = {
  files: { file_id: string; name: string }[]
  season?: number | null
}

// Attach one or more Drive files to a title (single or bulk). Episode
// number comes from the filename (extractEpisodeNumber), not attach order,
// so files dropped in as 5,1,6 auto-arrange to 1,5,6 once reloaded — same
// behavior as catalog.py's attach_rows/meta_for/next_ep.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const titleId = Number(id)
  const body = (await request.json()) as AttachBody
  const files = body.files || []
  const season = body.season ?? null
  if (files.length === 0) return NextResponse.json({ error: 'files required' }, { status: 400 })

  const supabase = supabaseServer()
  const { data: title, error: tErr } = await supabase
    .from('titles')
    .select('type, matched_title, raw_title')
    .eq('id', titleId)
    .single()
  if (tErr || !title) return NextResponse.json({ error: 'title not found' }, { status: 404 })
  const isSeries = title.type === 'series' || title.type === 'tv'

  const { data: existing, error: eErr } = await supabase
    .from('attachments')
    .select('episode_number')
    .eq('title_id', titleId)
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })
  const maxEp = (existing || []).reduce(
    (m, r) => (r.episode_number != null && r.episode_number > m ? r.episode_number : m),
    0
  )
  let fallback = maxEp + 1

  const rows = files.map((f) => {
    let episodeNumber: number
    let label: string
    if (isSeries) {
      const ext = extractEpisodeNumber(f.name)
      if (ext == null) {
        episodeNumber = fallback
        label = `Episode ${fallback}`
        fallback += 1
      } else {
        episodeNumber = ext
        label = `Episode ${ext}`
      }
    } else {
      episodeNumber = fallback
      label = title.matched_title || title.raw_title || ''
      fallback += 1
    }
    return {
      title_id: titleId,
      file_id: f.file_id,
      season: isSeries ? season : null,
      episode_number: episodeNumber,
      label,
    }
  })

  const { data, error } = await supabase
    .from('attachments')
    .upsert(rows, { onConflict: 'title_id,file_id' })
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attached: data?.length ?? 0 })
}

// Detach every file from a title at once, so the attachments can be built up
// from scratch without removing them one by one.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = supabaseServer()
  const { error } = await supabase.from('attachments').delete().eq('title_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
