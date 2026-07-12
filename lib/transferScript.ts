// Backblaze B2 transfer: turn ready items into paste-ready rclone commands.
// This app never moves bytes itself; it emits `rclone copyto gd: -> b2:`
// lines (run on Google Cloud Shell, which has free bandwidth) with
// deterministic object keys, so a media folder per title is created
// automatically. Unlike the original desktop tool, the generated setup
// script never embeds real B2 credentials or a Drive rclone remote — there
// is no secure place to hold either on a hosted server, so both are always
// left as placeholders for the operator to fill in locally.
const DRIVE_ROOT_ID = '11xi35nvqUqAHs4t911diIF0VZOZULlzd'
const SINEMAX_PREFIX = 'sinemax'

// Public download host for the B2 bucket (files served straight to the app).
const B2_DOWNLOAD_HOST = 'https://f003.backblazeb2.com/file'

const ILLEGAL_SEG = /[\\/\x00-\x1f\x7f]/g

/** Sanitise one B2 key path segment (a folder or file name). */
function b2Seg(s: string | null | undefined): string {
  let out = (s || '').trim().replace(ILLEGAL_SEG, ' ')
  out = out.replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '')
  return out || 'untitled'
}

/** Lowercase, hyphen-joined slug for an in-filename tag (dj / quality). */
function slug(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Lower-case file extension from a drive filename, e.g. 'mp4'. Empty if none. */
function fileExt(name: string | null | undefined): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec((name || '').trim())
  return m ? m[1].toLowerCase() : ''
}

export type TransferTitle = {
  id: number
  raw_title: string | null
  matched_title: string | null
  type: string | null
  year: string | null
  dj: string | null
}

export type TransferAttachment = {
  id: number
  drive_name: string | null
  drive_path: string | null
  season?: number | null
  episode_number?: number | null
  quality?: string | null
  dj?: string | null
}

/** True when the title is episodic (series/tv) rather than a movie. */
export function isSeriesType(t: TransferTitle): boolean {
  return t.type === 'series' || t.type === 'tv'
}

/**
 * The DJ that actually applies to one file: the attachment's own DJ tag when
 * present (a one-off guest cut), otherwise the title's DJ. May be ''.
 */
export function effectiveDj(t: TransferTitle, a: TransferAttachment): string {
  return (a.dj || '').trim() || (t.dj || '').trim()
}

/**
 * Folder name for a title's media: just 'Title (Year)' — no DJ.
 *
 * Every DJ / quality variant of the same work shares this one folder; the
 * files inside are kept distinct by their object key (see videoObjectKey),
 * not by living in separate folders.
 *   'Knights (2025)'   (with year)
 *   'Knights'          (no year)
 */
export function mediaFolder(t: TransferTitle): string {
  const title = b2Seg(t.matched_title || t.raw_title)
  const year = String(t.year || '').trim()
  return year ? `${title} (${year})` : title
}

/** Zero-padded slot label: 's01e05' for series, 'part1' for movies. */
function slotName(t: TransferAttachment, series: boolean): string {
  const ep = t.episode_number ?? 1
  if (series) {
    const s = String(t.season ?? 1).padStart(2, '0')
    return `s${s}e${String(ep).padStart(2, '0')}`
  }
  return `part${ep}`
}

/**
 * Deterministic, collision-proof B2 key for one attached video file:
 *   sinemax/{movies|series}/{Title (Year)}/{slot}[-{dj}][-{quality}]-{id}.{ext}
 *
 * The trailing attachment id is what guarantees uniqueness — the dj/quality
 * tags are only there so the file is legible in the B2 console. Because the
 * key is anchored on the immutable attachment id, it stays stable even if the
 * title text, dj, or original drive filename are later edited.
 */
export function videoObjectKey(t: TransferTitle, a: TransferAttachment): string {
  const kind = isSeriesType(t) ? 'series' : 'movies'
  const parts = [slotName(a, isSeriesType(t))]
  const dj = slug(effectiveDj(t, a))
  if (dj) parts.push(dj)
  const q = slug(a.quality)
  if (q) parts.push(q)
  parts.push(String(a.id))
  const ext = fileExt(a.drive_name)
  const fname = parts.join('-') + (ext ? `.${ext}` : '')
  return `${SINEMAX_PREFIX}/${kind}/${mediaFolder(t)}/${fname}`
}

