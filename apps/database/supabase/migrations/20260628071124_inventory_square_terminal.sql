alter table private.inventory_storefronts
  drop constraint if exists inventory_storefronts_checkout_mode_check;

alter table private.inventory_storefronts
  add constraint inventory_storefronts_checkout_mode_check
  check (checkout_mode in ('polar', 'square_terminal', 'simulated', 'disabled'));

alter table private.inventory_checkout_sessions
  add column if not exists checkout_provider text,
  add column if not exists square_environment text,
  add column if not exists square_location_id text,
  add column if not exists square_device_id text,
  add column if not exists square_order_id text,
  add column if not exists square_terminal_checkout_id text,
  add column if not exists square_payment_id text,
  add column if not exists square_receipt_url text,
  add column if not exists square_status text,
  add column if not exists square_idempotency_key text,
  add column if not exists square_failure_reason text,
  add column if not exists square_last_event_id text,
  add column if not exists square_last_synced_at timestamptz;

alter table private.inventory_checkout_sessions
  drop constraint if exists inventory_checkout_sessions_checkout_provider_check;

alter table private.inventory_checkout_sessions
  add constraint inventory_checkout_sessions_checkout_provider_check
  check (
    checkout_provider is null
    or checkout_provider in ('polar', 'square_terminal', 'simulated', 'disabled')
  );

alter table private.inventory_checkout_sessions
  drop constraint if exists inventory_checkout_sessions_square_environment_check;

alter table private.inventory_checkout_sessions
  add constraint inventory_checkout_sessions_square_environment_check
  check (square_environment is null or square_environment in ('sandbox', 'production'));

alter table private.inventory_checkout_sessions
  drop constraint if exists inventory_checkout_sessions_square_status_check;

alter table private.inventory_checkout_sessions
  add constraint inventory_checkout_sessions_square_status_check
  check (
    square_status is null
    or square_status in (
      'checkout_created',
      'pending',
      'in_progress',
      'paid',
      'completed',
      'cancelled',
      'canceled',
      'expired',
      'failed'
    )
  );

create unique index if not exists inventory_checkout_sessions_square_terminal_checkout_idx
  on private.inventory_checkout_sessions (square_terminal_checkout_id)
  where square_terminal_checkout_id is not null;

create unique index if not exists inventory_checkout_sessions_square_order_idx
  on private.inventory_checkout_sessions (square_order_id)
  where square_order_id is not null;

create unique index if not exists inventory_checkout_sessions_square_payment_idx
  on private.inventory_checkout_sessions (square_payment_id)
  where square_payment_id is not null;

create index if not exists inventory_checkout_sessions_square_status_idx
  on private.inventory_checkout_sessions (ws_id, square_status, created_at desc)
  where checkout_provider = 'square_terminal';

create table if not exists private.inventory_square_connections (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null,
  auth_method text not null default 'manual',
  merchant_id text,
  access_token_encrypted text not null,
  access_token_fingerprint text not null,
  access_token_last4 text,
  refresh_token_encrypted text,
  refresh_token_last4 text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  webhook_signature_key_encrypted text,
  webhook_signature_key_last4 text,
  status text not null default 'pending',
  last_validated_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_square_connections_environment_check
    check (environment in ('sandbox', 'production')),
  constraint inventory_square_connections_auth_method_check
    check (auth_method in ('oauth', 'manual')),
  constraint inventory_square_connections_status_check
    check (status in ('pending', 'ready', 'error', 'revoked')),
  constraint inventory_square_connections_ws_environment_key
    unique (ws_id, environment)
);

create index if not exists inventory_square_connections_ws_id_idx
  on private.inventory_square_connections (ws_id);

create index if not exists inventory_square_connections_merchant_idx
  on private.inventory_square_connections (merchant_id)
  where merchant_id is not null;

create table if not exists private.inventory_square_settings (
  ws_id uuid primary key references public.workspaces(id) on delete cascade,
  environment text not null default 'sandbox',
  location_id text,
  location_name text,
  device_id text,
  device_name text,
  sandbox_device_id text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_square_settings_environment_check
    check (environment in ('sandbox', 'production'))
);

