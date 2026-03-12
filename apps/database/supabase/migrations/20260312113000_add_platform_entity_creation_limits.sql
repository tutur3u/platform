create table if not exists public.platform_entity_creation_limits (
  table_name text not null,
  tier public.workspace_product_tier not null,
  enabled boolean not null default false,
  ownership_scope text not null,
  resolver_key text not null,
  per_hour integer,
  per_day integer,
  per_week integer,
  per_month integer,
  total_limit integer,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users (id) on delete set null,
  constraint platform_entity_creation_limits_pkey primary key (table_name, tier),
  constraint platform_entity_creation_limits_ownership_scope_check check (
    ownership_scope in ('workspace', 'user', 'workspace_user')
  ),
  constraint platform_entity_creation_limits_per_hour_check check (
    per_hour is null or per_hour > 0
  ),
  constraint platform_entity_creation_limits_per_day_check check (
    per_day is null or per_day > 0
  ),
  constraint platform_entity_creation_limits_per_week_check check (
    per_week is null or per_week > 0
  ),
  constraint platform_entity_creation_limits_per_month_check check (
    per_month is null or per_month > 0
  ),
  constraint platform_entity_creation_limits_total_limit_check check (
    total_limit is null or total_limit > 0
  )
);

alter table public.platform_entity_creation_limits enable row level security;

comment on table public.platform_entity_creation_limits is
  'Manual opt-in table for generic entity creation limits enforced by a shared before insert trigger.';

create or replace function public._resolve_user_personal_workspace_tier(
  p_user_id uuid
)
returns public.workspace_product_tier
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_personal_ws_id uuid;
begin
  select w.id
  into v_personal_ws_id
  from public.workspaces w
  where w.personal is true
    and w.created_by = p_user_id
  order by w.created_at asc
  limit 1;

  if v_personal_ws_id is null then
    return 'FREE'::public.workspace_product_tier;
  end if;

  return public._resolve_workspace_tier(v_personal_ws_id);
end;
$$;

