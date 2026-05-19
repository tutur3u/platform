create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

create table if not exists private.inventory_storefronts (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  status text not null default 'draft' check (
    status in ('draft', 'published', 'paused', 'archived')
  ),
  hero_image_url text,
  accent_color text,
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (slug),
  unique (ws_id, slug)
);

create table if not exists private.inventory_bundles (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  storefront_id uuid references private.inventory_storefronts(id) on delete set null,
  slug text not null,
  name text not null,
  description text,
  image_url text,
  price bigint not null default 0 check (price >= 0),
  status text not null default 'draft' check (
    status in ('draft', 'active', 'paused', 'archived')
  ),
  max_per_order integer not null default 99 check (max_per_order > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (ws_id, slug)
);

create table if not exists private.inventory_storefront_listings (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references private.inventory_storefronts(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  listing_type text not null default 'product' check (
    listing_type in ('product', 'bundle')
  ),
  product_id uuid references public.workspace_products(id) on delete cascade,
  unit_id uuid references public.inventory_units(id) on delete restrict,
  warehouse_id uuid references public.inventory_warehouses(id) on delete restrict,
  bundle_id uuid references private.inventory_bundles(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  price bigint not null default 0 check (price >= 0),
  compare_at_price bigint check (
    compare_at_price is null or compare_at_price >= 0
  ),
  status text not null default 'draft' check (
    status in ('draft', 'published', 'paused', 'archived')
  ),
  sort_order integer not null default 0,
  max_per_order integer not null default 99 check (max_per_order > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint inventory_storefront_listings_target_check check (
    (
      listing_type = 'product'
      and product_id is not null
      and unit_id is not null
      and warehouse_id is not null
      and bundle_id is null
    )
    or (
      listing_type = 'bundle'
      and bundle_id is not null
      and product_id is null
      and unit_id is null
      and warehouse_id is null
    )
  )
);

create table if not exists private.inventory_bundle_components (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references private.inventory_bundles(id) on delete cascade,
  product_id uuid not null references public.workspace_products(id) on delete cascade,
  unit_id uuid not null references public.inventory_units(id) on delete restrict,
  warehouse_id uuid not null references public.inventory_warehouses(id) on delete restrict,
  quantity bigint not null check (quantity > 0),
  created_at timestamptz default now(),
  unique (bundle_id, product_id, unit_id, warehouse_id)
);

create table if not exists private.inventory_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  storefront_id uuid not null references private.inventory_storefronts(id) on delete restrict,
  public_token text not null default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'reserved' check (
    status in ('reserved', 'completed', 'cancelled', 'expired')
  ),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  note text,
  currency text not null default 'USD',
  subtotal_amount bigint not null default 0 check (subtotal_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  platform_fee_amount bigint not null default 0 check (platform_fee_amount >= 0),
  processing_fee_estimate_amount bigint not null default 0 check (
    processing_fee_estimate_amount >= 0
  ),
  conversion_fee_estimate_amount bigint not null default 0 check (
    conversion_fee_estimate_amount >= 0
  ),
  total_amount bigint not null default 0 check (total_amount >= 0),
  expires_at timestamptz not null,
  finance_invoice_id uuid references public.finance_invoices(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  unique (public_token)
);

create table if not exists private.inventory_checkout_lines (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null references private.inventory_checkout_sessions(id) on delete cascade,
  listing_id uuid references private.inventory_storefront_listings(id) on delete set null,
  bundle_id uuid references private.inventory_bundles(id) on delete set null,
  product_id uuid not null references public.workspace_products(id) on delete restrict,
  unit_id uuid not null references public.inventory_units(id) on delete restrict,
  warehouse_id uuid not null references public.inventory_warehouses(id) on delete restrict,
  title text not null,
  quantity bigint not null check (quantity > 0),
  unit_price bigint not null default 0 check (unit_price >= 0),
  subtotal_amount bigint not null default 0 check (subtotal_amount >= 0),
  created_at timestamptz default now()
);

create table if not exists private.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null references private.inventory_checkout_sessions(id) on delete cascade,
  checkout_line_id uuid not null references private.inventory_checkout_lines(id) on delete cascade,
  product_id uuid not null references public.workspace_products(id) on delete restrict,
  unit_id uuid not null references public.inventory_units(id) on delete restrict,
  warehouse_id uuid not null references public.inventory_warehouses(id) on delete restrict,
  amount bigint not null check (amount > 0),
  status text not null default 'reserved' check (
    status in ('reserved', 'released', 'consumed', 'expired')
  ),
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  released_at timestamptz
);

create table if not exists private.inventory_settlement_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  checkout_session_id uuid not null references private.inventory_checkout_sessions(id) on delete cascade,
  finance_invoice_id uuid references public.finance_invoices(id) on delete set null,
  entry_kind text not null check (
    entry_kind in (
      'subtotal',
      'discount',
      'platform_fee_estimate',
      'processing_fee_estimate',
      'conversion_fee_estimate',
      'total',
      'payout'
    )
  ),
  amount bigint not null,
  currency text not null default 'USD',
  source text not null default 'estimate' check (
    source in ('estimate', 'actual', 'manual')
  ),
  provider_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists inventory_storefronts_ws_status_idx
  on private.inventory_storefronts (ws_id, status);
create index if not exists inventory_storefronts_slug_status_idx
  on private.inventory_storefronts (slug, status);
create index if not exists inventory_storefront_listings_storefront_status_idx
  on private.inventory_storefront_listings (
    storefront_id,
    status,
    sort_order,
    created_at
  );
create index if not exists inventory_storefront_listings_product_idx
  on private.inventory_storefront_listings (product_id, unit_id, warehouse_id)
  where product_id is not null;
create index if not exists inventory_bundles_ws_status_idx
  on private.inventory_bundles (ws_id, status);
create index if not exists inventory_checkout_sessions_ws_status_idx
  on private.inventory_checkout_sessions (ws_id, status, created_at desc);
create index if not exists inventory_checkout_sessions_public_token_idx
  on private.inventory_checkout_sessions (public_token);
create index if not exists inventory_reservations_stock_active_idx
  on private.inventory_reservations (
    product_id,
    unit_id,
    warehouse_id,
    status,
    expires_at
  );
create index if not exists inventory_settlement_entries_checkout_idx
  on private.inventory_settlement_ledger_entries (checkout_session_id);

alter table private.inventory_storefronts enable row level security;
alter table private.inventory_storefront_listings enable row level security;
alter table private.inventory_bundles enable row level security;
alter table private.inventory_bundle_components enable row level security;
alter table private.inventory_checkout_sessions enable row level security;
alter table private.inventory_checkout_lines enable row level security;
alter table private.inventory_reservations enable row level security;
alter table private.inventory_settlement_ledger_entries enable row level security;

drop policy if exists "Service role can manage inventory storefronts"
  on private.inventory_storefronts;
create policy "Service role can manage inventory storefronts"
  on private.inventory_storefronts
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory storefront listings"
  on private.inventory_storefront_listings;
create policy "Service role can manage inventory storefront listings"
  on private.inventory_storefront_listings
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory bundles"
  on private.inventory_bundles;
create policy "Service role can manage inventory bundles"
  on private.inventory_bundles
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory bundle components"
  on private.inventory_bundle_components;
create policy "Service role can manage inventory bundle components"
  on private.inventory_bundle_components
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory checkouts"
  on private.inventory_checkout_sessions;
create policy "Service role can manage inventory checkouts"
  on private.inventory_checkout_sessions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory checkout lines"
  on private.inventory_checkout_lines;
create policy "Service role can manage inventory checkout lines"
  on private.inventory_checkout_lines
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory reservations"
  on private.inventory_reservations;
create policy "Service role can manage inventory reservations"
  on private.inventory_reservations
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory settlement entries"
  on private.inventory_settlement_ledger_entries;
create policy "Service role can manage inventory settlement entries"
  on private.inventory_settlement_ledger_entries
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table private.inventory_storefronts
  from public, anon, authenticated;
revoke all on table private.inventory_storefront_listings
  from public, anon, authenticated;
revoke all on table private.inventory_bundles
  from public, anon, authenticated;
revoke all on table private.inventory_bundle_components
  from public, anon, authenticated;
revoke all on table private.inventory_checkout_sessions
  from public, anon, authenticated;
revoke all on table private.inventory_checkout_lines
  from public, anon, authenticated;
revoke all on table private.inventory_reservations
  from public, anon, authenticated;
revoke all on table private.inventory_settlement_ledger_entries
  from public, anon, authenticated;

grant all on table private.inventory_storefronts to service_role;
grant all on table private.inventory_storefront_listings to service_role;
grant all on table private.inventory_bundles to service_role;
grant all on table private.inventory_bundle_components to service_role;
grant all on table private.inventory_checkout_sessions to service_role;
grant all on table private.inventory_checkout_lines to service_role;
grant all on table private.inventory_reservations to service_role;
grant all on table private.inventory_settlement_ledger_entries to service_role;

drop trigger if exists inventory_storefronts_updated_at
  on private.inventory_storefronts;
create trigger inventory_storefronts_updated_at
  before update
  on private.inventory_storefronts
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists inventory_storefront_listings_updated_at
  on private.inventory_storefront_listings;
create trigger inventory_storefront_listings_updated_at
  before update
  on private.inventory_storefront_listings
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists inventory_bundles_updated_at
  on private.inventory_bundles;
create trigger inventory_bundles_updated_at
  before update
  on private.inventory_bundles
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists inventory_checkout_sessions_updated_at
  on private.inventory_checkout_sessions;
create trigger inventory_checkout_sessions_updated_at
  before update
  on private.inventory_checkout_sessions
  for each row
  execute function public.update_updated_at_column();

create or replace function public._inventory_reserved_quantity(
  p_product_id uuid,
  p_unit_id uuid,
  p_warehouse_id uuid,
  p_now timestamptz default now()
) returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::bigint
  from private.inventory_reservations
  where product_id = p_product_id
    and unit_id = p_unit_id
    and warehouse_id = p_warehouse_id
    and status = 'reserved'
    and expires_at > p_now;
$$;

create or replace function public._inventory_create_reserved_line(
  p_checkout_id uuid,
  p_listing_id uuid,
  p_bundle_id uuid,
  p_product_id uuid,
  p_unit_id uuid,
  p_warehouse_id uuid,
  p_title text,
  p_quantity bigint,
  p_unit_price bigint,
  p_expires_at timestamptz,
  p_now timestamptz
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_row public.inventory_products%rowtype;
  reserved_quantity bigint;
  available_quantity bigint;
  new_line_id uuid;
  line_subtotal bigint;
begin
  select *
  into stock_row
  from public.inventory_products
  where product_id = p_product_id
    and unit_id = p_unit_id
    and warehouse_id = p_warehouse_id
  for update;

  if not found then
    raise exception 'INVENTORY_STOCK_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  reserved_quantity := public._inventory_reserved_quantity(
    p_product_id,
    p_unit_id,
    p_warehouse_id,
    p_now
  );
  available_quantity := coalesce(stock_row.amount, 0) - reserved_quantity;

  if available_quantity < p_quantity then
    raise exception 'INSUFFICIENT_STOCK'
      using errcode = 'P0001';
  end if;

  line_subtotal := p_quantity * p_unit_price;

  insert into private.inventory_checkout_lines (
    checkout_session_id,
    listing_id,
    bundle_id,
    product_id,
    unit_id,
    warehouse_id,
    title,
    quantity,
    unit_price,
    subtotal_amount
  )
  values (
    p_checkout_id,
    p_listing_id,
    p_bundle_id,
    p_product_id,
    p_unit_id,
    p_warehouse_id,
    p_title,
    p_quantity,
    p_unit_price,
    line_subtotal
  )
  returning id into new_line_id;

  insert into private.inventory_reservations (
    checkout_session_id,
    checkout_line_id,
    product_id,
    unit_id,
    warehouse_id,
    amount,
    status,
    expires_at
  )
  values (
    p_checkout_id,
    new_line_id,
    p_product_id,
    p_unit_id,
    p_warehouse_id,
    p_quantity,
    'reserved',
    p_expires_at
  );

  return line_subtotal;
end;
$$;

create or replace function public.create_inventory_checkout_session(
  p_storefront_slug text,
  p_payload jsonb,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  storefront_row private.inventory_storefronts%rowtype;
  checkout_row private.inventory_checkout_sessions%rowtype;
  line_payload jsonb;
  quantity bigint;
  subtotal bigint := 0;
  expires_at timestamptz := p_now + interval '15 minutes';
  listing_row private.inventory_storefront_listings%rowtype;
  bundle_row private.inventory_bundles%rowtype;
  component_row record;
  bundle_component_index integer;
begin
  select *
  into storefront_row
  from private.inventory_storefronts
  where slug = p_storefront_slug
    and status = 'published'
  limit 1;

  if not found then
    raise exception 'STOREFRONT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_payload -> 'lines') <> 'array'
    or jsonb_array_length(p_payload -> 'lines') = 0 then
    raise exception 'CHECKOUT_LINES_REQUIRED'
      using errcode = 'P0001';
  end if;

  insert into private.inventory_checkout_sessions (
    ws_id,
    storefront_id,
    customer_name,
    customer_email,
    customer_phone,
    note,
    currency,
    status,
    expires_at
  )
  values (
    storefront_row.ws_id,
    storefront_row.id,
    coalesce(nullif(p_payload ->> 'customerName', ''), 'Guest'),
    lower(coalesce(nullif(p_payload ->> 'customerEmail', ''), 'guest@example.com')),
    nullif(p_payload ->> 'customerPhone', ''),
    nullif(p_payload ->> 'note', ''),
    storefront_row.currency,
    'reserved',
    expires_at
  )
  returning * into checkout_row;

  for line_payload in
    select value
    from jsonb_array_elements(p_payload -> 'lines')
  loop
    quantity := greatest(coalesce((line_payload ->> 'quantity')::bigint, 1), 1);

    if line_payload ? 'listingId' or line_payload ? 'listing_id' then
      select *
      into listing_row
      from private.inventory_storefront_listings
      where id = coalesce(
          nullif(line_payload ->> 'listingId', '')::uuid,
          nullif(line_payload ->> 'listing_id', '')::uuid
        )
        and storefront_id = storefront_row.id
        and status = 'published'
      limit 1;

      if not found then
        raise exception 'LISTING_NOT_FOUND'
          using errcode = 'P0001';
      end if;

      if quantity > listing_row.max_per_order then
        raise exception 'LISTING_MAX_PER_ORDER_EXCEEDED'
          using errcode = 'P0001';
      end if;

      if listing_row.listing_type = 'product' then
        subtotal := subtotal + public._inventory_create_reserved_line(
          checkout_row.id,
          listing_row.id,
          null,
          listing_row.product_id,
          listing_row.unit_id,
          listing_row.warehouse_id,
          listing_row.title,
          quantity,
          listing_row.price,
          expires_at,
          p_now
        );
      else
        select *
        into bundle_row
        from private.inventory_bundles
        where id = listing_row.bundle_id
          and status = 'active'
        limit 1;

        if not found then
          raise exception 'BUNDLE_NOT_FOUND'
            using errcode = 'P0001';
        end if;

        bundle_component_index := 0;
        for component_row in
          select
            component.*,
            product.name as product_name
          from private.inventory_bundle_components component
          join public.workspace_products product
            on product.id = component.product_id
          where component.bundle_id = bundle_row.id
          order by component.created_at, component.id
        loop
          bundle_component_index := bundle_component_index + 1;
          subtotal := subtotal + public._inventory_create_reserved_line(
            checkout_row.id,
            listing_row.id,
            bundle_row.id,
            component_row.product_id,
            component_row.unit_id,
            component_row.warehouse_id,
            bundle_row.name || ' - ' || component_row.product_name,
            quantity * component_row.quantity,
            case when bundle_component_index = 1 then listing_row.price else 0 end,
            expires_at,
            p_now
          );
        end loop;
      end if;
    elsif line_payload ? 'bundleId' or line_payload ? 'bundle_id' then
      select *
      into bundle_row
      from private.inventory_bundles
      where id = coalesce(
          nullif(line_payload ->> 'bundleId', '')::uuid,
          nullif(line_payload ->> 'bundle_id', '')::uuid
        )
        and ws_id = storefront_row.ws_id
        and status = 'active'
      limit 1;

      if not found then
        raise exception 'BUNDLE_NOT_FOUND'
          using errcode = 'P0001';
      end if;

      if quantity > bundle_row.max_per_order then
        raise exception 'BUNDLE_MAX_PER_ORDER_EXCEEDED'
          using errcode = 'P0001';
      end if;

      bundle_component_index := 0;
      for component_row in
        select
          component.*,
          product.name as product_name
        from private.inventory_bundle_components component
        join public.workspace_products product
          on product.id = component.product_id
        where component.bundle_id = bundle_row.id
        order by component.created_at, component.id
      loop
        bundle_component_index := bundle_component_index + 1;
        subtotal := subtotal + public._inventory_create_reserved_line(
          checkout_row.id,
          null,
          bundle_row.id,
          component_row.product_id,
          component_row.unit_id,
          component_row.warehouse_id,
          bundle_row.name || ' - ' || component_row.product_name,
          quantity * component_row.quantity,
          case when bundle_component_index = 1 then bundle_row.price else 0 end,
          expires_at,
          p_now
        );
      end loop;
    else
      raise exception 'CHECKOUT_LINE_TARGET_REQUIRED'
        using errcode = 'P0001';
    end if;
  end loop;

  update private.inventory_checkout_sessions
  set
    subtotal_amount = subtotal,
    total_amount = subtotal,
    updated_at = p_now
  where id = checkout_row.id
  returning * into checkout_row;

  insert into private.inventory_settlement_ledger_entries (
    ws_id,
    checkout_session_id,
    entry_kind,
    amount,
    currency,
    source
  )
  values
    (
      checkout_row.ws_id,
      checkout_row.id,
      'subtotal',
      subtotal,
      checkout_row.currency,
      'estimate'
    ),
    (
      checkout_row.ws_id,
      checkout_row.id,
      'platform_fee_estimate',
      checkout_row.platform_fee_amount,
      checkout_row.currency,
      'estimate'
    ),
    (
      checkout_row.ws_id,
      checkout_row.id,
      'total',
      checkout_row.total_amount,
      checkout_row.currency,
      'estimate'
    );

  return jsonb_build_object(
    'id', checkout_row.id,
    'publicToken', checkout_row.public_token,
    'status', checkout_row.status,
    'expiresAt', checkout_row.expires_at,
    'totalAmount', checkout_row.total_amount
  );
end;
$$;

create or replace function public.release_inventory_checkout_session(
  p_checkout_id uuid,
  p_now timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
  next_status text;
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
    return;
  end if;

  next_status := case
    when checkout_row.expires_at <= p_now then 'expired'
    else 'cancelled'
  end;

  update private.inventory_reservations
  set
    status = case when next_status = 'expired' then 'expired' else 'released' end,
    released_at = p_now
  where checkout_session_id = checkout_row.id
    and status = 'reserved';

  update private.inventory_checkout_sessions
  set
    status = next_status,
    updated_at = p_now
  where id = checkout_row.id
    and status <> 'completed';
end;
$$;

create or replace function public.complete_inventory_checkout_session(
  p_checkout_id uuid,
  p_finance_invoice_id uuid,
  p_now timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
  invoice_ws_id uuid;
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

  if checkout_row.status <> 'reserved' then
    raise exception 'CHECKOUT_NOT_RESERVED'
      using errcode = 'P0001';
  end if;

  select ws_id
  into invoice_ws_id
  from public.finance_invoices
  where id = p_finance_invoice_id
  for update;

  if not found or invoice_ws_id <> checkout_row.ws_id then
    raise exception 'FINANCE_INVOICE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  insert into public.finance_invoice_products (
    invoice_id,
    product_id,
    product_name,
    amount,
    price,
    unit_id,
    product_unit,
    warehouse_id,
    warehouse,
    owner_id,
    owner_name
  )
  select
    p_finance_invoice_id,
    line.product_id,
    coalesce(product.name, line.title),
    line.quantity,
    line.unit_price,
    line.unit_id,
    coalesce(unit.name, ''),
    line.warehouse_id,
    coalesce(warehouse.name, ''),
    product.owner_id,
    coalesce(owner.name, 'Unassigned')
  from private.inventory_checkout_lines line
  join public.workspace_products product
    on product.id = line.product_id
  left join public.inventory_owners owner
    on owner.id = product.owner_id
  left join public.inventory_units unit
    on unit.id = line.unit_id
  left join public.inventory_warehouses warehouse
    on warehouse.id = line.warehouse_id
  where line.checkout_session_id = checkout_row.id
    and not exists (
      select 1
      from public.finance_invoice_products existing
      where existing.invoice_id = p_finance_invoice_id
        and existing.product_id = line.product_id
        and existing.unit_id = line.unit_id
        and existing.warehouse_id = line.warehouse_id
    );

  update private.inventory_reservations
  set
    status = 'consumed',
    released_at = p_now
  where checkout_session_id = checkout_row.id
    and status = 'reserved';

  update private.inventory_checkout_sessions
  set
    status = 'completed',
    finance_invoice_id = p_finance_invoice_id,
    completed_at = p_now,
    updated_at = p_now
  where id = checkout_row.id;

  update private.inventory_settlement_ledger_entries
  set finance_invoice_id = p_finance_invoice_id
  where checkout_session_id = checkout_row.id;

  return p_finance_invoice_id;
end;
$$;

revoke all on function public.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) from public;
grant execute on function public.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) to service_role;

revoke all on function public.release_inventory_checkout_session(
  uuid,
  timestamptz
) from public;
grant execute on function public.release_inventory_checkout_session(
  uuid,
  timestamptz
) to service_role;

revoke all on function public.complete_inventory_checkout_session(
  uuid,
  uuid,
  timestamptz
) from public;
grant execute on function public.complete_inventory_checkout_session(
  uuid,
  uuid,
  timestamptz
) to service_role;

revoke all on function public._inventory_reserved_quantity(
  uuid,
  uuid,
  uuid,
  timestamptz
) from public;
grant execute on function public._inventory_reserved_quantity(
  uuid,
  uuid,
  uuid,
  timestamptz
) to service_role;

revoke all on function public._inventory_create_reserved_line(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  bigint,
  bigint,
  timestamptz,
  timestamptz
) from public;
grant execute on function public._inventory_create_reserved_line(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  bigint,
  bigint,
  timestamptz,
  timestamptz
) to service_role;
