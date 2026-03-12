alter table public.platform_entity_creation_limits
  drop constraint if exists platform_entity_creation_limits_ownership_scope_check,
  drop column if exists ownership_scope,
  drop column if exists resolver_key;

comment on table public.platform_entity_creation_limits is
  'Manual opt-in table for per-user entity creation limits enforced by a shared before insert trigger using the authenticated actor and their personal workspace tier.';

create or replace function public._validate_platform_entity_limit_target(
  p_target_table text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  perform 1
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_trigger tg on tg.tgrelid = c.oid
  where n.nspname = 'public'
    and c.relname = p_target_table
    and tg.tgname = 'audit_i_u_d'
    and tg.tgisinternal is false;

  if not found then
    raise exception 'TARGET_TABLE_REQUIRES_AUDIT_TRACKING'
      using errcode = 'P0001';
  end if;
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
  v_subject_bucket text;
  v_count bigint;
begin
  v_actor_user_id := auth.uid();

  if v_actor_user_id is null then
    raise exception 'ENTITY_LIMIT_AUTH_REQUIRED'
      using errcode = 'P0001';
  end if;

  v_effective_tier := public._resolve_user_personal_workspace_tier(v_actor_user_id);

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

  v_subject_bucket := v_actor_user_id::text;

  perform pg_advisory_xact_lock(hashtext(tg_table_name), hashtext(v_subject_bucket));

  if v_limit_row.total_limit is not null then
    select count(*)
    into v_count
    from audit.record_version arv
    where arv.table_schema = 'public'
      and arv.table_name = tg_table_name
      and arv.op = 'INSERT'::audit.operation
      and arv.auth_uid = v_actor_user_id;

    if v_count >= v_limit_row.total_limit then
      raise exception 'ENTITY_TOTAL_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_hour is not null then
    select count(*)
    into v_count
    from audit.record_version arv
    where arv.table_schema = 'public'
      and arv.table_name = tg_table_name
      and arv.op = 'INSERT'::audit.operation
      and arv.auth_uid = v_actor_user_id
      and arv.ts >= now() - interval '1 hour';

    if v_count >= v_limit_row.per_hour then
      raise exception 'ENTITY_HOURLY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_day is not null then
    select count(*)
    into v_count
    from audit.record_version arv
    where arv.table_schema = 'public'
      and arv.table_name = tg_table_name
      and arv.op = 'INSERT'::audit.operation
      and arv.auth_uid = v_actor_user_id
      and arv.ts >= now() - interval '1 day';

    if v_count >= v_limit_row.per_day then
      raise exception 'ENTITY_DAILY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_week is not null then
    select count(*)
    into v_count
    from audit.record_version arv
    where arv.table_schema = 'public'
      and arv.table_name = tg_table_name
      and arv.op = 'INSERT'::audit.operation
      and arv.auth_uid = v_actor_user_id
      and arv.ts >= now() - interval '7 days';

    if v_count >= v_limit_row.per_week then
      raise exception 'ENTITY_WEEKLY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_limit_row.per_month is not null then
    select count(*)
    into v_count
    from audit.record_version arv
    where arv.table_schema = 'public'
      and arv.table_name = tg_table_name
      and arv.op = 'INSERT'::audit.operation
      and arv.auth_uid = v_actor_user_id
      and arv.ts >= now() - interval '30 days';

    if v_count >= v_limit_row.per_month then
      raise exception 'ENTITY_MONTHLY_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop function if exists public._validate_platform_entity_limit_target(text, text, text);
drop function if exists public.add_platform_entity_creation_limit_table(text, text, text, text, uuid);
drop function if exists public.update_platform_entity_creation_limit_metadata(text, text, text, text, uuid);

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
  select t.table_name
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and t.table_name <> 'platform_entity_creation_limits'
    and exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_trigger tg on tg.tgrelid = c.oid
      where n.nspname = t.table_schema
        and c.relname = t.table_name
        and tg.tgname = 'audit_i_u_d'
        and tg.tgisinternal is false
    )
    and not exists (
      select 1
      from public.platform_entity_creation_limits l
      where l.table_name = t.table_name
    )
  order by t.table_name;
$$;

revoke all on function public._validate_platform_entity_limit_target(text) from public, anon, authenticated;
revoke all on function public.add_platform_entity_creation_limit_table(text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_platform_entity_creation_limit_metadata(text, text, uuid) from public, anon, authenticated;

grant execute on function public._validate_platform_entity_limit_target(text) to service_role;
grant execute on function public.add_platform_entity_creation_limit_table(text, text, uuid) to service_role;
grant execute on function public.update_platform_entity_creation_limit_metadata(text, text, uuid) to service_role;
