alter table private.inventory_storefronts
  add column if not exists visibility text not null default 'public';

alter table private.inventory_storefronts
  drop constraint if exists inventory_storefronts_visibility_check;

alter table private.inventory_storefronts
  add constraint inventory_storefronts_visibility_check
  check (visibility in ('public', 'private'));

alter table private.inventory_checkout_sessions
  add column if not exists polar_checkout_id text,
  add column if not exists polar_order_id text,
  add column if not exists polar_environment text,
  add column if not exists polar_product_id text,
  add column if not exists polar_checkout_url text,
  add column if not exists polar_status text;

alter table private.inventory_checkout_sessions
  drop constraint if exists inventory_checkout_sessions_polar_environment_check;

alter table private.inventory_checkout_sessions
  add constraint inventory_checkout_sessions_polar_environment_check
  check (polar_environment is null or polar_environment in ('sandbox', 'production'));

alter table private.inventory_checkout_sessions
  drop constraint if exists inventory_checkout_sessions_polar_status_check;

alter table private.inventory_checkout_sessions
  add constraint inventory_checkout_sessions_polar_status_check
  check (
    polar_status is null
    or polar_status in ('pending', 'checkout_created', 'paid', 'failed', 'cancelled', 'expired')
  );

create unique index if not exists inventory_checkout_sessions_polar_checkout_id_idx
  on private.inventory_checkout_sessions (polar_checkout_id)
  where polar_checkout_id is not null;

create unique index if not exists inventory_checkout_sessions_polar_order_id_idx
  on private.inventory_checkout_sessions (polar_order_id)
  where polar_order_id is not null;

create table if not exists private.inventory_polar_integrations (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null,
  access_token_encrypted text not null,
  access_token_fingerprint text not null,
  access_token_last4 text,
  polar_product_id text,
  polar_product_name text not null default 'Tuturuuu Inventory Checkout',
  status text not null default 'pending',
  last_validated_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_polar_integrations_environment_check
    check (environment in ('sandbox', 'production')),
  constraint inventory_polar_integrations_status_check
    check (status in ('pending', 'ready', 'error')),
  constraint inventory_polar_integrations_ws_environment_key
    unique (ws_id, environment)
);

create index if not exists inventory_polar_integrations_ws_id_idx
  on private.inventory_polar_integrations (ws_id);

create table if not exists private.inventory_polar_settings (
  ws_id uuid primary key references public.workspaces(id) on delete cascade,
  testing_environment text not null default 'sandbox',
  production_environment text not null default 'production',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_polar_settings_testing_environment_check
    check (testing_environment in ('sandbox', 'production')),
  constraint inventory_polar_settings_production_environment_check
    check (production_environment in ('sandbox', 'production'))
);

alter table private.inventory_polar_integrations enable row level security;
alter table private.inventory_polar_settings enable row level security;

revoke all on table private.inventory_polar_integrations from anon, authenticated;
revoke all on table private.inventory_polar_settings from anon, authenticated;
grant all on table private.inventory_polar_integrations to service_role;
grant all on table private.inventory_polar_settings to service_role;

create or replace function public.complete_inventory_checkout_session_payment(
  p_checkout_id uuid,
  p_polar_order_id text,
  p_now timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
begin
  select *
  into checkout_row
  from private.inventory_checkout_sessions
  where id = p_checkout_id
  for update;

  if not found then
    raise exception 'CHECKOUT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if checkout_row.status = 'completed' then
    return checkout_row.id;
  end if;

  if checkout_row.status <> 'reserved' then
    raise exception 'CHECKOUT_NOT_RESERVED'
      using errcode = 'P0001';
  end if;

  update private.inventory_reservations
  set
    status = 'consumed',
    released_at = p_now
  where checkout_session_id = checkout_row.id
    and status = 'reserved';

  update private.inventory_checkout_sessions
  set
    status = 'completed',
    polar_order_id = coalesce(nullif(p_polar_order_id, ''), polar_order_id),
    polar_status = 'paid',
    completed_at = p_now,
    updated_at = p_now
  where id = checkout_row.id;

  update private.inventory_settlement_ledger_entries
  set provider_ref = coalesce(nullif(p_polar_order_id, ''), provider_ref)
  where checkout_session_id = checkout_row.id
    and provider_ref is null;

  return checkout_row.id;
end;
$$;

revoke all on function public.complete_inventory_checkout_session_payment(
  uuid,
  text,
  timestamptz
) from public;

grant execute on function public.complete_inventory_checkout_session_payment(
  uuid,
  text,
  timestamptz
) to service_role;

notify pgrst, 'reload schema';
