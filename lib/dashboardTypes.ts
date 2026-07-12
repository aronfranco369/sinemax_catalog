export type Candidate = {
  matched_title: string
  year: string
  type: string
  country: string
  genres: string
  synopsis: string
  poster_url: string
  tmdb_id: number
  score: number
}

export type Title = {
  id: number
  raw_title: string | null
  original_title: string | null
  norm_key: string | null
  tier: string | null
  status: string | null
  type: string | null
  matched_title: string | null
  year: string | null
  country: string | null
  genres: string | null
  synopsis: string | null
  synopsis_sw: string | null
  poster_url: string | null
  tmdb_id: number | null
  score: number | null
  candidates_json: Candidate[] | null
  dj: string | null
  tags: string | null
  removed_text: string | null
  catalog_status: string | null
  updated_at: string | null
}

export type AttachmentRow = {
  id: number
  season: number | null
  episode_number: number | null
  label: string | null
  quality: string | null
  dj: string | null
  drive_id: string | null
  drive_name: string | null
  drive_path: string | null
  file_size: number | null
  view_url: string | null
  preview_url: string | null
}

export type TitleWithAttachments = Title & { attachments: AttachmentRow[] }

export type CatalogRow = {
  id: number
  raw_title: string | null
  matched_title: string | null
  type: string | null
  year: string | null
  country: string | null
  genres: string | null
  status: string | null
  catalog_status: string | null
  poster_url: string | null
  tier: string | null
  att_count: number
  uploaded: string | null
  total_count: number
}

export type CatalogFilters = {
  q: string
  status: string
  tier: string
  type: string
  catalog: string
  sort: string
}

export type DriveFileHit = {
  id: string
  name: string
  parent_id: string | null
  path: string
  size: number
  mime: string
  view_url: string
  preview_url: string
}

export type FolderHit = {
  id: string
  name: string
  path: string
  n_files: number
}

// One proposed attachment produced by the AI grouping pass over a set of
// drive search results. Mirrors the columns a curator would otherwise fill in
// by hand (season / episode / part / quality / dj) so it can be applied
// straight to the attachments table after review.
export type AiGroupItem = {
  file_id: string
  drive_name: string
  drive_path: string | null
  size: number | null
  season: number | null
  episode_number: number | null
  part: string | null
  quality: string // 'SD' | 'HD'
  dj: string | null
  label: string
  note: string | null
}

export type AiGroupExcluded = {
  file_id: string
  drive_name: string
  reason: string
}

export type AiGroupResult = {
  summary: string
  groups: AiGroupItem[]
  excluded: AiGroupExcluded[]
}