create table if not exists private.inventory_square_devices (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null,
  location_id text,
  device_id text,
  device_name text,
  device_code_id text,
  pairing_code text,
  product_type text,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  paired_at timestamptz,
  last_seen_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_square_devices_environment_check
    check (environment in ('sandbox', 'production')),
  constraint inventory_square_devices_ws_device_key
    unique (ws_id, environment, device_id)
);

create index if not exists inventory_square_devices_ws_environment_idx
  on private.inventory_square_devices (ws_id, environment);

create unique index if not exists inventory_square_devices_code_id_idx
  on private.inventory_square_devices (device_code_id)
  where device_code_id is not null;

create table if not exists private.inventory_square_oauth_states (
  state text primary key,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null,
  created_by uuid references auth.users(id) on delete set null,
  return_to text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint inventory_square_oauth_states_environment_check
    check (environment in ('sandbox', 'production'))
);

create index if not exists inventory_square_oauth_states_ws_id_idx
  on private.inventory_square_oauth_states (ws_id);

alter table private.inventory_square_connections enable row level security;
alter table private.inventory_square_settings enable row level security;
alter table private.inventory_square_devices enable row level security;
alter table private.inventory_square_oauth_states enable row level security;

revoke all on table private.inventory_square_connections from anon, authenticated;
revoke all on table private.inventory_square_settings from anon, authenticated;
revoke all on table private.inventory_square_devices from anon, authenticated;
revoke all on table private.inventory_square_oauth_states from anon, authenticated;

grant all on table private.inventory_square_connections to service_role;
grant all on table private.inventory_square_settings to service_role;
grant all on table private.inventory_square_devices to service_role;
grant all on table private.inventory_square_oauth_states to service_role;

create or replace function private.get_inventory_checkout_by_public_token(
  p_public_token text
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with checkout_session as (
    select
      checkout.id,
      checkout.ws_id,
      checkout.public_token,
      checkout.status,
      checkout.checkout_provider,
      checkout.customer_auth_uid,
      checkout.customer_name,
      checkout.customer_email,
      checkout.customer_phone,
      checkout.note,
      checkout.currency,
      checkout.subtotal_amount,
      checkout.platform_fee_amount,
      checkout.processing_fee_estimate_amount,
      checkout.conversion_fee_estimate_amount,
      checkout.total_amount,
      checkout.expires_at,
      checkout.completed_at,
      checkout.finance_invoice_id,
      checkout.polar_checkout_id,
      checkout.polar_checkout_url,
      checkout.polar_environment,
      checkout.polar_order_id,
      checkout.polar_product_id,
      checkout.polar_status,
      checkout.square_environment,
      checkout.square_location_id,
      checkout.square_device_id,
      checkout.square_order_id,
      checkout.square_terminal_checkout_id,
      checkout.square_payment_id,
      checkout.square_receipt_url,
      checkout.square_status,
      checkout.square_failure_reason,
      checkout.square_last_synced_at
    from private.inventory_checkout_sessions checkout
    where checkout.public_token = p_public_token
    limit 1
  )
  select jsonb_build_object(
    'id', checkout_session.id,
    'wsId', checkout_session.ws_id,
    'publicToken', checkout_session.public_token,
    'status', checkout_session.status,
    'checkoutProvider', checkout_session.checkout_provider,
    'customerAuthUid', checkout_session.customer_auth_uid,
    'customerName', checkout_session.customer_name,
    'customerEmail', checkout_session.customer_email,
    'customerPhone', checkout_session.customer_phone,
    'note', checkout_session.note,
    'currency', checkout_session.currency,
    'subtotalAmount', checkout_session.subtotal_amount,
    'platformFeeAmount', checkout_session.platform_fee_amount,
    'processingFeeEstimateAmount', checkout_session.processing_fee_estimate_amount,
    'conversionFeeEstimateAmount', checkout_session.conversion_fee_estimate_amount,
    'totalAmount', checkout_session.total_amount,
    'expiresAt', checkout_session.expires_at::text,
    'completedAt', checkout_session.completed_at::text,
    'financeInvoiceId', checkout_session.finance_invoice_id,
    'polarCheckoutId', checkout_session.polar_checkout_id,
    'polarCheckoutUrl', checkout_session.polar_checkout_url,
    'polarEnvironment', checkout_session.polar_environment,
    'polarOrderId', checkout_session.polar_order_id,
    'polarProductId', checkout_session.polar_product_id,
    'polarStatus', checkout_session.polar_status,
    'squareEnvironment', checkout_session.square_environment,
    'squareLocationId', checkout_session.square_location_id,
    'squareDeviceId', checkout_session.square_device_id,
    'squareOrderId', checkout_session.square_order_id,
    'squareTerminalCheckoutId', checkout_session.square_terminal_checkout_id,
    'squarePaymentId', checkout_session.square_payment_id,
    'squareReceiptUrl', checkout_session.square_receipt_url,
    'squareStatus', checkout_session.square_status,
    'squareFailureReason', checkout_session.square_failure_reason,
    'squareLastSyncedAt', checkout_session.square_last_synced_at::text,
    'lines', coalesce(lines.items, '[]'::jsonb)
  )
  from checkout_session
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', line.id,
        'listingId', line.listing_id,
        'bundleId', line.bundle_id,
        'variantId', line.variant_id,
        'productId', line.product_id,
        'unitId', line.unit_id,
        'warehouseId', line.warehouse_id,
        'title', line.title,
        'quantity', line.quantity::int,
        'unitPrice', line.unit_price,
        'subtotalAmount', line.subtotal_amount
      )
      order by line.created_at asc
    ) as items
    from private.inventory_checkout_lines line
    where line.checkout_session_id = checkout_session.id
  ) lines on true;
