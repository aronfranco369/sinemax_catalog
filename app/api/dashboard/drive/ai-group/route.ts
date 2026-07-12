import { NextResponse } from 'next/server'
import type { AiGroupItem, AiGroupExcluded } from '@/lib/dashboardTypes'

// Same Gemini model family used for translation — server-side only so the
// API key never reaches the browser.
const GEMINI_MODEL = 'gemini-flash-latest'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

type InFile = { id: string; name: string; path: string; size: number }
type ReqBody = { isSeries?: boolean; titleName?: string; files?: InFile[] }

// The model references files by their list index (idx) rather than the long
// Drive id, so it can never mangle an id — we map idx back to the real file
// server-side. quality/dj/part follow the same conventions the curator uses
// by hand and the variant-grouping logic in AttachedFilesList.
const SYSTEM = `You are a media librarian that organizes raw Google Drive video files into a clean, standardized episode list for a movie/series catalog.

You receive a list of candidate files (index, filename, folder path, size in MB) plus whether the title is a SERIES or a MOVIE. Return a STRICT JSON object that assigns each real episode/movie file to a slot, and excludes junk.

OUTPUT JSON SHAPE (return ONLY this, no markdown, no prose):
{
  "summary": "one short sentence describing what you grouped",
  "groups": [
    { "idx": 0, "season": 1, "episode_number": 5, "part": null, "quality": "HD", "dj": "DJ Afro", "label": "Episode 5" }
  ],
  "excluded": [ { "idx": 9, "reason": "trailer/sample, not an episode" } ]
}

RULES — apply ALL of them:

1. EPISODE NUMBER (series): read it from the filename markers in priority order: S01E05 / 1x05 style, then "EP 5" / "Episode 5", else the most plausible standalone small number after ignoring resolution (480/576/720/1080/2160), codec (x264/x265/h264), and 4-digit years. For a MOVIE, set season null and episode_number 1 for every kept file.

2. SEASON (series): from S01E05 or an explicit "Season 2" / "S2" token in the name or folder path. If nothing indicates a season, use 1. Movies: null.

3. FILES SPAN FOLDERS: episodes of one series are often released weekly and live in DIFFERENT folders. Never assume one folder = one thing. Group by the episode number itself across all folders. Conversely a single folder can hold many episodes.

4. PARTS: a single episode split into sequential files ("Part A"/"Part B", "Pt 1"/"Pt 2", "CD1"/"CD2") is NOT a variant. Give both the SAME episode_number and set "part" to "A"/"B" (or "1"/"2"). Put the part in the label too (e.g. "Episode 8 Part A"). Two different parts must NEVER be treated as quality or DJ variants of each other.

5. QUALITY VARIANTS BY SIZE: the SAME episode (same season+episode+part) may appear more than once at different sizes because a smaller copy was made for low-bandwidth users. When two files clearly represent the same episode, keep BOTH: mark the noticeably LARGER one "HD" and the SMALLER one "SD". If an episode has only one file, judge its quality from a resolution token in the name (1080/2160/720 -> HD, 480/576/360 -> SD); if unknown default to "SD". NEVER invent a second file that is not in the list. If the larger/HD copy of an episode is missing, still keep the smaller/SD copy — never drop an episode just because a higher quality is absent.

6. DJ VARIANTS: this catalog re-voices films, so the DJ / voiceover artist matters and usually appears in the FOLDER PATH or filename (e.g. "DJ Afro", "DJ Junior", "Bwana Mkubwa"). Extract it into "dj". If the SAME episode exists under two different DJs, keep BOTH as separate rows with the same episode_number but different "dj" (these are DJ variants). If you cannot confidently identify a DJ, use null — do not guess a person's name.

7. LABEL: series -> "Episode N" (append " Part X" when a part exists). Movie -> the movie/title name given, or "Episode 1" if none.

8. EXCLUDE non-content: trailers, samples, "preview", bloopers, subtitles-only, images, or anything that is clearly not the actual episode/movie. Put these in "excluded" with a short reason. If in doubt that a file is real content, keep it rather than exclude it.

9. Output every kept file exactly once in "groups". Every input index must appear in exactly one of "groups" or "excluded". Sort "groups" by season, then episode_number, then part.

Be consistent and conservative. Only the JSON object — nothing else.`

function stripFences(s: string): string {
  const t = s.trim()
  if (t.startsWith('```')) return t.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim()
  return t
}

function normPart(p: unknown): string | null {
  if (p == null) return null
  const s = String(p).trim().toUpperCase()
  return s === '' || s === 'NULL' ? null : s
}

function normQuality(q: unknown): string {
  const s = String(q ?? '').trim().toUpperCase()
  return s === 'HD' ? 'HD' : 'SD'
}

export async function POST(request: Request) {
  const body = (await request.json()) as ReqBody
  const isSeries = !!body.isSeries
  const titleName = (body.titleName || '').trim()
  const files = (body.files || []).slice(0, 300)
  if (files.length === 0) return NextResponse.json({ error: 'no files to group' }, { status: 400 })

  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const lines = files.map(
    (f, i) => `[${i}] name="${f.name}" path="${f.path}" size=${f.size ? Math.round(f.size / 1048576) : 0}MB`
  )
  const userText = `TITLE: ${titleName || '(unknown)'}\nKIND: ${isSeries ? 'SERIES' : 'MOVIE'}\nFILES (${files.length}):\n${lines.join('\n')}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      return NextResponse.json({ error: `Gemini error: ${detail}` }, { status: 502 })
    }
    const json = await res.json()
    const parts: { text?: string }[] | undefined = json.candidates?.[0]?.content?.parts
    const raw = parts?.map((p) => p.text || '').join('').trim()
    if (!raw) return NextResponse.json({ error: 'AI returned an empty response' }, { status: 502 })

    let parsed: {
      summary?: string
      groups?: { idx: number; season?: number | null; episode_number?: number | null; part?: string | null; quality?: string; dj?: string | null; label?: string; note?: string }[]
      excluded?: { idx: number; reason?: string }[]
    }
    try {
      parsed = JSON.parse(stripFences(raw))
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 502 })
    }

    const groups: AiGroupItem[] = []
    for (const g of parsed.groups || []) {
      const f = files[g.idx]
      if (!f) continue
      const part = normPart(g.part)
      const label =
        (g.label && String(g.label).trim()) ||
        (isSeries
          ? `Episode ${g.episode_number ?? ''}${part ? ` Part ${part}` : ''}`.trim()
          : titleName || 'Episode 1')
      groups.push({
        file_id: f.id,
        drive_name: f.name,
        drive_path: f.path ?? null,
        size: f.size ?? null,
        season: isSeries ? (g.season ?? 1) : null,
        episode_number: g.episode_number ?? null,
        part,
        quality: normQuality(g.quality),
        dj: g.dj ? String(g.dj).trim() || null : null,
        label,
        note: g.note ? String(g.note) : null,
      })
    }

    const excluded: AiGroupExcluded[] = []
    for (const e of parsed.excluded || []) {
      const f = files[e.idx]
      if (!f) continue
      excluded.push({ file_id: f.id, drive_name: f.name, reason: e.reason ? String(e.reason) : 'excluded' })
    }

    return NextResponse.json({ summary: parsed.summary || '', groups, excluded })
  } catch (e) {
    return NextResponse.json({ error: `AI grouping failed: ${e}` }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
