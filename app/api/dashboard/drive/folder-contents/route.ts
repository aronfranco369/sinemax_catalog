import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import type { DriveFileHit, FolderHit } from '@/lib/dashboardTypes'

type RawFile = { id: string; name: string; path: string; size: number; mime: string }
type ChildRow = { child_path: string; child_name: string; n_files: number }

function withUrls(rows: RawFile[]): DriveFileHit[] {
  return rows.map((r) => ({
    ...r,
    parent_id: null,
    view_url: `https://drive.google.com/file/d/${r.id}/view`,
    preview_url: `https://drive.google.com/file/d/${r.id}/preview`,
  }))
}

// Direct children of a folder (subfolders + files) for the inline tree
// browser, or — when recursive=true — every file anywhere under the given
// prefix, for "attach this whole folder" (including nested season
// subfolders). Folder identity here is the path prefix itself; see
// folder_children/folder_path in the migration for how that's derived.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const prefix = searchParams.get('path') || ''
  const videosOnly = searchParams.get('videosOnly') !== 'false'
  const recursive = searchParams.get('recursive') === 'true'
  if (!prefix) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const supabase = supabaseServer()

  if (recursive) {
    let query = supabase
      .from('files')
      .select('id, name, path, size, mime')
      .like('path', `${prefix}/%`)
      .order('path', { ascending: true })
      .order('name', { ascending: true })
    if (videosOnly) query = query.ilike('mime', 'video/%')
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ files: withUrls((data || []) as RawFile[]) })
  }

  let fileQuery = supabase
    .from('files')
    .select('id, name, path, size, mime')
    .eq('folder_path', prefix)
    .order('name', { ascending: true })
  if (videosOnly) fileQuery = fileQuery.ilike('mime', 'video/%')

  const [{ data: files, error: fErr }, { data: children, error: cErr }] = await Promise.all([
    fileQuery,
    supabase.rpc('folder_children', { p_prefix: prefix, p_videos_only: videosOnly }),
  ])
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const folders: FolderHit[] = ((children || []) as ChildRow[]).map((c) => ({
    id: c.child_path,
    name: c.child_name,
    path: c.child_path,
    n_files: c.n_files,
  }))

  return NextResponse.json({ folders, files: withUrls((files || []) as RawFile[]) })
}