create or replace function public._validate_platform_entity_limit_target(
  p_target_table text,
  p_ownership_scope text,
  p_resolver_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resolver_keys text[];
  v_expected_key_count integer;
  v_column_name text;
begin
  if p_target_table is null or btrim(p_target_table) = '' then
    raise exception 'TARGET_TABLE_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_target_table = 'platform_entity_creation_limits' then
    raise exception 'TARGET_TABLE_NOT_ALLOWED'
      using errcode = 'P0001';
  end if;

  if p_ownership_scope not in ('workspace', 'user', 'workspace_user') then
    raise exception 'INVALID_OWNERSHIP_SCOPE'
      using errcode = 'P0001';
  end if;

  perform 1
  from information_schema.tables
  where table_schema = 'public'
    and table_type = 'BASE TABLE'
    and table_name = p_target_table;

  if not found then
    raise exception 'TARGET_TABLE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  perform 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = p_target_table
    and column_name = 'created_at';

  if not found then
    raise exception 'TARGET_TABLE_REQUIRES_CREATED_AT'
      using errcode = 'P0001';
  end if;

  v_resolver_keys := regexp_split_to_array(
    regexp_replace(coalesce(p_resolver_key, ''), '\s+', '', 'g'),
    ','
  );

  v_expected_key_count := case
    when p_ownership_scope = 'workspace_user' then 2
    else 1
  end;

  if array_length(v_resolver_keys, 1) is distinct from v_expected_key_count then
    raise exception 'INVALID_RESOLVER_KEY_COUNT'
      using errcode = 'P0001';
  end if;

  foreach v_column_name in array v_resolver_keys loop
    perform 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_target_table
      and column_name = v_column_name
      and data_type = 'uuid';

    if not found then
      raise exception 'RESOLVER_COLUMN_NOT_FOUND_OR_NOT_UUID'
        using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

create or replace function public.enforce_platform_entity_creation_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata record;
  v_limit_row public.platform_entity_creation_limits%rowtype;
  v_new_row jsonb;
  v_resolver_keys text[];
  v_subject_bucket text;
  v_effective_tier public.workspace_product_tier;
  v_workspace_id_text text;
  v_user_id_text text;
  v_where_clause text;
  v_count bigint;
begin
  select *
  into v_metadata
  from public.platform_entity_creation_limits
  where table_name = tg_table_name
  order by case tier
    when 'FREE' then 1
    when 'PLUS' then 2
    when 'PRO' then 3
    when 'ENTERPRISE' then 4
    else 5
  end
  limit 1;

  if not found then
    return new;
  end if;

  v_new_row := to_jsonb(new);
  v_resolver_keys := regexp_split_to_array(
    regexp_replace(v_metadata.resolver_key, '\s+', '', 'g'),
    ','
  );

  case v_metadata.ownership_scope
    when 'workspace' then
      v_workspace_id_text := nullif(v_new_row ->> v_resolver_keys[1], '');

      if v_workspace_id_text is null then
        return new;
      end if;

      v_subject_bucket := v_workspace_id_text;
      v_effective_tier := public._resolve_workspace_tier(v_workspace_id_text::uuid);
      v_where_clause := format('%I = %L', v_resolver_keys[1], v_workspace_id_text);
    when 'user' then
      v_user_id_text := nullif(v_new_row ->> v_resolver_keys[1], '');

      if v_user_id_text is null then
        return new;
      end if;

      v_subject_bucket := v_user_id_text;
      v_effective_tier := public._resolve_user_personal_workspace_tier(v_user_id_text::uuid);
      v_where_clause := format('%I = %L', v_resolver_keys[1], v_user_id_text);
    when 'workspace_user' then
      v_workspace_id_text := nullif(v_new_row ->> v_resolver_keys[1], '');
      v_user_id_text := nullif(v_new_row ->> v_resolver_keys[2], '');

      if v_workspace_id_text is null or v_user_id_text is null then
        return new;
      end if;

      v_subject_bucket := v_workspace_id_text || ':' || v_user_id_text;
      v_effective_tier := public._resolve_workspace_tier(v_workspace_id_text::uuid);
      v_where_clause := format(
        '%I = %L and %I = %L',
        v_resolver_keys[1],
        v_workspace_id_text,
        v_resolver_keys[2],
        v_user_id_text
      );
    else
      raise exception 'UNSUPPORTED_OWNERSHIP_SCOPE'
        using errcode = 'P0001';
  end case;

  select *
  into v_limit_row
  from public.platform_entity_creation_limits
  where table_name = tg_table_name
    and tier = v_effective_tier
    and enabled is true
  limit 1;

  if not found then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(tg_table_name), hashtext(v_subject_bucket));

  if v_limit_row.total_limit is not null then
    execute format(
      'select count(*) from public.%I where %s',
      tg_table_name,
      v_where_clause
    )
    into v_count;

    if v_count >= v_limit_row.total_limit then
      raise exception 'ENTITY_TOTAL_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_hour is not null then
    execute format(
      'select count(*) from public.%I where %s and created_at >= now() - interval ''1 hour''',
      tg_table_name,
      v_where_clause
    )
    into v_count;

    if v_count >= v_limit_row.per_hour then
      raise exception 'ENTITY_HOURLY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_day is not null then
    execute format(
      'select count(*) from public.%I where %s and created_at >= now() - interval ''1 day''',
      tg_table_name,
      v_where_clause
    )
    into v_count;

    if v_count >= v_limit_row.per_day then
      raise exception 'ENTITY_DAILY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_week is not null then
    execute format(
      'select count(*) from public.%I where %s and created_at >= now() - interval ''7 days''',
      tg_table_name,
      v_where_clause
    )
    into v_count;

    if v_count >= v_limit_row.per_week then
      raise exception 'ENTITY_WEEKLY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_month is not null then
    execute format(
      'select count(*) from public.%I where %s and created_at >= now() - interval ''30 days''',
      tg_table_name,
      v_where_clause
    )
    into v_count;

    if v_count >= v_limit_row.per_month then
      raise exception 'ENTITY_MONTHLY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.add_platform_entity_creation_limit_table(
  p_target_table text,
  p_ownership_scope text,
  p_resolver_key text,
  p_notes text default null,
  p_updated_by uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._validate_platform_entity_limit_target(
    p_target_table,
    p_ownership_scope,
    p_resolver_key
  );

  insert into public.platform_entity_creation_limits (
    table_name,
    tier,
    enabled,
    ownership_scope,
    resolver_key,
    notes,
    updated_by
  )
  values
    (p_target_table, 'FREE', false, p_ownership_scope, p_resolver_key, p_notes, p_updated_by),
    (p_target_table, 'PLUS', false, p_ownership_scope, p_resolver_key, p_notes, p_updated_by),
    (p_target_table, 'PRO', false, p_ownership_scope, p_resolver_key, p_notes, p_updated_by),
    (p_target_table, 'ENTERPRISE', false, p_ownership_scope, p_resolver_key, p_notes, p_updated_by);

  execute format(
    'drop trigger if exists enforce_platform_entity_creation_limits on public.%I',
    p_target_table
  );

  execute format(
    'create trigger enforce_platform_entity_creation_limits before insert on public.%I for each row execute function public.enforce_platform_entity_creation_limits()',
    p_target_table
  );
end;
$$;

