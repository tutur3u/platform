-- Durable Square Catalog/Inventory mappings. Sync is additive: local archival
-- or deletion never triggers a Square delete/archive request.

create table if not exists private.inventory_square_catalog_links (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  product_id uuid not null references public.workspace_products(id) on delete cascade,
  unit_id uuid not null references private.inventory_units(id) on delete cascade,
  warehouse_id uuid not null references private.inventory_warehouses(id) on delete cascade,
  square_item_id text not null,
  square_variation_id text not null,
  square_item_version bigint,
  square_variation_version bigint,
  square_item_name text,
  square_variation_name text,
  square_sku text,
  local_hash text,
  square_hash text,
  status text not null default 'active'
    check (status in ('active', 'conflict', 'error', 'remote_deleted')),
  sync_origin text not null default 'tuturuuu'
    check (sync_origin in ('square', 'tuturuuu')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ws_id, environment, square_variation_id),
  unique (ws_id, environment, product_id, unit_id, warehouse_id)
);

create index if not exists inventory_square_catalog_links_item_idx
  on private.inventory_square_catalog_links (
    ws_id,
    environment,
    square_item_id
  );

create table if not exists private.inventory_square_sync_state (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  last_catalog_cursor_at timestamptz,
  last_inventory_sync_at timestamptz,
  last_direction text check (
    last_direction is null
    or last_direction in ('from_square', 'to_square', 'bidirectional')
  ),
  last_status text not null default 'idle'
    check (last_status in ('idle', 'running', 'success', 'partial', 'error')),
  last_error text,
  last_summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (ws_id, environment)
);

alter table private.inventory_square_catalog_links enable row level security;
alter table private.inventory_square_sync_state enable row level security;

drop policy if exists "Service role can manage Square catalog links"
  on private.inventory_square_catalog_links;
create policy "Service role can manage Square catalog links"
  on private.inventory_square_catalog_links
  for all to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage Square sync state"
  on private.inventory_square_sync_state;
create policy "Service role can manage Square sync state"
  on private.inventory_square_sync_state
  for all to service_role
  using (true)
  with check (true);

revoke all on table private.inventory_square_catalog_links
  from public, anon, authenticated;
revoke all on table private.inventory_square_sync_state
  from public, anon, authenticated;
grant all on table private.inventory_square_catalog_links to service_role;
grant all on table private.inventory_square_sync_state to service_role;

drop trigger if exists inventory_square_catalog_links_updated_at
  on private.inventory_square_catalog_links;
create trigger inventory_square_catalog_links_updated_at
  before update on private.inventory_square_catalog_links
  for each row execute function public.update_updated_at_column();

drop trigger if exists inventory_square_sync_state_updated_at
  on private.inventory_square_sync_state;
create trigger inventory_square_sync_state_updated_at
  before update on private.inventory_square_sync_state
  for each row execute function public.update_updated_at_column();

notify pgrst, 'reload schema';
