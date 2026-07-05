import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

// One click sets the season on every attachment for this title.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { season } = (await request.json()) as { season?: number | string | null }
  if (season === null || season === undefined || season === '') {
    return NextResponse.json({ error: 'season required' }, { status: 400 })
  }
  const supabase = supabaseServer()
  const { error } = await supabase.from('attachments').update({ season: Number(season) }).eq('title_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