create or replace function public.update_platform_entity_creation_limit_metadata(
  p_target_table text,
  p_ownership_scope text,
  p_resolver_key text,
  p_notes text default null,
  p_updated_by uuid default auth.uid()
)
returns setof public.platform_entity_creation_limits
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._validate_platform_entity_limit_target(
    p_target_table,
    p_ownership_scope,
    p_resolver_key
  );

  update public.platform_entity_creation_limits
  set ownership_scope = p_ownership_scope,
      resolver_key = p_resolver_key,
      notes = p_notes,
      updated_at = timezone('utc', now()),
      updated_by = p_updated_by
  where table_name = p_target_table;

  return query
  select *
  from public.platform_entity_creation_limits
  where table_name = p_target_table
  order by case tier
    when 'FREE' then 1
    when 'PLUS' then 2
    when 'PRO' then 3
    when 'ENTERPRISE' then 4
    else 5
  end;
end;
$$;

create or replace function public.update_platform_entity_creation_limit_tier(
  p_target_table text,
  p_tier public.workspace_product_tier,
  p_enabled boolean,
  p_per_hour integer default null,
  p_per_day integer default null,
  p_per_week integer default null,
  p_per_month integer default null,
  p_total_limit integer default null,
  p_updated_by uuid default auth.uid()
)
returns public.platform_entity_creation_limits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_entity_creation_limits%rowtype;
begin
  update public.platform_entity_creation_limits
  set enabled = p_enabled,
      per_hour = p_per_hour,
      per_day = p_per_day,
      per_week = p_per_week,
      per_month = p_per_month,
      total_limit = p_total_limit,
      updated_at = timezone('utc', now()),
      updated_by = p_updated_by
  where table_name = p_target_table
    and tier = p_tier
  returning * into v_row;

  if v_row.table_name is null then
    raise exception 'ENTITY_LIMIT_ROW_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

create or replace function public.reattach_platform_entity_creation_limit_trigger(
  p_target_table text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_any_row public.platform_entity_creation_limits%rowtype;
begin
  select *
  into v_any_row
  from public.platform_entity_creation_limits
  where table_name = p_target_table
  limit 1;

  if v_any_row.table_name is null then
    raise exception 'ENTITY_LIMIT_TABLE_NOT_CONFIGURED'
      using errcode = 'P0001';
  end if;

  perform public._validate_platform_entity_limit_target(
    p_target_table,
    v_any_row.ownership_scope,
    v_any_row.resolver_key
  );

  execute format(
    'drop trigger if exists enforce_platform_entity_creation_limits on public.%I',
    p_target_table
  );

  execute format(
    'create trigger enforce_platform_entity_creation_limits before insert on public.%I for each row execute function public.enforce_platform_entity_creation_limits()',
    p_target_table
  );
end;
$$;

create or replace function public.get_available_platform_entity_limit_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path = public
as $$
  select t.table_name
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and t.table_name <> 'platform_entity_creation_limits'
    and exists (
      select 1
      from information_schema.columns c
      where c.table_schema = t.table_schema
        and c.table_name = t.table_name
        and c.column_name = 'created_at'
    )
    and not exists (
      select 1
      from public.platform_entity_creation_limits l
      where l.table_name = t.table_name
    )
  order by t.table_name;
$$;

revoke all on table public.platform_entity_creation_limits from anon, authenticated;

revoke all on function public._resolve_user_personal_workspace_tier(uuid) from public, anon, authenticated;
revoke all on function public._validate_platform_entity_limit_target(text, text, text) from public, anon, authenticated;
revoke all on function public.enforce_platform_entity_creation_limits() from public, anon, authenticated;
revoke all on function public.add_platform_entity_creation_limit_table(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_platform_entity_creation_limit_metadata(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_platform_entity_creation_limit_tier(text, public.workspace_product_tier, boolean, integer, integer, integer, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.reattach_platform_entity_creation_limit_trigger(text) from public, anon, authenticated;
revoke all on function public.get_available_platform_entity_limit_tables() from public, anon, authenticated;

grant select, insert, update, delete on table public.platform_entity_creation_limits to service_role;
grant execute on function public._resolve_user_personal_workspace_tier(uuid) to service_role;
grant execute on function public._validate_platform_entity_limit_target(text, text, text) to service_role;
grant execute on function public.enforce_platform_entity_creation_limits() to service_role;
grant execute on function public.add_platform_entity_creation_limit_table(text, text, text, text, uuid) to service_role;
grant execute on function public.update_platform_entity_creation_limit_metadata(text, text, text, text, uuid) to service_role;
grant execute on function public.update_platform_entity_creation_limit_tier(text, public.workspace_product_tier, boolean, integer, integer, integer, integer, integer, uuid) to service_role;
grant execute on function public.reattach_platform_entity_creation_limit_trigger(text) to service_role;
grant execute on function public.get_available_platform_entity_limit_tables() to service_role;