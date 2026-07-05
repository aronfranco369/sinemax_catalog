# Video-Evidence Verification Plan

Goal: when reviewing an ambiguous title, the UI should show the **real video files
on Drive** that belong to that title — derived automatically from the `files`
table — plus signals computed from them (episode count, sizes, folder context),
and let the reviewer **play a file inline** when metadata alone isn't enough.
Resolution decisions then rest on evidence, not guesswork.

Current state (verified against the live DB):

- `titles`: 2,101 rows (2,037 `ambiguous`, 64 `done`). Has `raw_title`,
  `original_title`, `norm_key`, `removed_text`, and unused evidence columns
  (`resolution_evidence`, `chosen_candidate_index`).
- `files`: 392,924 rows of Google Drive metadata — `id` is the **Drive file ID**,
  plus `name`, `parent_id`, `path`, `size`, `mime`, `modified`, `md5`.
  ~99% of rows are video mimes.
- Real file names are messy: `ELEVENTH HOUR EP 05..mp4`, `PORUS EP 330= Studio.avi`,
  `ELEVENTH HOUR 4_xvid.avi`; paths contain emoji, full-width slashes (`／`),
  DJ folders, and the same file duplicated across folders (detectable via `md5`).
- No link exists between `titles` and `files`.
- `pg_trgm` is **not** enabled; `files` has only btree indexes on `name`/`path`,
  which cannot serve `%substring%` searches — a naive `ILIKE` scan over 393k rows
  per page view would be slow. This drives the indexing plan below.

---

## Architecture overview

```
┌────────────┐   one-time batch    ┌──────────────┐
│  titles    │ ──── matcher ─────► │ title_files  │  (title_id ↔ file_id,
│ (2,037)    │                     │  junction    │   method, similarity)
└────────────┘                     └──────┬───────┘
                                          │ indexed join, ms-fast
┌────────────┐  trgm GIN indexes         ▼
│  files     │ ◄── live fallback ── GET /api/titles/[id]/files
│ (393k)     │      queries             │ groups + signals
└────────────┘                          ▼
                                   Review UI panel
                                   (file groups, signal chips,
                                    Drive preview player)
```

Three principles:

1. **Match once, read many** — file matching is precomputed into a junction
   table by a batch job; the review page only does an indexed join.
2. **Every live search is index-backed** — trigram GIN indexes; no raw
   `ILIKE '%…%'` on the request path.
3. **Playback costs us nothing** — embed Google Drive's own preview player
   (`https://drive.google.com/file/d/{id}/preview`) in an iframe; the
   reviewer's browser is already authenticated to the Drive account, so no
   backend streaming, OAuth flow, or bandwidth is needed.

---

## Phase 1 — Database groundwork (migration)

1. `CREATE EXTENSION pg_trgm;`
2. Add an **immutable normalization function** `norm_name(text)` used
   identically for file names and title query variants:
   - lowercase; strip file extension;
   - fold full-width characters (`／` → `/`), strip emoji/symbols;
   - remove junk tokens: `_xvid`, `= studio`, `final`, `sd`, `hd`, trailing
     dots, bracketed tags;
   - collapse whitespace/punctuation.
3. Add columns to `files` (backfilled once, ~393k rows in one statement):
   - `name_norm text` — `norm_name(name)`;
   - `ep_num int` — parsed from `EP 05`, `EP330`, trailing bare numbers
     (`ELEVENTH HOUR 4_xvid` → 4);
   - `year_hint int` — 19xx/20xx token found in name or path, if any.
4. Indexes:
   - `GIN (name_norm gin_trgm_ops)` — fuzzy search on names;
   - `GIN (path gin_trgm_ops)` — folder-name matches;
   - `btree (name_norm text_pattern_ops)` — fast exact/prefix tier;
   - `btree (md5)` — duplicate grouping.
5. New junction table `title_files`:
   ```
   title_id int → titles.id
   file_id  text → files.id
   match_method text      -- 'exact' | 'prefix' | 'trgm' | 'path' | 'loose' | 'manual'
   similarity real
   confirmed boolean default false
   PRIMARY KEY (title_id, file_id), INDEX (title_id)
   ```
6. Exclude non-evidence rows everywhere: `mime NOT LIKE 'video%'` and
   `application/vnd.google-apps.shortcut.dangling` are filtered out.

## Phase 2 — Matching engine (batch job + live fallback)

**Query-variant generation** per title (all passed through `norm_name`):

- `raw_title` ("11th Hour"), `original_title` ("ELEVENTH HOUR") — these two
  cover the digit-vs-word spelling problem for free, since `original_title`
  is what actually appears in file names;
- `norm_key`;
- `original_title` + `removed_text` recombined ("SOLDIERS HEART" + "3" →
  "soldiers heart 3"), since the stripped token often distinguishes a season;
- variants minus leading articles (a/an/the).

**Tiered matching** — run tiers in order, stop at the first tier that returns
hits; record `match_method` and `similarity` on every row:

| Tier | Predicate | Catches |
|------|-----------|---------|
| T1 exact/prefix | `name_norm = v` or `name_norm LIKE v \|\| ' %'` (btree) | `eleventh hour ep 05` |
| T2 trigram | `similarity(name_norm, v) > 0.55` or `word_similarity(v, name_norm) > 0.75` (GIN) | typos, embedded titles, `eleventhhour ep2` |
| T3 folder | `path ILIKE '%/' \|\| v \|\| '/%'` (trgm GIN) | titles that only appear as a folder containing `EP 01.mp4`… |
| T4 loose | trigram 0.35–0.55, flagged **low-confidence** | last resort, shown separately in UI |

