# Sinemax Catalog — File-Evidence Verification Plan

**Status: agreed plan, not yet implemented. This document is self-contained:
an implementer (human or LLM) should be able to build the feature from this
file alone, without exploring the codebase first.**

---

## 1. Context — what this project is

A minimal **Next.js 15 (App Router) + Supabase + Tailwind** web app, deployed
on Vercel at `sinemax-catalog.vercel.app`. It is a **manual review tool**: a
media catalog was scraped from a huge Google Drive of movies/series (Swahili
DJ-dubbed content), titles were matched against TMDB, and titles with several
plausible TMDB matches are marked `ambiguous`. The reviewer sees one ambiguous
title at a time with its TMDB candidates and taps the correct one.

**The problem:** the reviewer currently picks candidates blind — they see TMDB
metadata but not the *actual video files on Drive* that the title refers to.
The evidence needed to decide (is it a series or a movie? how many episodes?
which year? what does the video actually show?) sits unused in a `files` table.

**The feature to build:** for each ambiguous title, automatically find its
video files in the `files` table, show them in the review UI with derived
signals (episode count, sizes, folder context), let the reviewer play any file
inline via Google Drive's preview player, and record the file evidence when a
candidate is chosen.

### 1.1 Repository layout (complete)

```
app/
  page.tsx                        # the entire review UI (client component)
  layout.tsx                      # root layout
  globals.css                     # Tailwind
  api/titles/route.ts             # GET  /api/titles?page=N  → one ambiguous title
  api/titles/[id]/resolve/route.ts# POST /api/titles/:id/resolve → mark done
lib/supabase.ts                   # browser supabase client (unused by routes)
next.config.ts, package.json, tsconfig.json, postcss.config.mjs
```

### 1.2 Existing behavior (do not break)

