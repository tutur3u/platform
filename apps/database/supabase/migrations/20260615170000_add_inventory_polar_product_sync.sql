-- 2-way Polar product sync for inventory storefront listings and bundles.
--
-- Today inventory checkout reuses a single generic "Tuturuuu Inventory Checkout"
-- custom-amount Polar product per workspace. To support real per-listing catalog
-- sync (inventory -> Polar product/price, and Polar product.updated -> inventory),
-- each listing/bundle needs to remember the Polar product/price it maps to plus a
-- lightweight sync status for drift detection. All additive and nullable so the
-- rollout is safe and existing rows keep working with the generic-product
-- fallback until they are synced.

alter table private.inventory_storefront_listings
  add column if not exists polar_product_id text,
  add column if not exists polar_price_id text,
  add column if not exists polar_environment text check (
    polar_environment is null
    or polar_environment in ('sandbox', 'production')
  ),
  add column if not exists polar_sync_status text not null default 'pending' check (
    polar_sync_status in ('pending', 'synced', 'error', 'disabled')
  ),
  add column if not exists polar_synced_at timestamptz,
  add column if not exists polar_last_error text;

alter table private.inventory_bundles
  add column if not exists polar_product_id text,
  add column if not exists polar_price_id text,
  add column if not exists polar_environment text check (
    polar_environment is null
    or polar_environment in ('sandbox', 'production')
  ),
  add column if not exists polar_sync_status text not null default 'pending' check (
    polar_sync_status in ('pending', 'synced', 'error', 'disabled')
  ),
  add column if not exists polar_synced_at timestamptz,
  add column if not exists polar_last_error text;

-- Webhook pulls (product.updated) look up the row by the Polar product id, so a
-- partial index keeps that lookup fast and only covers synced rows.
create index if not exists inventory_storefront_listings_polar_product_idx
  on private.inventory_storefront_listings (polar_product_id)
  where polar_product_id is not null;

create index if not exists inventory_bundles_polar_product_idx
  on private.inventory_bundles (polar_product_id)
  where polar_product_id is not null;