**Guardrails for false positives:** variants shorter than 4 chars or in a
generic-word blocklist ("home", "24 hours", "love"…) are restricted to
T1/word-boundary matching only, and any variant matching more than ~500 files
is truncated and flagged for manual search instead.

**Execution model:**

- One batch script (Node script or SQL procedure, run once) processes all
  2,037 ambiguous titles → fills `title_files`. With the GIN indexes this is
  minutes, not hours.
- The API keeps a **live fallback**: if a title has no `title_files` rows,
  run the same tiers on demand; also expose a free-text search parameter so
  the reviewer can hand-tune the query from the UI (that manual query's picks
  get saved with `match_method='manual'`).
- Re-runnable and idempotent (upsert), so the drive index can be refreshed later.

## Phase 3 — Evidence API

`GET /api/titles/[id]/files` returns, computed server-side in one query:

- **Groups** — matched files grouped by parent folder (and deduped by `md5`
  so the same upload in two DJ folders counts once), each with:
  - folder path (trimmed to the informative tail), file count,
  - episode range and gaps (`EP 01–06, missing 04`),
  - total size / median size per file, mime mix,
  - dominant match method + min similarity (confidence),
  - the file list itself (id, name, ep_num, size) for expansion.
- **Signals** — a compact verdict object the UI turns into chips:
  - `structure`: `series` (≥3 distinct ep_nums) / `movie` (single large file,
    no ep token) / `unclear`;
  - `episode_count`: max contiguous ep_num;
  - `year_hints`: distinct year tokens found;
  - `copies`: number of duplicate groups (md5).

These signals are compared against each candidate (`type` series/movie is
directly checkable today; if TMDB episode counts are added to
`candidates_json` later, episode-count agreement becomes a strong
discriminator).

## Phase 4 — Review UI changes (`app/page.tsx`)

1. **"Files on Drive" panel** below the candidate list:
   - group rows (folder, `N files · EP 1–6 · 1.2 GB · high confidence`),
     expandable to individual files with the matched substring highlighted;
   - a search input pre-filled with the winning variant, so the reviewer can
     re-query live when the automatic match looks off;
   - low-confidence (T4) matches visually separated.
2. **Signal chips on each candidate card**: e.g. the 2021 IN tv candidate gets
   a green `✓ files look like a series (6 eps)` chip while movie candidates
   get a grey/red one. Pure client-side comparison of `signals` vs candidate
   `type`/`year`.
3. **Inline player**: clicking a file opens a modal with
   `<iframe src="https://drive.google.com/file/d/{FILE_ID}/preview" allow="autoplay">`.
   - Works for mp4 and most Drive-transcoded formats; some raw `.avi` may not
     have a Drive preview yet — the modal includes an
     "Open in Drive" fallback link (`…/view`) and shows size/name either way.
   - Requires only that the browser is logged into a Google account with
     access to the drive — true for the reviewer today; nothing server-side.
4. **Resolve writes evidence**: the existing resolve POST additionally stores
   `resolution_evidence` (JSON: variant used, group folder, file ids, whether
   playback was used) and `chosen_candidate_index`, and flips
   `title_files.confirmed = true` for the matched set. This makes the
   confirmed title→files mapping the durable output of the whole review, not
   just a side effect.
5. **Prefetch** page `n+1`'s title + files while the reviewer looks at page
   `n`, so the flow never waits on the network.

## Phase 5 (optional) — Auto-resolution pass

Once signals exist for all titles, a scoring rule can auto-resolve the easy
cases before any human looks at them, e.g.:

- exactly one candidate whose `type` matches the file structure signal, and
- match confidence ≥ T2, and
- year hint (if present) consistent with that candidate

→ resolve with `resolution_method = 'auto_file_evidence'`. Everything else
stays in the manual queue. Expected to meaningfully shrink the 2,037 backlog;
thresholds stay conservative because the manual UI is now cheap to use.

---

## Performance summary

| Path | Cost |
|------|------|
| Review page load | 1 indexed row fetch + 1 `title_files` join — single-digit ms |
| Live re-search | trigram GIN lookup over 393k rows — tens of ms |
| Batch matching | one-off, minutes for 2,037 titles |
| Playback | zero backend cost (Drive serves it) |

## Risks / edge cases handled

- **Generic titles** ("24 Hours") → blocklist + word-boundary-only matching + result cap.
- **Digit vs word spellings** → `original_title` reflects the on-disk spelling; both variants queried.
- **Title only in folder name** → T3 path tier.
- **Duplicates across DJ folders** → md5 dedupe in grouping.
- **Emoji / full-width chars in paths** → normalization folds them.
- **`.avi` without Drive preview** → fallback open-in-Drive link.
- **Season markers stripped into `removed_text`** → recombined variant.
- **Stale drive listing** → batch job is idempotent; re-run after re-syncing `files`.

## Build order

1. Migration: pg_trgm, `norm_name`, new columns, indexes, `title_files` (small).
2. Batch matcher script + spot-check ~30 titles across tiers (medium).
3. `GET /api/titles/[id]/files` with groups + signals (medium).
4. UI panel + signal chips + player modal + evidence-on-resolve (medium).
5. Prefetching polish; optional auto-resolution pass (small / separate decision).
