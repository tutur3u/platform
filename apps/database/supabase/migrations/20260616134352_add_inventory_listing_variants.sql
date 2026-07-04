-- Per-listing product options (axes such as "Size") and per-variant SKUs.
--
-- Design: variants are OPT-IN child rows. A listing with zero variant rows keeps
-- behaving exactly as before (it uses its own product/unit/warehouse + price).
-- Each variant carries its OWN (product_id, unit_id, warehouse_id) stock
-- coordinate, so the existing stock/reservation machinery
-- (public._inventory_reserved_quantity / _inventory_create_reserved_line) works
-- unchanged — no parallel stock subsystem. A variant maps to exactly one option
-- value per axis via the junction table.
--
-- All additive; mirrors the service_role-only RLS/grant/trigger pattern.

-- Listing-level option groups (the listing's own snapshot of its axes).
create table if not exists private.inventory_listing_option_groups (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references private.inventory_storefront_listings(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  unique (listing_id, name)
);

create table if not exists private.inventory_listing_option_values (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references private.inventory_listing_option_groups(id) on delete cascade,
  listing_id uuid not null references private.inventory_storefront_listings(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  unique (group_id, label)
);

-- A variant is one selectable SKU = one combination of option values, with its
-- own stock coordinate, optional price override (null => inherit listing.price)
-- and its own Polar product/price sync state (mirrors the per-listing columns
-- added in 20260615170000).
create table if not exists private.inventory_storefront_listing_variants (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references private.inventory_storefront_listings(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  sku text,
  title text,
  product_id uuid not null references public.workspace_products(id) on delete cascade,
  unit_id uuid not null references private.inventory_units(id) on delete restrict,
  warehouse_id uuid not null references private.inventory_warehouses(id) on delete restrict,
  price bigint check (price is null or price >= 0),
  compare_at_price bigint check (compare_at_price is null or compare_at_price >= 0),
  image_url text,
  sort_order integer not null default 0,
  status text not null default 'active' check (
    status in ('active', 'hidden', 'archived')
  ),
  polar_product_id text,
  polar_price_id text,
  polar_environment text check (
    polar_environment is null or polar_environment in ('sandbox', 'production')
  ),
  polar_sync_status text not null default 'pending' check (
    polar_sync_status in ('pending', 'synced', 'error', 'disabled')
  ),
  polar_synced_at timestamptz,
  polar_last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (listing_id, product_id, unit_id, warehouse_id)
);

-- Junction: a variant selects exactly one value per option axis.
create table if not exists private.inventory_listing_variant_option_values (
  variant_id uuid not null references private.inventory_storefront_listing_variants(id) on delete cascade,
  group_id uuid not null references private.inventory_listing_option_groups(id) on delete cascade,
  value_id uuid not null references private.inventory_listing_option_values(id) on delete cascade,
  listing_id uuid not null references private.inventory_storefront_listings(id) on delete cascade,
  primary key (variant_id, group_id),
  unique (variant_id, value_id)
);

create index if not exists inventory_listing_option_groups_listing_idx
  on private.inventory_listing_option_groups (listing_id, sort_order);
create index if not exists inventory_listing_option_values_group_idx
  on private.inventory_listing_option_values (group_id, sort_order);
create index if not exists inventory_listing_variants_listing_idx
  on private.inventory_storefront_listing_variants (listing_id, sort_order, created_at)
  where status <> 'archived';
create index if not exists inventory_listing_variants_stock_idx
  on private.inventory_storefront_listing_variants (product_id, unit_id, warehouse_id);
create index if not exists inventory_listing_variants_polar_product_idx
  on private.inventory_storefront_listing_variants (polar_product_id)
  where polar_product_id is not null;
create index if not exists inventory_listing_variant_option_values_value_idx
  on private.inventory_listing_variant_option_values (value_id);

alter table private.inventory_listing_option_groups enable row level security;
alter table private.inventory_listing_option_values enable row level security;
alter table private.inventory_storefront_listing_variants enable row level security;
alter table private.inventory_listing_variant_option_values enable row level security;

drop policy if exists "Service role can manage inventory listing option groups"
  on private.inventory_listing_option_groups;
create policy "Service role can manage inventory listing option groups"
  on private.inventory_listing_option_groups
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory listing option values"
  on private.inventory_listing_option_values;
create policy "Service role can manage inventory listing option values"
  on private.inventory_listing_option_values
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory listing variants"
  on private.inventory_storefront_listing_variants;
create policy "Service role can manage inventory listing variants"
  on private.inventory_storefront_listing_variants
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage inventory listing variant option values"
  on private.inventory_listing_variant_option_values;
create policy "Service role can manage inventory listing variant option values"
  on private.inventory_listing_variant_option_values
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table private.inventory_listing_option_groups
  from public, anon, authenticated;
revoke all on table private.inventory_listing_option_values
  from public, anon, authenticated;
revoke all on table private.inventory_storefront_listing_variants
  from public, anon, authenticated;
revoke all on table private.inventory_listing_variant_option_values
  from public, anon, authenticated;

grant all on table private.inventory_listing_option_groups to service_role;
grant all on table private.inventory_listing_option_values to service_role;
grant all on table private.inventory_storefront_listing_variants to service_role;
grant all on table private.inventory_listing_variant_option_values to service_role;

drop trigger if exists inventory_listing_variants_updated_at
  on private.inventory_storefront_listing_variants;
create trigger inventory_listing_variants_updated_at
  before update
  on private.inventory_storefront_listing_variants
  for each row
  execute function public.update_updated_at_column();
