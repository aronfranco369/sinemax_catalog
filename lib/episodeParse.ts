// Tokens in a filename that look like numbers but are NOT episode numbers:
// resolutions (720p/1080p/2160), codecs (x264/x265) and 4-digit years.
const EP_NOISE = /\b(?:480|576|720|1080|2160)p?\b|\bx?26[45]\b|\b(?:19|20)\d{2}\b/gi

/**
 * Best-effort episode number guessed from a Drive filename.
 *
 * Tries explicit markers first (S01E05, EP07, Episode 7); otherwise strips
 * resolution/codec/year noise and takes the last small number that remains.
 * This is only a prefill — the curator verifies it in the editor.
 */
export function extractEpisodeNumber(name: string | null | undefined): number | null {
  if (!name) return null
  const base = name.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '')

  let m = base.match(/s\d{1,2}[ ._-]*e(\d{1,3})/)
  if (m) return parseInt(m[1], 10)

  m = base.match(/\bep(?:isode)?[ ._-]*(\d{1,3})/)
  if (m) return parseInt(m[1], 10)

  const cleaned = base.replace(/s\d{1,2}\b/g, ' ').replace(EP_NOISE, ' ')
  const nums = cleaned.match(/\d{1,3}/g)
  return nums && nums.length > 0 ? parseInt(nums[nums.length - 1], 10) : null
}

/**
 * Part marker guessed from a filename/label, e.g. 'Episode 8 Part A' -> 'A',
 * 'Ep 8 Pt2' -> '2' (else null). Normalised to upper-case.
 *
 * A single episode split across sequential files ("Part A", "Part B") shares
 * one episode number but is NOT an alternate cut of the same content, so the
 * part marker keeps those files from being mistaken for DJ/quality variants.
 */
export function extractPart(name: string | null | undefined): string | null {
  if (!name) return null
  const base = name.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '')
  const m = base.match(/\bp(?:ar)?t[ ._-]*([a-d]|\d{1,2})\b/)
  return m ? m[1].toUpperCase() : null
}

/**
 * Episode number embedded in a label like 'Episode 5' -> 5 (else null).
 *
 * The label is the authoritative ordering key for a series: episodes are
 * sorted/numbered by the number it carries.
 */
export function parseLabelEp(label: string | null | undefined): number | null {
  if (!label) return null
  const m = label.match(/(\d{1,4})/)
  return m ? parseInt(m[1], 10) : null
}