/** Public https URL the app streams from, for a given object key. */
export function b2DownloadUrl(key: string, bucket = 'suacart'): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${B2_DOWNLOAD_HOST}/${bucket}/${encoded}`
}

/** POSIX shell single-quoting, equivalent to Python's shlex.quote. */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export type TransferItem = {
  title: TransferTitle
  attachments: TransferAttachment[]
}

/**
 * Build (script, fileCount) of rclone copyto commands for the given items.
 * Each line copies one Drive file to its computed B2 key.
 */
export function buildTransferScript(
  items: TransferItem[],
  bucket = 'suacart'
): { script: string; total: number } {
  const lines = [
    '#!/usr/bin/env bash',
    '# Generated by Catalog Dashboard. Paste into Google Cloud Shell after the',
    '# one-time setup. Re-runnable: --ignore-existing skips files already in B2.',
    'set -uo pipefail',
    'set +m  # silence bash job-control [N] Done/PID spam when pasted directly',
    '# rclone lives in ~/bin (the only dir Cloud Shell persists); ensure PATH.',
    'export PATH="$HOME/bin:$PATH"',
    `BUCKET=b2:${bucket}`,
    '# How many files to transfer at once. Override before running, e.g.'
      + ' MAXJOBS=12 bash thisfile.sh',
    'MAXJOBS=${MAXJOBS:-8}',
    '# Each copy runs in the background; we block once MAXJOBS are in flight so'
      + ' several Drive->B2 hops overlap instead of going one-at-a-time.',
    'copy(){',
    '  while (( $(jobs -rp | wc -l) >= MAXJOBS )); do wait -n; done',
    '  { rclone copyto --ignore-existing --drive-stop-on-download-limit \\',
    '      --multi-thread-streams=4 --b2-chunk-size=100M \\',
    '      "gd:$1" "$BUCKET/$2" \\',
    '      && echo "  OK   $2" || echo "  FAIL $2"; } &',
    '}',
    '',
  ]

  let total = 0
  for (const { title: t, attachments } of items) {
    const label = (t.matched_title || t.raw_title || '').trim()
    lines.push(`# ${label} [${t.type || '?'}] -> media id ${t.id}`)
    if (attachments.length === 0) {
      lines.push('#   (no files attached)')
    }
    for (const a of attachments) {
      if (!a.drive_path) {
        lines.push(`#   SKIP (no drive_path): ${a.drive_name ?? ''}`)
        continue
      }
      lines.push(`copy ${shQuote(a.drive_path)} ${shQuote(videoObjectKey(t, a))}`)
      total += 1
    }
    lines.push('')
  }

  lines.push('wait  # let the last batch of background transfers finish')
  lines.push(`echo "Done. Files processed: ${total}"`)
  return { script: lines.join('\n'), total }
}

/**
 * One-time Cloud Shell setup: install rclone and write a config template.
 * Always placeholders for [gd] token and B2 keys — a hosted server has no
 * access to the operator's local rclone.conf or B2 secrets, and a
 * generated script is displayed in the browser, so real credentials must
 * never flow through it.
 */
export function buildSetupScript(): string {
  const conf = [
    '[gd]',
    'type = drive',
    'scope = drive.readonly',
    `root_folder_id = ${DRIVE_ROOT_ID}`,
    '',
    '[b2]',
    'type = b2',
    'account = YOUR_B2_KEY_ID',
    'key = YOUR_B2_APP_KEY',
  ].join('\n')

  const note = '# NOTE: paste your own [gd] token block below (rclone config reconnect gd:).\n'

  const install = [
    'mkdir -p "$HOME/bin"',
    'if [ ! -x "$HOME/bin/rclone" ]; then',
    '  echo "Installing rclone into ~/bin (persists across sessions)..."',
    '  tmp=$(mktemp -d)',
    '  curl -fsSL https://downloads.rclone.org/rclone-current-linux-amd64.zip'
      + ' -o "$tmp/rclone.zip"',
    '  unzip -q -o "$tmp/rclone.zip" -d "$tmp"',
    '  cp "$tmp"/rclone-*-linux-amd64/rclone "$HOME/bin/rclone"',
    '  chmod +x "$HOME/bin/rclone"',
    '  rm -rf "$tmp"',
    'fi',
    // Make sure interactive shells find it too (idempotent).
    'grep -q \'HOME/bin\' "$HOME/.bashrc" 2>/dev/null'
      + ' || echo \'export PATH="$HOME/bin:$PATH"\' >> "$HOME/.bashrc"',
    'export PATH="$HOME/bin:$PATH"',
    '',
  ].join('\n')

  return (
    '# ---- Google Cloud Shell: run ONCE (everything lives in your home dir) ----\n'
    + install
    + note
    + 'mkdir -p ~/.config/rclone\n'
    + "cat > ~/.config/rclone/rclone.conf <<'RCLONE_EOF'\n"
    + conf + '\n'
    + 'RCLONE_EOF\n'
    + '"$HOME/bin/rclone" version | head -1\n'
    + "echo 'Edit ~/.config/rclone/rclone.conf: paste your gd: token and real B2 account/key.'\n"
  )
}
