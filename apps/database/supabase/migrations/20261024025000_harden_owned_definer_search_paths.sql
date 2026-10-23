-- A definer path may contain only schemas where PUBLIC, anon and authenticated
-- lack CREATE, with pg_temp explicitly last. Empty and catalog-only paths are
-- unsafe: implicit pg_temp can shadow relation AND type names. Inherited paths,
-- $user and nonexistent schemas are never trusted.
-- These are the exposed schemas in supabase/config.toml (plus public).
-- Revoke CREATE, preserving USAGE and existing object grants.
revoke create on schema public from public, anon, authenticated;
-- The exact-body smoke call also requires unambiguous selected column names.
CREATE OR REPLACE FUNCTION public.atomic_sync_token_operation(
  p_ws_id uuid,
  p_calendar_id TEXT DEFAULT 'primary',
  p_operation TEXT DEFAULT 'get', -- 'get', 'update', 'clear'
  p_sync_token TEXT DEFAULT NULL
)
RETURNS TABLE(
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
set search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_sync_token TEXT;
  v_last_synced_at TIMESTAMPTZ;
BEGIN
  IF p_operation = 'get' THEN
    SELECT
      css.sync_token,
      css.last_synced_at
    INTO v_sync_token, v_last_synced_at
    FROM public.calendar_sync_states css
    WHERE ws_id = p_ws_id
      AND calendar_id = p_calendar_id
    FOR UPDATE NOWAIT; -- NOWAIT prevents blocking if row is already locked
    RETURN QUERY SELECT
      COALESCE(v_sync_token, ''),
      COALESCE(v_last_synced_at, NOW()),
      TRUE,
      'Sync token retrieved successfully';
  ELSIF p_operation = 'update' THEN
    INSERT INTO public.calendar_sync_states (ws_id, calendar_id, sync_token, last_synced_at)
    VALUES (p_ws_id, p_calendar_id, p_sync_token, NOW())
    ON CONFLICT (ws_id, calendar_id)
    DO UPDATE SET
      sync_token = EXCLUDED.sync_token,
      last_synced_at = EXCLUDED.last_synced_at;
    RETURN QUERY SELECT
      p_sync_token,
      NOW(),
      TRUE,
      'Sync token updated successfully';
  ELSIF p_operation = 'clear' THEN
    DELETE FROM public.calendar_sync_states
    WHERE ws_id = p_ws_id
      AND calendar_id = p_calendar_id;
    RETURN QUERY SELECT
      '',
      NOW(),
      TRUE,
      'Sync token cleared successfully';
  ELSE
    RETURN QUERY SELECT
      '',
      NOW(),
      FALSE,
      'Invalid operation specified';
  END IF;
EXCEPTION
  WHEN lock_not_available THEN
    RETURN QUERY SELECT
      '',
      NOW(),
      FALSE,
      'Row is locked by another process, try again later';
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      '',
      NOW(),
      FALSE,
      'Error: ' || SQLERRM;
END;
$$;

create function pg_temp.security_definer_path_is_safe(path_setting text)
returns boolean
language plpgsql stable
set search_path = pg_catalog, pg_temp
as $path_check$
declare
  schemas text[];
  schema_name text;
  schema_oid oid;
  position integer;
begin
  if path_setting is null then return false; end if;
  if btrim(path_setting) in ('', '""') then return false; end if;
  schemas := regexp_split_to_array(path_setting, '\s*,\s*');
  for position in 1..cardinality(schemas) loop
    schema_name := btrim(schemas[position]);
    if schema_name ~ '^"([^".,]|"")*"$' then
      schema_name := replace(substr(schema_name, 2, length(schema_name) - 2), '""', '"');
    else
      schema_name := lower(schema_name);
    end if;
    schemas[position] := schema_name;
  end loop;
  if schemas[cardinality(schemas)] <> 'pg_temp' then return false; end if;
  for position in 1..cardinality(schemas) loop
    schema_name := schemas[position];
    if schema_name = 'pg_temp' then
      if position <> cardinality(schemas) then return false; end if;
      continue;
    end if;
    if schema_name = '$user' or schema_name = '' then return false; end if;
    select n.oid into schema_oid from pg_namespace n where n.nspname = schema_name;
    if schema_oid is null then return false; end if;
    if coalesce(has_schema_privilege(to_regrole('anon'), schema_oid, 'CREATE'), true)
      or coalesce(has_schema_privilege(to_regrole('authenticated'), schema_oid, 'CREATE'), true)
      or exists (
        select 1 from pg_namespace n,
          lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
        where n.oid = schema_oid and acl.grantee = 0 and acl.privilege_type = 'CREATE'
      ) then return false;
    end if;
  end loop;
  return true;
end;
$path_check$;

do $harden$
declare
  fn record;
  existing_path text;
  candidate_path text;
  schema_name text;
begin
  -- Supabase-managed namespaces and extension functions remain provider-owned.
  for fn in
    select n.nspname, p.proname, pg_get_userbyid(p.proowner) as owner, p.proconfig
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private','storage','graphql_public')
      and p.prosecdef and p.prokind='f'
      and (not pg_has_role(current_user,p.proowner,'USAGE')
        or n.nspname in ('storage','graphql_public')
        or exists (select 1 from pg_catalog.pg_depend d where d.classid='pg_proc'::regclass
          and d.objid=p.oid and d.deptype='e'))
  loop
    raise notice 'Provider-owned definer left unchanged: %.% owner=% proconfig=%',
      fn.nspname,fn.proname,fn.owner,fn.proconfig;
  end loop;
  for fn in
    select p.oid, n.nspname, p.proname, p.prosrc,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
      (select substr(setting, 13) from unnest(p.proconfig) setting
        where setting like 'search_path=%') as path_setting
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'storage', 'graphql_public')
      and p.prosecdef and p.prokind = 'f'
      and pg_has_role(current_user, p.proowner, 'USAGE')
      and n.nspname not in ('storage', 'graphql_public')
      and not exists (select 1 from pg_catalog.pg_depend d
        where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    order by n.nspname, p.proname, p.oid
  loop
    if pg_temp.security_definer_path_is_safe(fn.path_setting) then continue; end if;
    -- Qualified bodies retain catalog lookup while making pg_temp explicit last.
    if (fn.path_setting is not null
      and btrim(fn.path_setting) in ('', '""', 'pg_catalog', '"pg_catalog"'))
      or fn.oid in (to_regprocedure('public.add_ws_creator()'),
        to_regprocedure('public.claim_workspace_creator_when_missing()')) then
      execute format('alter function %I.%I(%s) set search_path = pg_catalog, pg_temp',
        fn.nspname, fn.proname, fn.arguments);
      continue;
    end if;
    -- Preserve required lookup for unreviewed invoker dependency chains rather
    -- than infer qualification from text. Every retained schema is checked.
    existing_path := coalesce(fn.path_setting,
      case when fn.nspname = 'public' then 'public, extensions'
        else format('%I, public, extensions', fn.nspname) end);
    candidate_path := '';
    foreach schema_name in array regexp_split_to_array(existing_path, '\s*,\s*') loop
      schema_name := btrim(schema_name, ' "');
      if schema_name in ('pg_temp', '$user', '') then continue; end if;
      -- Missing entries never resolved an object; omit them rather than trust a
      -- schema that could be created later. Writable existing schemas fail closed.
      if not exists (select 1 from pg_catalog.pg_namespace n where n.nspname = schema_name) then continue; end if;
      if not pg_temp.security_definer_path_is_safe(format('%I, pg_temp', schema_name)) then
        raise exception 'Untrusted definer schema % in %.%(%)',
          schema_name, fn.nspname, fn.proname, fn.arguments;
      end if;
      candidate_path := candidate_path || format('%I, ', schema_name);
    end loop;
    candidate_path := candidate_path || 'pg_temp';
    execute format('alter function %I.%I(%s) set search_path to %s',
      fn.nspname, fn.proname, fn.arguments, candidate_path);
  end loop;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'storage', 'graphql_public')
      and p.prosecdef and p.prokind = 'f'
      and pg_has_role(current_user, p.proowner, 'USAGE')
      and n.nspname not in ('storage', 'graphql_public')
      and not exists (select 1 from pg_catalog.pg_depend d
        where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
      and not pg_temp.security_definer_path_is_safe((
        select substr(setting, 13) from unnest(p.proconfig) setting
        where setting like 'search_path=%'
      ))
  ) then raise exception 'Unsafe exposed SECURITY DEFINER search path remains'; end if;
end;
$harden$;
drop function pg_temp.security_definer_path_is_safe(text);
notify pgrst, 'reload schema';
