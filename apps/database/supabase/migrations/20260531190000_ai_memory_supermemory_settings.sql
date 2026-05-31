create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.ai_memory_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  enabled boolean not null default true,
  product_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ws_id)
);

create table if not exists private.ai_memory_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null check (
    action in ('backfill', 'delete', 'export', 'settings_update')
  ),
  product text,
  memory_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.ai_memory_backfill_runs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'succeeded', 'failed')
  ),
  source text not null default 'mira_memories',
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_memory_settings_user_ws_idx
  on private.ai_memory_settings (user_id, ws_id);

create index if not exists ai_memory_audit_user_ws_created_idx
  on private.ai_memory_audit (user_id, ws_id, created_at desc);

create index if not exists ai_memory_backfill_runs_status_created_idx
  on private.ai_memory_backfill_runs (status, created_at desc);

drop trigger if exists ai_memory_settings_set_updated_at
  on private.ai_memory_settings;
create trigger ai_memory_settings_set_updated_at
  before update on private.ai_memory_settings
  for each row execute function public.update_updated_at_column();

drop trigger if exists ai_memory_backfill_runs_set_updated_at
  on private.ai_memory_backfill_runs;
create trigger ai_memory_backfill_runs_set_updated_at
  before update on private.ai_memory_backfill_runs
  for each row execute function public.update_updated_at_column();

alter table private.ai_memory_settings enable row level security;
alter table private.ai_memory_audit enable row level security;
alter table private.ai_memory_backfill_runs enable row level security;

drop policy if exists "Service role can manage ai memory settings"
  on private.ai_memory_settings;
create policy "Service role can manage ai memory settings"
  on private.ai_memory_settings
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage ai memory audit"
  on private.ai_memory_audit;
create policy "Service role can manage ai memory audit"
  on private.ai_memory_audit
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage ai memory backfill runs"
  on private.ai_memory_backfill_runs;
create policy "Service role can manage ai memory backfill runs"
  on private.ai_memory_backfill_runs
  for all
  to service_role
  using (true)
  with check (true);

create or replace function private.get_ai_memory_settings(
  p_user_id uuid,
  p_ws_id uuid,
  p_product text default null
)
returns table (
  enabled boolean,
  product_enabled boolean,
  products jsonb
)
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_products jsonb;
  v_enabled boolean;
begin
  if not exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = p_user_id
      and wm.ws_id = p_ws_id
  ) then
    enabled := false;
    product_enabled := false;
    products := '{}'::jsonb;
    return next;
    return;
  end if;

  select s.enabled, s.product_settings
  into v_enabled, v_products
  from private.ai_memory_settings s
  where s.user_id = p_user_id
    and s.ws_id = p_ws_id;

  enabled := coalesce(v_enabled, true);
  products := coalesce(v_products, '{}'::jsonb);
  product_enabled := case
    when p_product is null then true
    when products ? p_product then coalesce((products ->> p_product)::boolean, true)
    else true
  end;

  return next;
end;
$$;

create or replace function private.upsert_ai_memory_settings(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_ws_id uuid,
  p_enabled boolean,
  p_product_settings jsonb default '{}'::jsonb
)
returns table (
  enabled boolean,
  product_enabled boolean,
  products jsonb
)
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if p_actor_user_id <> p_user_id then
    if not exists (
      select 1
      from public.workspace_members wm
      where wm.user_id = p_actor_user_id
        and wm.ws_id = p_ws_id
        and wm.role in ('OWNER', 'ADMIN')
    ) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  elsif not exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = p_user_id
      and wm.ws_id = p_ws_id
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into private.ai_memory_settings (
    user_id,
    ws_id,
    enabled,
    product_settings
  )
  values (
    p_user_id,
    p_ws_id,
    coalesce(p_enabled, true),
    coalesce(p_product_settings, '{}'::jsonb)
  )
  on conflict (user_id, ws_id)
  do update set
    enabled = excluded.enabled,
    product_settings = excluded.product_settings,
    updated_at = now();

  insert into private.ai_memory_audit (
    user_id,
    ws_id,
    actor_user_id,
    action,
    metadata
  )
  values (
    p_user_id,
    p_ws_id,
    p_actor_user_id,
    'settings_update',
    jsonb_build_object(
      'enabled', coalesce(p_enabled, true),
      'product_settings', coalesce(p_product_settings, '{}'::jsonb)
    )
  );

  return query
  select *
  from private.get_ai_memory_settings(p_user_id, p_ws_id, null);
end;
$$;

create or replace function private.record_ai_memory_audit(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_ws_id uuid,
  p_action text,
  p_product text default null,
  p_memory_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = p_actor_user_id
      and wm.ws_id = p_ws_id
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into private.ai_memory_audit (
    user_id,
    ws_id,
    actor_user_id,
    action,
    product,
    memory_id,
    metadata
  )
  values (
    p_user_id,
    p_ws_id,
    p_actor_user_id,
    p_action,
    p_product,
    p_memory_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function private.create_ai_memory_backfill_run(
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
    from public.users u
    where u.id = p_actor_user_id
      and u.email ilike '%@tuturuuu.com'
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into private.ai_memory_backfill_runs (actor_user_id)
  values (p_actor_user_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on table private.ai_memory_settings from public, anon, authenticated;
revoke all on table private.ai_memory_audit from public, anon, authenticated;
revoke all on table private.ai_memory_backfill_runs from public, anon, authenticated;
grant all on table private.ai_memory_settings to service_role;
grant all on table private.ai_memory_audit to service_role;
grant all on table private.ai_memory_backfill_runs to service_role;

revoke all on function private.get_ai_memory_settings(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function private.upsert_ai_memory_settings(
  uuid,
  uuid,
  uuid,
  boolean,
  jsonb
) from public, anon, authenticated;
revoke all on function private.record_ai_memory_audit(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;
revoke all on function private.create_ai_memory_backfill_run(uuid)
  from public, anon, authenticated;

grant execute on function private.get_ai_memory_settings(uuid, uuid, text)
  to service_role;
grant execute on function private.upsert_ai_memory_settings(
  uuid,
  uuid,
  uuid,
  boolean,
  jsonb
) to service_role;
grant execute on function private.record_ai_memory_audit(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb
) to service_role;
grant execute on function private.create_ai_memory_backfill_run(uuid)
  to service_role;

comment on table private.ai_memory_settings is
  'Server-owned Supermemory user/workspace settings and product toggles.';
comment on table private.ai_memory_audit is
  'Server-owned audit trail for Supermemory settings, exports, deletes, and backfills.';
comment on table private.ai_memory_backfill_runs is
  'Server-owned run ledger for importing legacy Mira memories into Supermemory.';