$$;

create or replace function private.list_inventory_checkouts(
  p_ws_id uuid,
  p_search text default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  total_count integer,
  checkout jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      checkout.id,
      checkout.ws_id,
      checkout.public_token,
      checkout.status,
      checkout.checkout_provider,
      checkout.customer_auth_uid,
      checkout.customer_name,
      checkout.customer_email,
      checkout.customer_phone,
      checkout.note,
      checkout.currency,
      checkout.subtotal_amount,
      checkout.platform_fee_amount,
      checkout.processing_fee_estimate_amount,
      checkout.conversion_fee_estimate_amount,
      checkout.total_amount,
      checkout.expires_at,
      checkout.completed_at,
      checkout.finance_invoice_id,
      checkout.polar_checkout_id,
      checkout.polar_checkout_url,
      checkout.polar_environment,
      checkout.polar_order_id,
      checkout.polar_product_id,
      checkout.polar_status,
      checkout.square_environment,
      checkout.square_location_id,
      checkout.square_device_id,
      checkout.square_order_id,
      checkout.square_terminal_checkout_id,
      checkout.square_payment_id,
      checkout.square_receipt_url,
      checkout.square_status,
      checkout.square_failure_reason,
      checkout.square_last_synced_at,
      checkout.created_at
    from private.inventory_checkout_sessions checkout
    where checkout.ws_id = p_ws_id
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or checkout.status = p_status
      )
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or checkout.customer_name ilike '%' || p_search || '%'
        or checkout.customer_email ilike '%' || p_search || '%'
        or checkout.public_token ilike '%' || p_search || '%'
        or checkout.square_order_id ilike '%' || p_search || '%'
        or checkout.square_terminal_checkout_id ilike '%' || p_search || '%'
        or checkout.square_payment_id ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    case
      when paged.id is null then null
      else jsonb_build_object(
        'id', paged.id,
        'wsId', paged.ws_id,
        'publicToken', paged.public_token,
        'status', paged.status,
        'checkoutProvider', paged.checkout_provider,
        'customerAuthUid', paged.customer_auth_uid,
        'customerName', paged.customer_name,
        'customerEmail', paged.customer_email,
        'customerPhone', paged.customer_phone,
        'note', paged.note,
        'currency', paged.currency,
        'subtotalAmount', paged.subtotal_amount,
        'platformFeeAmount', paged.platform_fee_amount,
        'processingFeeEstimateAmount', paged.processing_fee_estimate_amount,
        'conversionFeeEstimateAmount', paged.conversion_fee_estimate_amount,
        'totalAmount', paged.total_amount,
        'expiresAt', paged.expires_at::text,
        'completedAt', paged.completed_at::text,
        'financeInvoiceId', paged.finance_invoice_id,
        'polarCheckoutId', paged.polar_checkout_id,
        'polarCheckoutUrl', paged.polar_checkout_url,
        'polarEnvironment', paged.polar_environment,
        'polarOrderId', paged.polar_order_id,
        'polarProductId', paged.polar_product_id,
        'polarStatus', paged.polar_status,
        'squareEnvironment', paged.square_environment,
        'squareLocationId', paged.square_location_id,
        'squareDeviceId', paged.square_device_id,
        'squareOrderId', paged.square_order_id,
        'squareTerminalCheckoutId', paged.square_terminal_checkout_id,
        'squarePaymentId', paged.square_payment_id,
        'squareReceiptUrl', paged.square_receipt_url,
        'squareStatus', paged.square_status,
        'squareFailureReason', paged.square_failure_reason,
        'squareLastSyncedAt', paged.square_last_synced_at::text,
        'lines', coalesce(lines.items, '[]'::jsonb)
      )
    end as checkout
  from counted
  left join paged on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', line.id,
        'listingId', line.listing_id,
        'bundleId', line.bundle_id,
        'variantId', line.variant_id,
        'productId', line.product_id,
        'unitId', line.unit_id,
        'warehouseId', line.warehouse_id,
        'title', line.title,
        'quantity', line.quantity::integer,
        'unitPrice', line.unit_price,
        'subtotalAmount', line.subtotal_amount
      )
      order by line.created_at asc
    ) as items
    from private.inventory_checkout_lines line
    where line.checkout_session_id = paged.id
  ) lines on true;
