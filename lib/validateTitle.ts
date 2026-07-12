// Pre-publish validation shared by the title editor (client) and the publish /
// mark-ready routes (server). Returns a list of human-readable "missing detail"
// messages; an empty list means the title is publishable.
//
// The rules encode the variant model:
//   - A MOVIE variant is a unique episode_number. Files that share a number are
//     one variant (its parts and/or quality cuts). A different DJ means a new
//     number, i.e. a new variant.
//   - A SERIES never carries per-title variants — its episode_number is just the
//     episode index and its single DJ lives on the title. Extra DJ cuts of a
//     series are separate cloned titles (the "New variant" button).
//
// DJ placement is therefore exclusive ("not all at once"): a title with more
// than one variant tags the DJ on each variant's files; a single-variant title
// (and every series) carries the DJ on the top-level title field.

export type ValTitle = {
  type: string | null
  country: string | null
  synopsis_sw: string | null
  dj: string | null
  matched_title: string | null
  raw_title: string | null
}

export type ValAtt = {
  episode_number: number | null
  dj: string | null
}

export function isSeriesType(type: string | null): boolean {
  return type === 'series' || type === 'tv'
}

/** Distinct, assigned variant numbers among a movie's attachments, in order. */
export function variantNumbers(attachments: ValAtt[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const a of attachments) {
    if (a.episode_number == null) continue
    if (!seen.has(a.episode_number)) {
      seen.add(a.episode_number)
      out.push(a.episode_number)
    }
  }
  return out
}

/**
 * A movie has variants when its files span more than one variant number. Series
 * are never multi-variant within a single title.
 */
export function hasVariants(title: ValTitle, attachments: ValAtt[]): boolean {
  if (isSeriesType(title.type)) return false
  return variantNumbers(attachments).length > 1
}

/** Country is valid when it has ≥4 letters, with 'USA' (3) as the only exception. */
export function isValidCountry(country: string | null): boolean {
  const c = (country || '').trim()
  if (!c) return false
  if (c.toUpperCase() === 'USA') return true
  return c.replace(/[^A-Za-z]/g, '').length >= 4
}

export function validateForPublish(title: ValTitle, attachments: ValAtt[]): string[] {
  const problems: string[] = []
  const series = isSeriesType(title.type)

  const name = (title.matched_title || title.raw_title || '').trim()
  if (!name) problems.push('Title name is empty.')

  if (!isValidCountry(title.country)) {
    problems.push("Country must have at least 4 letters (only 'USA' may be 3).")
  }

  if (!(title.synopsis_sw || '').trim()) {
    problems.push('Swahili description (synopsis_sw) is required.')
  }

  if (attachments.length === 0) {
    problems.push('No files are attached.')
  }

  // Every movie file needs a variant number so grouping is unambiguous.
  if (!series && attachments.some((a) => a.episode_number == null)) {
    problems.push('Every movie file needs a variant number (episode number).')
  }

  // DJ placement — exclusive by title shape.
  const multi = hasVariants(title, attachments)
  const topDj = (title.dj || '').trim()
  if (multi) {
    if (topDj) {
      problems.push('This title uses per-variant DJs — clear the top-level DJ field.')
    }
    for (const n of variantNumbers(attachments)) {
      const group = attachments.filter((a) => a.episode_number === n)
      if (!group.some((a) => (a.dj || '').trim())) {
        problems.push(`Variant #${n} has no DJ set.`)
      }
    }
  } else if (!topDj) {
    problems.push('DJ is required (set it in the top details).')
  }

  return problems
}
