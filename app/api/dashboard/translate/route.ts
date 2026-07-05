import { NextResponse } from 'next/server'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Frontier model on Groq for faithful multilingual translation. Easy to
// swap; alternatives: "llama-3.3-70b-versatile", "qwen/qwen3-32b".
const GROQ_MODEL = 'openai/gpt-oss-120b'

const TRANSLATE_SYSTEM = (
  'You are a professional English-to-Swahili translator for a movie and ' +
  'series catalog. Translate the user\'s synopsis into natural, readable ' +
  'Standard Swahili (Kiswahili sanifu).\n' +
  'STRICT RULES:\n' +
  '1. Output ONLY the Swahili translation - no notes, no quotes, no English, ' +
  'no explanations, no preamble.\n' +
  '2. Translate faithfully. Do NOT add, invent, remove, summarize, or change ' +
  'any fact, event, name, number, or detail. The translation must contain ' +
  'exactly the same information as the source - nothing more, nothing less.\n' +
  '3. Keep ALL proper nouns (people, characters, places, organizations, film ' +
  'titles, brands) EXACTLY as written in the source. Do not translate or ' +
  'respell names.\n' +
  '4. If the source begins with a name, your translation MUST begin with that ' +
  'exact same name.\n' +
  '5. Preserve every number, date, and the sentence order of the source.\n' +
  '6. If the source is empty or untranslatable, return it unchanged.'
)

// Groq call happens server-side only — GROQ_API_KEY never reaches the browser.
export async function POST(request: Request) {
  const { text } = (await request.json()) as { text?: string }
  const trimmed = (text || '').trim()
  if (!trimmed) return NextResponse.json({ error: 'no text to translate' }, { status: 400 })

  const key = process.env.GROQ_API_KEY
  if (!key) return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: TRANSLATE_SYSTEM },
          { role: 'user', content: trimmed },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      return NextResponse.json({ error: `Groq error: ${detail}` }, { status: 502 })
    }
    const json = await res.json()
    const result: string | undefined = json.choices?.[0]?.message?.content?.trim()
    if (!result) return NextResponse.json({ error: 'translation failed: empty response' }, { status: 502 })
    return NextResponse.json({ result })
  } catch (e) {
    return NextResponse.json({ error: `translation failed: ${e}` }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