$$;

create or replace function public.complete_inventory_checkout_session_square_payment(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_square_payment_id text,
  p_square_order_id text default null,
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
    and ws_id = p_ws_id
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
    checkout_provider = coalesce(checkout_provider, 'square_terminal'),
    square_payment_id = coalesce(nullif(p_square_payment_id, ''), square_payment_id),
    square_order_id = coalesce(nullif(p_square_order_id, ''), square_order_id),
    square_status = 'paid',
    square_last_synced_at = p_now,
    completed_at = p_now,
    updated_at = p_now
  where id = checkout_row.id
    and ws_id = checkout_row.ws_id;

  update private.inventory_settlement_ledger_entries
  set provider_ref = coalesce(
    nullif(p_square_payment_id, ''),
    nullif(p_square_order_id, ''),
    provider_ref
  )
  where checkout_session_id = checkout_row.id
    and provider_ref is null;

  return checkout_row.id;
end;
$$;

create or replace function private.complete_inventory_checkout_session_square_payment(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_square_payment_id text,
  p_square_order_id text default null,
  p_now timestamptz default now()
) returns uuid
language sql
volatile
security definer
set search_path = private, public, pg_temp
as $$
  select public.complete_inventory_checkout_session_square_payment(
    p_checkout_id := p_checkout_id,
    p_ws_id := p_ws_id,
    p_square_payment_id := p_square_payment_id,
    p_square_order_id := p_square_order_id,
    p_now := p_now
  );
$$;

revoke all on function private.get_inventory_checkout_by_public_token(text)
  from public, anon, authenticated;

revoke all on function private.list_inventory_checkouts(
  uuid,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

revoke all on function public.complete_inventory_checkout_session_square_payment(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

revoke all on function private.complete_inventory_checkout_session_square_payment(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function private.get_inventory_checkout_by_public_token(text)
  to service_role;

grant execute on function private.list_inventory_checkouts(
  uuid,
  text,
  text,
  integer,
  integer
) to service_role;

grant execute on function public.complete_inventory_checkout_session_square_payment(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) to service_role;

grant execute on function private.complete_inventory_checkout_session_square_payment(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) to service_role;

notify pgrst, 'reload schema';