- `GET /api/titles?page=N` — server route; creates its own Supabase client
  from `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; selects
  `titles` where `status='ambiguous'`, ordered by `id`, page size 1, with
  `count: 'exact'`. Returns `{ data: Title[], count }`.
- `POST /api/titles/:id/resolve` — body `{ candidate }`; updates the title row
  to `status='done'` and copies candidate fields (`matched_title`, `year`,
  `country`, `genres`, `synopsis`, `poster_url`, `tmdb_id`, `score`, `type`),
  sets `resolution_method='manual'`, `resolved_at=now`.
- `app/page.tsx` — client component; state machine: fetch title for `page`,
  render header (raw/original title, type badge, "N of M remaining", progress
  bar), then candidate cards (poster, title, year badge, type/country chips,
  genres, 3-line synopsis), a full-width **Skip for now** button at the bottom.
  Tapping a candidate POSTs resolve then advances `page`. Dark theme:
  `bg-gray-950`, cards `bg-gray-900` `border-gray-800` `rounded-2xl`, accents
  `indigo-500/400/900`. Mobile-first single column.

### 1.3 Environment

Only two env vars exist and no new ones are needed:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Supabase project: **"sinemax catalog"** (`itukmminhxhsdtwbiagg`, eu-west-1,
Postgres 17). All server routes use the anon key; RLS is enabled on all tables
(existing policies already allow the reads/writes the app performs).

### 1.4 Database schema (verified live)

**`titles`** — 2,101 rows: 2,037 `status='ambiguous'`, 64 `'done'`. PK `id int`.

| column | type | notes |
|---|---|---|
| raw_title | text | display title, e.g. `11th Hour` |
| original_title | text | **the spelling as it appears on disk**, e.g. `ELEVENTH HOUR` |
| norm_key | text | unique normalized key, e.g. `11th hour` |
| removed_text | text | token stripped during normalization, often a season number (e.g. `3` for `SOLDIERS HEART 3`) |
| type | text | `movie` / `series` (best guess) |
| tier | text | priority tier |
| status | text | `ambiguous` / `done` |
| candidates_json | jsonb | array of TMDB candidates: `{matched_title, year, type, country, genres, synopsis, poster_url, tmdb_id, score}` |
| matched_title, year, country, genres, synopsis, poster_url, tmdb_id, score | | filled on resolve |
| resolution_method | text | `manual` today; `auto_file_evidence` reserved for phase 6 |
| resolved_at, updated_at | timestamptz | |
| chosen_candidate_index | int | **exists, currently unused — this plan starts filling it** |
| resolution_evidence | text | **exists, currently unused — this plan starts filling it** |
| dj, tags | text | mostly null |

**`files`** — 392,924 rows of Google Drive metadata. PK `id text` = **the
Google Drive file ID** (usable directly in Drive URLs).

| column | type | notes |
|---|---|---|
| name | text | file name, e.g. `ELEVENTH HOUR EP 05..mp4` |
| parent_id | text | Drive folder id |
| path | text | full human path, e.g. `MASTERLINK 70TB/Samstudio2/2025/05／2025/19／05／2025/💯MECKY DJ SD/ELEVENTH HOUR EP 05..mp4` |
| size | bigint | bytes |
| mime | text | ~99% `video/*` (avi 167k, mp4 161k, x-msvideo 43k, mpeg 22k); some audio/images/`application/vnd.google-apps.shortcut.dangling` — non-video must be filtered out |
| modified | text | ISO-ish timestamp |
| md5 | text | **duplicates exist**: same video uploaded to multiple DJ folders shares md5 |

Existing indexes on `files`: btree on `id`, `name`, `path` only —
**no trigram indexes yet**, so `ILIKE '%…%'` currently scans 393k rows.
`pg_trgm` is **not yet enabled**. (`files_test` is a 500-row scratch copy;
ignore it.)

### 1.5 Real-world data quirks the implementation must handle

| Quirk | Example | Handling |
|---|---|---|
| Digit vs word spellings | title `11th Hour`, files say `ELEVENTH HOUR…` | search with **both** `raw_title` and `original_title` |
| Junk tokens in names | `_xvid`, `= Studio`, `Final`, double dots | normalization strips them |
| Full-width chars / emoji in paths | `05／2025`, `💯MECKY DJ` | normalization keeps only `[a-z0-9 ]` |
| Same file in several folders | md5 duplicates across DJ folders | dedupe groups by md5 |
| Season number stripped from title | `removed_text='3'` | extra query variant recombining it |
| Title only present as a folder | folder `Porus 1-438 Final Dj Murphy/` containing `PORUS EP 330…` | path-tier matching |
| Generic titles | `24 Hours`, `Home` | word-boundary-only matching + result cap |
| Episode numbering styles | `EP 05`, `EP330`, bare trailing `4` | `ep_num` parser with two patterns |

---

## 2. Architecture

```
┌────────────┐   one-time batch (SQL)   ┌──────────────┐
│  titles    │ ───── matcher ─────────► │ title_files  │  title_id ↔ file_id
│  (2,037)   │                          │  (junction)  │  + method + similarity
└────────────┘                          └──────┬───────┘
                                               │ indexed join (ms)
┌────────────┐  trgm GIN indexes              ▼
│  files     │ ◄── live re-search ── GET /api/titles/[id]/files
│  (393k)    │                                │ groups + signals JSON
└────────────┘                                ▼
                                       Review UI (page.tsx)
                                       evidence panel · signal chips
                                       · Drive preview player modal
```

Principles:

1. **Match once, read many** — matching is precomputed into `title_files`;
   the review page only does an indexed join.
2. **Every live query is index-backed** — trigram GIN; never a bare
   `ILIKE '%…%'` on the request path.
3. **Playback costs nothing** — embed Drive's own player
   (`https://drive.google.com/file/d/{id}/preview`) in an iframe. The
   reviewer's browser is already logged into the Google account that owns the
   drive, so there is no backend streaming, OAuth, API key, or quota.
4. **Zero new infrastructure** — no Edge Functions, no Storage, no cron, no
   service-role key, no new env vars. Setup is three SQL blocks pasted once
   into the Supabase SQL editor (§3) plus one batch SQL run (§4).

---

## 3. Phase 1 — Database groundwork (paste into Supabase SQL editor, once)

**Block 1 — extension + shared normalization function**

```sql
create extension if not exists pg_trgm;

create or replace function norm_name(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(
      lower(regexp_replace(t, '\.(mp4|avi|mkv|mpg|mpeg|mov|wmv|flv|vob|3gp|webm)$', '', 'i')),
      '(_xvid|=\s*studio|\bfinal\b|\bsd\b|\bhd\b)', ' ', 'g'
    ),
    '[^a-z0-9 ]+', ' ', 'g'
  ))
$$;
```

Used identically on file names and title search variants so both sides agree.
`norm_name('ELEVENTH HOUR 4_xvid.avi')` → `eleventh hour 4`.

**Block 2 — precomputed columns on `files` (backfill runs once, ~1 min)**

```sql
alter table files
  add column if not exists name_norm text,
  add column if not exists ep_num int;

update files set
  name_norm = norm_name(name),
  ep_num = coalesce(
    nullif(substring(name from '(?i)ep\.?\s*0*(\d{1,4})'), '')::int,   -- "EP 05", "EP330"
    nullif(substring(norm_name(name) from ' 0*(\d{1,3})$'), '')::int   -- trailing bare number
  )
where mime like 'video%';
```

**Block 3 — indexes + junction table (index builds ~1–2 min, once)**

```sql
create index if not exists idx_files_name_trgm on files using gin (name_norm gin_trgm_ops);
create index if not exists idx_files_path_trgm on files using gin (path gin_trgm_ops);
create index if not exists idx_files_name_norm_btree on files (name_norm text_pattern_ops);
create index if not exists idx_files_md5 on files (md5);

create table if not exists title_files (
  title_id     int  references titles(id) on delete cascade,
  file_id      text references files(id)  on delete cascade,
  match_method text,        -- 'exact' | 'prefix' | 'trgm' | 'path' | 'loose' | 'manual'
  similarity   real,
  confirmed    boolean default false,
  primary key (title_id, file_id)
);
create index if not exists idx_title_files_title on title_files (title_id);

alter table title_files enable row level security;
create policy "anon read"  on title_files for select using (true);
create policy "anon write" on title_files for insert with check (true);
create policy "anon update" on title_files for update using (true);
```

After this, nothing else is ever configured in Supabase for this feature.

---

## 4. Phase 2 — Batch matcher (SQL, run in the SQL editor; idempotent)

For every ambiguous title, generate normalized **query variants** and match
files in tiers, inserting winners into `title_files`. Run as admin in the SQL
editor (bypasses RLS, no keys needed). Re-runnable via upsert
(`on conflict do nothing`); safe to re-run after the drive is re-synced.

**Variants per title** (each passed through `norm_name`, deduped, empty
dropped):

1. `raw_title`  — `11th hour`
2. `original_title` — `eleventh hour`  ← usually the on-disk spelling
3. `norm_key`
4. `original_title || ' ' || removed_text` when `removed_text` is not null —
   `soldiers heart 3`
5. variants 1–2 with a leading `a/an/the ` stripped

**Tiers** — evaluate in order **per title**, stop at the first tier producing
hits; every inserted row records `match_method` and `similarity`:

| Tier | method | Predicate (v = variant) | Catches |
|---|---|---|---|
| T1 | `exact` / `prefix` | `name_norm = v` or `name_norm like v \|\| ' %'` (btree) | `eleventh hour ep 05` |
| T2 | `trgm` | `word_similarity(v, name_norm) > 0.75` or `similarity(name_norm, v) > 0.55` (GIN) | typos, glued words |
| T3 | `path` | `path ilike '%/' \|\| original_title \|\| '/%'` (raw, GIN-assisted) | title exists only as a folder |
| T4 | `loose` | trigram similarity 0.35–0.55 | last resort; shown separately in UI |

**Guardrails:**

- variants with `length < 4` or in a generic blocklist
  (`24 hours`, `home`, `love`, `mother`, `family`, …) are limited to T1;
- if a variant matches **> 500 files**, discard that variant's hits and flag
  the title (`match_method='loose'`, low similarity) — the reviewer uses the
  manual search box instead;
- only `mime like 'video%'` rows are ever matched.

**Verification of this phase:** after running, spot-check ~30 titles across
tiers with a query like
`select t.raw_title, tf.match_method, count(*) from title_files tf join titles t on t.id = tf.title_id group by 1,2 order by 1 limit 60;`
and eyeball a few known titles (`11th Hour` → the `ELEVENTH HOUR EP 01–06`
files in the `MECKY DJ` folders, plus the `ELEVENTH HOUR 1–5_xvid.avi` set).

---

## 5. Phase 3 — Evidence API

New route: **`app/api/titles/[id]/files/route.ts`** (same style as existing
routes: server-side `createClient` with the two public env vars).

```
GET /api/titles/:id/files          → precomputed matches from title_files
GET /api/titles/:id/files?q=free+text  → live re-search (trgm, indexed),
                                         does NOT write anything
```

Response shape (computed server-side; group = distinct parent folder, files
deduped by md5 within a group):

```jsonc
{
  "query_used": "eleventh hour",        // winning variant (or the ?q= value)
  "signals": {
    "structure": "series",              // 'series' | 'movie' | 'unclear'
    "episode_count": 6,                 // max distinct ep_num, null if none
    "year_hints": [2025],               // years seen in paths, often junk — weak signal
    "total_files": 18,
    "duplicate_sets": 5                 // md5 groups with >1 copy
  },
  "groups": [
    {
      "folder": "…/19／05／2025/💯MECKY DJ",   // tail of path, max ~60 chars
      "file_count": 6,
      "ep_range": { "min": 1, "max": 6, "missing": [] },
      "total_size": 1511662494,
      "confidence": "high",             // from best match_method: exact/prefix→high, trgm/path→medium, loose→low
      "files": [
        { "id": "1dSHcY8zvPgw3RiWxOf2zTxR43TFEUyL0",
          "name": "ELEVENTH HOUR EP 01.mp4",
          "ep_num": 1, "size": 231806084, "mime": "video/mp4",
          "match_method": "prefix" }
      ]
    }
  ]
}
```

Signal rules (server-side):

- `structure = 'series'` if ≥ 3 distinct `ep_num` values across matches;
- `structure = 'movie'` if the match set is 1–2 files, none with `ep_num`,
  and the largest ≥ ~400 MB;
- otherwise `'unclear'`.

**Resolve route change** (`app/api/titles/[id]/resolve/route.ts`): the POST
body gains optional fields and the update writes them:

```jsonc
// body: { candidate, candidateIndex, evidence }
// evidence: { query_used, folder, file_ids: [...], played: true|false }
```

- `chosen_candidate_index = candidateIndex`
- `resolution_evidence = JSON.stringify(evidence)`
- additionally: `update title_files set confirmed = true where title_id = :id
  and file_id = any(evidence.file_ids)`

The confirmed `title_files` rows are the durable product of the whole review:
a verified **title → playable Drive files** mapping for the final catalog.

---

## 6. Phase 4 — UI flow & layout (`app/page.tsx`)

Keep the existing dark, mobile-first, single-column design language:
`bg-gray-950` page, `bg-gray-900` cards with `border-gray-800` and
`rounded-2xl`, indigo accents, tiny uppercase tracked section labels.

### 6.1 Screen layout (top → bottom)

```
┌──────────────────────────────────────────┐
│ HEADER  (unchanged)                      │  SINEMAX REVIEW / title /
│ + progress bar (unchanged)               │  original / type · N of M
├──────────────────────────────────────────┤
│ PICK THE CORRECT MATCH   (label, as now) │
│ ┌──────────────────────────────────────┐ │
│ │ Candidate card (as now)              │ │  poster · title · year
│ │ + NEW evidence chip row              │ │  ✓ files look like a series (6 eps)
│ └──────────────────────────────────────┘ │
│ …more candidate cards…                   │
├──────────────────────────────────────────┤
│ FILES ON DRIVE  (NEW section label)      │
│ ┌ search box: [eleventh hour     ] [⟳] ┐ │  pre-filled with query_used
│ ├ Group row ──────────────────────────┤ │
│ │ 📁 …/💯MECKY DJ                      │ │
│ │ 6 files · EP 1–6 · 1.4 GB · HIGH    │ │  tap to expand ▼
│ │   ├ ▶ ELEVENTH HOUR EP 01.mp4  221MB│ │  tap ▶ opens player modal
│ │   ├ ▶ ELEVENTH HOUR EP 02.mp4  266MB│ │
│ │   └ …                               │ │
│ ├ Group row (collapsed) ──────────────┤ │
│ │ 📁 …/MLAGALILA                      │ │
│ │ 6 files · EP 1–5 +1 · 0.9 GB · HIGH │ │
│ └──────────────────────────────────────┘ │
│ ── low confidence matches (collapsed) ── │  only if T4/loose rows exist
├──────────────────────────────────────────┤
│ [        Skip for now        ] (as now)  │
└──────────────────────────────────────────┘
```

### 6.2 Data flow on page load

1. Fetch title (existing call). Render header + candidates immediately.
2. In parallel, fetch `GET /api/titles/:id/files`. Evidence panel shows a
   skeleton (2 shimmering group-row placeholders) until it resolves —
   **candidates never wait for the evidence call**.
3. When evidence arrives: render signal chips on candidate cards + groups.
4. **Prefetch**: immediately fire both fetches for `page + 1` and cache in a
   ref, so advancing is instant.

### 6.3 Evidence chips on candidate cards

Client-side comparison of `signals` vs each candidate (no extra requests):

| Condition | Chip on the candidate card |
|---|---|
| `signals.structure='series'` and `candidate.type` is tv/series | green `✓ files look like a series (6 eps)` |
| `signals.structure='series'` and candidate is a movie | red `✗ files are episodic` |
| `signals.structure='movie'` and candidate is a movie | green `✓ single feature file` |
| `signals.structure='movie'` and candidate is tv/series | red `✗ no episode files found` |
| `structure='unclear'` or evidence still loading | no chip |

Chips are one small pill under the type/country chip row:
green `bg-emerald-900 text-emerald-300`, red `bg-red-900 text-red-300`.
Chips are **advisory only** — they never disable a candidate.

### 6.4 Files-on-Drive panel behavior

- **Section label**: `FILES ON DRIVE` in the same tiny uppercase style, with
  a right-aligned count (`18 files · 3 folders`).
- **Search box**: text input pre-filled with `query_used` + a re-search
  button; submitting calls `?q=` (live trgm search) and re-renders groups.
  Purely exploratory — it does not modify `title_files`. Debounce 400 ms /
  enter to submit.
- **Group rows**: folder tail (ellipsized left), stat line
  `6 files · EP 1–6 · 1.4 GB`, confidence badge
  (`HIGH` emerald / `MED` amber / `LOW` gray). Tap toggles expansion; the
  first (highest-confidence) group starts expanded, the rest collapsed.
- **File rows** (inside expanded group): play icon, file name (matched
  substring highlighted with `text-indigo-300`), size right-aligned. Tap
  opens the player modal.
- **Low-confidence section**: T4/`loose` matches under a separate collapsed
  divider "possible matches — verify by playing".
- **States**: loading → skeleton; empty → card saying
  `No files matched automatically — try the search box`; error → same card
  with a retry button. The panel never blocks candidate selection.

### 6.5 Player modal

- Full-screen overlay (`fixed inset-0 bg-black/80`), centered card, 16:9
  `<iframe src="https://drive.google.com/file/d/{FILE_ID}/preview"
  allow="autoplay" allowFullScreen>`, file name + size above, close ✕.
- Footer row: **Open in Drive ↗** link to
  `https://drive.google.com/file/d/{FILE_ID}/view` (fallback for `.avi`
  files Drive hasn't transcoded — preview may say "processing"), and a
  prev/next episode arrow pair when the group has multiple files.
- Requires only that the reviewer's browser is logged into a Google account
  with access to the drive. No app-side auth of any kind.
- Set a `played` flag in component state when any file was opened for the
  current title (goes into resolve evidence).

### 6.6 Resolve interaction (updated)

Tapping a candidate now sends the enriched body from §5:
`candidateIndex` (its position in `candidates_json`) and `evidence` built
from component state — `query_used`, the folder of the currently-expanded
group, all matched `file_ids`, and the `played` flag. Everything else about
the flow (optimistic advance to next page, skip button) is unchanged.

### 6.7 Component structure (suggested, all in one file or split)

```
ReviewPage
 ├─ Header (existing)
 ├─ CandidateCard ×N (existing + <EvidenceChip signals candidate/>)
 ├─ DriveFilesPanel {titleId, onEvidenceChange}
 │   ├─ SearchBar
 │   ├─ FileGroup ×N ─ FileRow ×N
 │   └─ LowConfidenceGroup
 ├─ PlayerModal {fileId, name, size, onPrev, onNext}
 └─ SkipButton (existing)
```

---

## 7. Phase 5 (optional, decide later) — Auto-resolution pass

With signals precomputed, auto-resolve conservative easy cases before human
review: exactly one candidate whose type matches `signals.structure`, match
confidence ≥ T2, no contradicting year hint → set `status='done'`,
`resolution_method='auto_file_evidence'`. Everything else stays manual.
**Not part of the initial build** — revisit once the UI has been used a while
and precision is trusted.

---

## 8. Performance budget

| Path | Cost |
|---|---|
| Review page load | 1 title row + 1 `title_files` indexed join → single-digit ms |
| Live `?q=` re-search | trgm GIN over 393k rows → tens of ms |
| Batch matching | one-off SQL, minutes for 2,037 titles |
| Playback | zero backend cost (Drive serves the video) |
| Page advance | instant (prefetched) |

## 9. Build order & acceptance checks

1. **Migration** (§3, three SQL blocks). ✓ `select norm_name('PORUS EP 330= Studio.avi')` returns `porus ep 330`; ✓ trgm query on `name_norm` uses the GIN index (`explain`).
2. **Batch matcher** (§4). ✓ `title_files` populated for most of the 2,037; ✓ spot-check `11th Hour` → `ELEVENTH HOUR` file sets; ✓ generic titles not exploded (>500-file guardrail).
3. **Evidence API** (§5). ✓ response matches the JSON contract; ✓ `?q=` search returns in <100 ms; ✓ non-video mimes absent.
4. **UI** (§6). ✓ candidates render before evidence arrives; ✓ chips correct for a known series and a known movie; ✓ player modal streams an mp4; ✓ `.avi` fallback link present; ✓ resolve writes `chosen_candidate_index` + `resolution_evidence` and confirms `title_files` rows.
5. **Prefetch polish** (§6.2 step 4).

Total new code: 1 migration, 1 batch SQL, 1 new API route, edits to the
resolve route, and UI additions to `page.tsx`. No new dependencies, env vars,
or services.
