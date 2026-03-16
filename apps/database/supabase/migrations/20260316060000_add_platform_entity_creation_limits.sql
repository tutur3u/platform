create table if not exists public.platform_entity_creation_limits (
  table_name text not null,
  tier public.workspace_product_tier not null,
  enabled boolean not null default false,
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
  'Manual opt-in table for entity creation limits enforced by a shared before insert trigger. The table stores per-tier thresholds while counting sources are provided by dedicated entity_limit_source__<table> views.';

create or replace function public._resolve_workspace_tier(
  p_ws_id uuid
)
returns public.workspace_product_tier
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ws_id uuid;
  v_effective_tier public.workspace_product_tier;
begin
  select id, ws.tier
  into v_ws_id, v_effective_tier
  from public.workspaces
  left join public.workspace_subscriptions ws on ws.ws_id = public.workspaces.id and ws.status = 'active'
  where id = p_ws_id
  limit 1;

  if v_ws_id is null then
    return null;
  end if;

  if v_effective_tier is null then
    return 'FREE'::public.workspace_product_tier;
  end if;

  return v_effective_tier;
end;
$$;

create or replace function public._resolve_user_personal_workspace_id(
  p_user_id uuid
)
returns uuid
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
    and w.creator_id = p_user_id
  order by w.created_at asc
  limit 1;

  return v_personal_ws_id;
end;
$$;

create or replace function public._validate_platform_entity_limit_target(
  p_target_table text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_view_name text;
begin
  if p_target_table is null or btrim(p_target_table) = '' then
    raise exception 'TARGET_TABLE_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_target_table = 'platform_entity_creation_limits' then
    raise exception 'TARGET_TABLE_NOT_ALLOWED'
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

  v_source_view_name := format('entity_limit_source__%s', p_target_table);

  perform 1
  from information_schema.views
  where table_schema = 'public'
    and table_name = v_source_view_name;

  if not found then
    raise exception 'TARGET_TABLE_REQUIRES_SOURCE_VIEW'
      using errcode = 'P0001';
  end if;

  if p_target_table = 'workspaces' then
    perform 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_source_view_name
      and c.column_name = 'personal_ws_id'
      and c.data_type = 'uuid';

    if not found then
      raise exception 'SOURCE_VIEW_REQUIRES_PERSONAL_WS_ID_UUID'
        using errcode = 'P0001';
    end if;
  else
    perform 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_source_view_name
      and c.column_name = 'ws_id'
      and c.data_type = 'uuid';

    if not found then
      raise exception 'SOURCE_VIEW_REQUIRES_WS_ID_UUID'
        using errcode = 'P0001';
    end if;
  end if;

  perform 1
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = v_source_view_name
    and c.column_name = 'user_id'
    and c.data_type = 'uuid';

  if not found then
    raise exception 'SOURCE_VIEW_REQUIRES_USER_ID_UUID'
      using errcode = 'P0001';
  end if;

  perform 1
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = v_source_view_name
    and c.column_name = 'created_at'
    and c.data_type = 'timestamp with time zone';

  if not found then
    raise exception 'SOURCE_VIEW_REQUIRES_CREATED_AT_TIMESTAMPTZ'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public._resolve_platform_entity_limit_scope(
  p_target_table text,
  p_new_record jsonb,
  p_actor_user_id uuid
)
returns table (
  ws_id uuid,
  user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope_resolver_name text;
  v_scope_resolver_signature regprocedure;
  v_lookup_user_id uuid;
  v_user_id uuid;
  v_ws_id uuid;
begin
  v_lookup_user_id := coalesce(
    nullif(p_new_record ->> 'user_id', '')::uuid,
    nullif(p_new_record ->> 'creator_id', '')::uuid,
    p_actor_user_id
  );

  v_scope_resolver_name := format('entity_limit_scope__%s', p_target_table);
  select to_regprocedure(format('public.%I(jsonb,uuid)', v_scope_resolver_name))
  into v_scope_resolver_signature;

  if v_scope_resolver_signature is not null then
    execute format(
      'select s.ws_id, s.user_id from public.%I($1, $2) s limit 1',
      v_scope_resolver_name
    )
    into v_ws_id, v_user_id
    using p_new_record, p_actor_user_id;
  else
    v_ws_id := nullif(p_new_record ->> 'ws_id', '')::uuid;
    v_user_id := v_lookup_user_id;
  end if;

  v_user_id := coalesce(v_user_id, v_lookup_user_id);
  v_ws_id := coalesce(v_ws_id, nullif(p_new_record ->> 'ws_id', '')::uuid);

  return query select v_ws_id, v_user_id;
end;
$$;

create or replace function public.enforce_platform_entity_creation_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit_row public.platform_entity_creation_limits%rowtype;
  v_actor_user_id uuid;
  v_effective_tier public.workspace_product_tier;
  v_subject_ws_id uuid;
  v_subject_user_id uuid;
  v_subject_bucket text;
  v_source_view_name text;
  v_personal_ws_id uuid;
  v_source_ws_column text;
  v_source_where_base text;
  v_count bigint;
  v_actor_role text;
  v_is_service_role boolean;
begin
  v_actor_user_id := auth.uid();
  v_actor_role := auth.role();
  v_is_service_role := v_actor_role = 'service_role';

  if v_actor_user_id is null and not v_is_service_role then
    raise exception 'ENTITY_LIMIT_AUTH_REQUIRED'
      using errcode = 'P0001';
  end if;

  if v_actor_user_id is null then
    v_actor_user_id := (to_jsonb(new) ->> 'creator_id')::uuid;
  end if;

  if v_actor_user_id is null then
    if v_is_service_role then
      return new;
    end if;

    raise exception 'ENTITY_LIMIT_ACTOR_REQUIRED'
      using errcode = 'P0001';
  end if;

  select s.ws_id, s.user_id
  into v_subject_ws_id, v_subject_user_id
  from public._resolve_platform_entity_limit_scope(
    tg_table_name,
    to_jsonb(new),
    v_actor_user_id
  ) s;

  if v_subject_user_id is null then
    v_subject_user_id := v_actor_user_id;
  end if;

  if tg_table_name <> 'workspaces' and v_subject_ws_id is null then
    raise exception 'ENTITY_LIMIT_WS_ID_REQUIRED'
      using errcode = 'P0001';
  end if;

  if tg_table_name = 'workspaces' then
    -- Tie workspace limits to the creator's personal workspace id when available.
    v_personal_ws_id := public._resolve_user_personal_workspace_id(v_subject_user_id);

    if v_personal_ws_id is not null then
      v_subject_ws_id := v_personal_ws_id;
    end if;
  end if;

  if v_subject_ws_id is not null then
    v_effective_tier := public._resolve_workspace_tier(v_subject_ws_id);
  end if;

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

  v_subject_bucket := coalesce(v_subject_ws_id::text, 'none') || ':' || coalesce(v_subject_user_id::text, 'none');
  perform pg_advisory_xact_lock(hashtext(tg_table_name), hashtext(v_subject_bucket));

  v_source_view_name := format('entity_limit_source__%s', tg_table_name);
  v_source_ws_column := 'ws_id';

  if tg_table_name = 'workspaces' then
    v_source_ws_column := 'personal_ws_id';
  end if;

  v_source_where_base := format(
    '($1 is null or src.%I is not distinct from $1) and src.user_id is not distinct from $2',
    v_source_ws_column
  );

  if v_limit_row.total_limit is not null then
    execute format(
      'select count(*) from public.%I src where %s',
      v_source_view_name,
      v_source_where_base
    )
    into v_count
    using v_subject_ws_id, v_subject_user_id;

    if v_count >= v_limit_row.total_limit then
      raise exception 'ENTITY_TOTAL_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_table_name = 'workspaces' then
    return new;
  end if;

  if v_limit_row.per_hour is not null then
    execute format(
      'select count(*) from public.%I src where %s and src.created_at >= $3',
      v_source_view_name,
      v_source_where_base
    )
    into v_count
    using v_subject_ws_id, v_subject_user_id, now() - interval '1 hour';

    if v_count >= v_limit_row.per_hour then
      raise exception 'ENTITY_HOURLY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_day is not null then
    execute format(
      'select count(*) from public.%I src where %s and src.created_at >= $3',
      v_source_view_name,
      v_source_where_base
    )
    into v_count
    using v_subject_ws_id, v_subject_user_id, now() - interval '1 day';

    if v_count >= v_limit_row.per_day then
      raise exception 'ENTITY_DAILY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_week is not null then
    execute format(
      'select count(*) from public.%I src where %s and src.created_at >= $3',
      v_source_view_name,
      v_source_where_base
    )
    into v_count
    using v_subject_ws_id, v_subject_user_id, now() - interval '7 days';

    if v_count >= v_limit_row.per_week then
      raise exception 'ENTITY_WEEKLY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_month is not null then
    execute format(
      'select count(*) from public.%I src where %s and src.created_at >= $3',
      v_source_view_name,
      v_source_where_base
    )
    into v_count
    using v_subject_ws_id, v_subject_user_id, now() - interval '30 days';

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
  p_notes text default null,
  p_updated_by uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._validate_platform_entity_limit_target(p_target_table);

  insert into public.platform_entity_creation_limits (
    table_name,
    tier,
    enabled,
    notes,
    updated_by
  )
  values
    (p_target_table, 'FREE', false, p_notes, p_updated_by),
    (p_target_table, 'PLUS', false, p_notes, p_updated_by),
    (p_target_table, 'PRO', false, p_notes, p_updated_by),
    (p_target_table, 'ENTERPRISE', false, p_notes, p_updated_by);

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
  p_notes text default null,
  p_updated_by uuid default auth.uid()
)
returns setof public.platform_entity_creation_limits
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._validate_platform_entity_limit_target(p_target_table);

  update public.platform_entity_creation_limits
  set notes = p_notes,
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

  perform public._validate_platform_entity_limit_target(p_target_table);

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
  with candidate_tables as (
    select t.table_name,
           format('entity_limit_source__%s', t.table_name) as source_view_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and t.table_name <> 'platform_entity_creation_limits'
  ),
  valid_views as (
    select c.table_name
    from candidate_tables c
    join information_schema.views v
      on v.table_schema = 'public'
     and v.table_name = c.source_view_name
    where (
      exists (
        select 1
        from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.source_view_name
          and col.column_name = 'ws_id'
          and col.data_type = 'uuid'
      )
      or exists (
        select 1
        from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.source_view_name
          and col.column_name = 'personal_ws_id'
          and col.data_type = 'uuid'
      )
    )
      and exists (
      select 1
      from information_schema.columns col
      where col.table_schema = 'public'
        and col.table_name = c.source_view_name
        and col.column_name = 'user_id'
        and col.data_type = 'uuid'
    )
      and exists (
      select 1
      from information_schema.columns col
      where col.table_schema = 'public'
        and col.table_name = c.source_view_name
        and col.column_name = 'created_at'
        and col.data_type = 'timestamp with time zone'
    )
  )
  select v.table_name
  from valid_views v
  where not exists (
    select 1
    from public.platform_entity_creation_limits l
    where l.table_name = v.table_name
  )
  order by v.table_name;
$$;

revoke all on table public.platform_entity_creation_limits from anon, authenticated;

revoke all on function public._resolve_workspace_tier(uuid) from public, anon, authenticated;
revoke all on function public._resolve_user_personal_workspace_id(uuid) from public, anon, authenticated;
revoke all on function public._validate_platform_entity_limit_target(text) from public, anon, authenticated;
revoke all on function public._resolve_platform_entity_limit_scope(text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.enforce_platform_entity_creation_limits() from public, anon, authenticated;
revoke all on function public.add_platform_entity_creation_limit_table(text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_platform_entity_creation_limit_metadata(text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_platform_entity_creation_limit_tier(text, public.workspace_product_tier, boolean, integer, integer, integer, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.reattach_platform_entity_creation_limit_trigger(text) from public, anon, authenticated;
revoke all on function public.get_available_platform_entity_limit_tables() from public, anon, authenticated;

grant select, insert, update, delete on table public.platform_entity_creation_limits to service_role;

grant execute on function public._resolve_workspace_tier(uuid) to service_role;
grant execute on function public._resolve_user_personal_workspace_id(uuid) to service_role;
grant execute on function public._validate_platform_entity_limit_target(text) to service_role;
grant execute on function public._resolve_platform_entity_limit_scope(text, jsonb, uuid) to service_role;
grant execute on function public.enforce_platform_entity_creation_limits() to service_role;
grant execute on function public.add_platform_entity_creation_limit_table(text, text, uuid) to service_role;
grant execute on function public.update_platform_entity_creation_limit_metadata(text, text, uuid) to service_role;
grant execute on function public.update_platform_entity_creation_limit_tier(text, public.workspace_product_tier, boolean, integer, integer, integer, integer, integer, uuid) to service_role;
grant execute on function public.reattach_platform_entity_creation_limit_trigger(text) to service_role;
grant execute on function public.get_available_platform_entity_limit_tables() to service_role;
