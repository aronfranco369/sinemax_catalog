// Pre-publish validation shared by the title editor (client) and the publish /
// mark-ready routes (server). Returns a list of human-readable "missing detail"
// messages; an empty list means the title is publishable.
//
// The rules encode the variant model:
//   - A MOVIE variant is a unique episode_number. Files that share a number are
//     one variant (its parts and/or quality cuts). A different DJ means a new
//     number, i.e. a new variant.
//   - A SERIES uses episode_number as the episode index. Its DJ may live on the
//     top-level title (one DJ for the whole show) OR on the individual episodes
//     (multiple DJs, tagged in the attachments panel). Each episode just needs
//     an effective DJ — its own tag, or the top-level DJ as a fallback — and the
//     publisher splits the episodes into one media per DJ.
//
// DJ placement for a MOVIE is exclusive: a multi-variant movie tags the DJ on
// each variant's files, a single-variant movie carries it on the top field. A
// SERIES is more permissive — top DJ, per-episode DJs, or both (top as default).

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

  // DJ placement.
  const multi = hasVariants(title, attachments)
  const topDj = (title.dj || '').trim()
  if (series) {
    // A series' DJ can live on the top field (one DJ for the whole show) or be
    // tagged per-episode in the attachments panel (multiple DJs). Every episode
    // just needs an effective DJ — its own tag, or the top-level DJ as fallback
    // — so only flag when the top DJ is empty and some episode is still
    // untagged, and point at the episodes, not the top field.
    if (!topDj && attachments.length > 0) {
      const untagged = attachments.filter((a) => !(a.dj || '').trim()).length
      if (untagged === attachments.length) {
        problems.push('DJ is required — set it in the top details, or tag each episode with its DJ in the attachments panel.')
      } else if (untagged > 0) {
        problems.push(`${untagged} episode(s) have no DJ — tag every episode in the attachments panel, or set a top-level DJ as the fallback.`)
      }
    } else if (!topDj) {
      // No files yet: a single-DJ series still needs a DJ somewhere.
      problems.push('DJ is required — set it in the top details, or tag each episode with its DJ.')
    }
  } else if (multi) {
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
