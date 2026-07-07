-- Fix "canceling statement due to statement timeout" in the dashboard Drive search.
-- Applied to the "sinemax catalog" Supabase project as migration
-- fix_drive_search_statement_timeout on 2026-07-07.
--
-- Root cause
-- ----------
-- The old search_files_multi / search_folders_trgm fed their ILIKE patterns to
-- the planner through subselects (a `tok` CTE), so the planner could not see
-- the pattern text and always drove the scan with token #1. For a token under
-- 3 characters ("Ip" in "Ip Man") no trigram can be extracted from '%ip%', so
-- the GIN trigram index scan degenerated to reading ALL ~400k rows and
-- rechecking each one (~12s measured), blowing through the anon role's 3s
-- statement_timeout. The dashboard API routes use the anon key, hence the
-- error surfaced in the UI.
--
-- Fix
-- ---
-- 1. Build the query dynamically with the patterns inlined as literals, so the
--    planner picks the selective, trigram-indexable tokens to drive the scan
--    and applies the rest as filters ("Ip Man": drive with '%man%', filter
--    with the "ip" conditions).
-- 2. Give sub-3-char tokens word-start semantics ('ip%', '% ip%', '%/ip%',
--    ...) which ARE trigram-indexable, instead of substring '%ip%' which never
--    is. This also improves relevance: "ip" no longer matches "flip"/"vip".
-- 3. Fence the matching in a MATERIALIZED CTE: otherwise ORDER BY path LIMIT n
--    tempts the planner into walking idx_files_path and filtering row by row
--    (~9s measured); with the fence it bitmap-scans the trigram indexes first.
--
-- Measured after the fix (was 12.3s for 'Ip Man'):
--   'Ip Man' 35ms · 'ip' 28ms · '24' 81ms · 'the' 0.7s · folders 'ip man' 17ms

create or replace function public.search_files_multi(p_query text, p_videos_only boolean default true, p_limit integer default 200)
returns table(id text, name text, parent_id text, path text, size bigint, mime text)
language plpgsql
stable
as $fn$
declare
  v_tok   text;
  v_esc   text;
  v_conds text[] := '{}';
  v_where text;
begin
  for v_tok in
    select tok
    from unnest(regexp_split_to_array(trim(coalesce(p_query, '')), '\s+')) as tok
    where length(tok) >= 2
    limit 8
  loop
    -- escape LIKE metacharacters in the user's token
    v_esc := replace(replace(replace(v_tok, '\', '\\'), '%', '\%'), '_', '\_');
    if length(v_tok) >= 3 then
      v_conds := v_conds || format(
        '(f.name_norm ilike %L or f.path ilike %L)',
        '%' || v_esc || '%', '%' || v_esc || '%');
    else
      -- word-start match. name_norm's only separator is a space; raw paths
      -- also use / . - _ ( [ before words. Each pattern is index-friendly.
      v_conds := v_conds || format(
        '(f.name_norm ilike %L or f.name_norm ilike %L'
        || ' or f.path ilike %L or f.path ilike %L or f.path ilike %L'
        || ' or f.path ilike %L or f.path ilike %L or f.path ilike %L'
        || ' or f.path ilike %L or f.path ilike %L)',
        v_esc || '%',  '% ' || v_esc || '%',
        v_esc || '%',  '%/' || v_esc || '%',  '% ' || v_esc || '%',
        '%.' || v_esc || '%', '%-' || v_esc || '%', '%\_' || v_esc || '%',
        '%(' || v_esc || '%', '%[' || v_esc || '%');
    end if;
  end loop;

  if array_length(v_conds, 1) is null then
    return;
  end if;

  v_where := array_to_string(v_conds, ' and ');
  if p_videos_only then
    v_where := 'f.mime like ''video/%'' and ' || v_where;
  end if;

  return query execute format(
    $q$
    with hits as materialized (
      select f.id, f.name, f.parent_id, f.path, f.size, f.mime
      from files f
      where %s
      limit 2000
    )
    select * from hits order by path, name limit %s
    $q$,
    v_where, least(greatest(coalesce(p_limit, 200), 1), 1000));
end
$fn$;

create or replace function public.search_folders_trgm(p_query text, p_videos_only boolean default true, p_limit integer default 200)
returns table(folder_path text, n_files bigint)
language plpgsql
stable
as $fn$
declare
  v_tok   text;
  v_esc   text;
  v_conds text[] := '{}';
  v_where text;
begin
  for v_tok in
    select tok
    from unnest(regexp_split_to_array(trim(coalesce(p_query, '')), '\s+')) as tok
    where length(tok) >= 2
    limit 8
  loop
    v_esc := replace(replace(replace(v_tok, '\', '\\'), '%', '\%'), '_', '\_');
    if length(v_tok) >= 3 then
      v_conds := v_conds || format('f.folder_path ilike %L', '%' || v_esc || '%');
    else
      v_conds := v_conds || format(
        '(f.folder_path ilike %L or f.folder_path ilike %L or f.folder_path ilike %L'
        || ' or f.folder_path ilike %L or f.folder_path ilike %L or f.folder_path ilike %L'
        || ' or f.folder_path ilike %L or f.folder_path ilike %L)',
        v_esc || '%',  '%/' || v_esc || '%',  '% ' || v_esc || '%',
        '%.' || v_esc || '%', '%-' || v_esc || '%', '%\_' || v_esc || '%',
        '%(' || v_esc || '%', '%[' || v_esc || '%');
    end if;
  end loop;

  if array_length(v_conds, 1) is null then
    return;
  end if;

  v_where := 'f.folder_path is not null and ' || array_to_string(v_conds, ' and ');
  if p_videos_only then
    v_where := 'f.mime like ''video/%'' and ' || v_where;
  end if;

  -- the inner LIMIT bounds pathological broad queries; 20k matched files is
  -- far past the point where the folder list is useful anyway
  return query execute format(
    $q$
    with matches as materialized (
      select f.folder_path
      from files f
      where %s
      limit 20000
    )
    select m.folder_path, count(*) as n_files
    from matches m
    group by m.folder_path
    order by n_files desc, m.folder_path
    limit %s
    $q$,
    v_where, least(greatest(coalesce(p_limit, 200), 1), 1000));
end
$fn$;
