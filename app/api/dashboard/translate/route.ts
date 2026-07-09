import { NextResponse } from 'next/server'

// Fast, current Gemini model for faithful multilingual translation.
const GEMINI_MODEL = 'gemini-flash-latest'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const TRANSLATE_SYSTEM = `You are a professional English-to-Swahili translator for a movie and series catalog. Translate the user's synopsis into natural, readable Standard Swahili (Kiswahili sanifu).

Translate the MEANING, not word-for-word. The output must read like it was originally written in Swahili by a native speaker — the way movie descriptions appear on a streaming platform. Render English idioms and expressions ("on the run", "falls for", "back from the brink", "tear apart") using their natural Swahili equivalents, never literal calques. Translate all common nouns and role words (gangster, commando, surgeon, detective) into Swahili — rule 3 applies only to actual names and titles.

STRICT RULES:
1. Output ONLY the Swahili translation - no notes, no quotes, no English, no explanations, no preamble.
2. Translate faithfully. Do NOT add, invent, remove, summarize, or change any fact, event, name, number, or detail. The translation must contain exactly the same information as the source - nothing more, nothing less.
3. Keep ALL proper nouns (people, characters, places, organizations, film titles, brands) EXACTLY as written in the source. Do not translate or respell names.
4. If the source begins with a name, your translation MUST begin with that exact same name.
5. Preserve every number, date, and the sentence order of the source.
6. If the source is empty or untranslatable, return it unchanged.

EXAMPLES:

Source: Back from the brink of death, highly skilled commando Tyler Rake takes on another dangerous mission: saving the imprisoned family of a ruthless gangster.
Output: Akiwa amenusurika kifo, Tyler Rake, komando mwenye ujuzi wa hali ya juu, anakabiliana na misheni nyingine hatari: kuokoa familia ya jambazi katili iliyofungwa gerezani.

Source: After a chance meeting in a hospital, an ardent soldier falls for a gifted surgeon. Opposing philosophies tear them apart, but fate has other plans.
Output: Baada ya kukutana kwa bahati hospitalini, askari mwenye moyo wa dhati anampenda daktari wa upasuaji mwenye kipaji. Misimamo inayopingana inawatenganisha, lakini majaliwa yana mipango mingine.

Source: Two rebels on the run through a stark desert landscape just might be able to restore order to a broken world.
Output: Waasi wawili wanaokimbizwa kupitia mandhari kame ya jangwa huenda wakaweza kurejesha utulivu katika dunia iliyoparaganyika.

Source: In 1997, detective Sarah Linden investigates a murder in Seattle.
Output: Mnamo mwaka 1997, mpelelezi Sarah Linden anachunguza mauaji jijini Seattle.`

// Gemini call happens server-side only — GEMINI_API_KEY never reaches the browser.
export async function POST(request: Request) {
  const { text } = (await request.json()) as { text?: string }
  const trimmed = (text || '').trim()
  if (!trimmed) return NextResponse.json({ error: 'no text to translate' }, { status: 400 })

  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: TRANSLATE_SYSTEM }] },
        contents: [{ parts: [{ text: trimmed }] }],
        generationConfig: { temperature: 0.2 },
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      return NextResponse.json({ error: `Gemini error: ${detail}` }, { status: 502 })
    }
    const json = await res.json()
    const parts: { text?: string }[] | undefined = json.candidates?.[0]?.content?.parts
    const result = parts?.map((p) => p.text || '').join('').trim()
    if (!result) return NextResponse.json({ error: 'translation failed: empty response' }, { status: 502 })
    return NextResponse.json({ result })
  } catch (e) {
    return NextResponse.json({ error: `translation failed: ${e}` }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
