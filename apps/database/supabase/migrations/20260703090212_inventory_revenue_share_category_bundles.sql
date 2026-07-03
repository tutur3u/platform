-- Add stock-row revenue share attribution and category-choice bundle schema.
-- Existing fixed bundles remain fixed-price bundles by default.

alter table private.inventory_products
  add column if not exists revenue_share_partner_id uuid,
  add column if not exists revenue_share_bps integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_products_revenue_share_bps_check'
  ) then
    alter table private.inventory_products
      add constraint inventory_products_revenue_share_bps_check
      check (revenue_share_bps between 0 and 10000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_products_revenue_share_partner_id_fkey'
  ) then
    alter table private.inventory_products
      add constraint inventory_products_revenue_share_partner_id_fkey
      foreign key (revenue_share_partner_id)
      references private.inventory_owners(id)
      on delete set null;
  end if;
end $$;

create index if not exists inventory_products_revenue_share_partner_idx
  on private.inventory_products (revenue_share_partner_id);

create or replace function private.ensure_inventory_product_revenue_share_scope()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  product_ws_id uuid;
begin
  if new.revenue_share_partner_id is null then
    return new;
  end if;

  select product.ws_id
  into product_ws_id
  from public.workspace_products product
  where product.id = new.product_id;

  if product_ws_id is null or not exists (
    select 1
    from private.inventory_owners owner
    where owner.id = new.revenue_share_partner_id
      and owner.ws_id = product_ws_id
  ) then
    raise exception 'INVALID_REVENUE_SHARE_PARTNER_WORKSPACE_SCOPE'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_products_revenue_share_scope
  on private.inventory_products;

create trigger inventory_products_revenue_share_scope
  before insert or update of product_id, revenue_share_partner_id
  on private.inventory_products
  for each row
  execute function private.ensure_inventory_product_revenue_share_scope();

alter table private.inventory_bundles
  add column if not exists pricing_mode text not null default 'fixed_price',
  add column if not exists category_candidate_scope text not null default 'published_listings';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_bundles_pricing_mode_check'
  ) then
    alter table private.inventory_bundles
      add constraint inventory_bundles_pricing_mode_check
      check (pricing_mode in ('fixed_price', 'selected_items'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_bundles_category_candidate_scope_check'
  ) then
    alter table private.inventory_bundles
      add constraint inventory_bundles_category_candidate_scope_check
      check (category_candidate_scope in ('published_listings', 'all_stock'));
  end if;
end $$;

create table if not exists private.inventory_bundle_category_components (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references private.inventory_bundles(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete restrict,
  quantity_required integer not null default 1,
  free_quantity integer not null default 0,
  discount_strategy text not null default 'cheapest_free',
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint inventory_bundle_category_components_quantity_required_check
    check (quantity_required > 0),
  constraint inventory_bundle_category_components_free_quantity_check
    check (free_quantity >= 0 and free_quantity <= quantity_required),
  constraint inventory_bundle_category_components_discount_strategy_check
    check (discount_strategy in ('none', 'cheapest_free'))
);

create index if not exists inventory_bundle_category_components_bundle_idx
  on private.inventory_bundle_category_components (bundle_id, sort_order, created_at);

create index if not exists inventory_bundle_category_components_category_idx
  on private.inventory_bundle_category_components (category_id);

drop trigger if exists inventory_bundle_category_components_updated_at
  on private.inventory_bundle_category_components;

create trigger inventory_bundle_category_components_updated_at
  before update on private.inventory_bundle_category_components
  for each row
  execute function public.update_updated_at_column();

create or replace function private.ensure_inventory_bundle_category_scope()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  bundle_ws_id uuid;
begin
  select bundle.ws_id
  into bundle_ws_id
  from private.inventory_bundles bundle
  where bundle.id = new.bundle_id;

  if bundle_ws_id is null or not exists (
    select 1
    from public.product_categories category
    where category.id = new.category_id
      and category.ws_id = bundle_ws_id
  ) then
    raise exception 'INVALID_BUNDLE_CATEGORY_COMPONENT_WORKSPACE_SCOPE'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_bundle_category_components_scope
  on private.inventory_bundle_category_components;

create trigger inventory_bundle_category_components_scope
  before insert or update of bundle_id, category_id
  on private.inventory_bundle_category_components
  for each row
  execute function private.ensure_inventory_bundle_category_scope();

create or replace function private.inventory_major_to_minor(
  p_amount numeric,
  p_currency text default 'USD'
) returns bigint
language sql
immutable
as $$
  select round(coalesce(p_amount, 0) * case
    when upper(coalesce(p_currency, 'USD')) in ('BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND') then 1000
    when upper(coalesce(p_currency, 'USD')) in (
      'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'MGA',
      'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
    ) then 1
    else 100
  end)::bigint;
$$;

create or replace function private.inventory_stock_available_quantity(
  p_product_id uuid,
  p_unit_id uuid,
  p_warehouse_id uuid,
  p_now timestamptz default now()
) returns integer
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce((
    select case
      when stock.amount is null then null
      else greatest(
        stock.amount - public._inventory_reserved_quantity(
          p_product_id,
          p_unit_id,
          p_warehouse_id,
          p_now
        ),
        0
      )::integer
    end
    from private.inventory_products stock
    where stock.product_id = p_product_id
      and stock.unit_id = p_unit_id
      and stock.warehouse_id = p_warehouse_id
  ), 0);
$$;

create or replace function private.inventory_bundle_fixed_components_json(
  p_bundle_id uuid,
  p_ws_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', component.id,
      'bundleId', component.bundle_id,
      'productId', component.product_id,
      'productName', product.name,
      'unitId', component.unit_id,
      'unitName', unit.name,
      'warehouseId', component.warehouse_id,
      'warehouseName', warehouse.name,
      'quantity', component.quantity::integer
    )
    order by product.name asc, component.created_at asc
  ), '[]'::jsonb)
  from private.inventory_bundle_components component
  join public.workspace_products product
    on product.id = component.product_id
   and product.ws_id = p_ws_id
  join private.inventory_units unit
    on unit.id = component.unit_id
   and unit.ws_id = p_ws_id
  join private.inventory_warehouses warehouse
    on warehouse.id = component.warehouse_id
   and warehouse.ws_id = p_ws_id
  join private.inventory_products stock
    on stock.product_id = product.id
   and stock.unit_id = unit.id
   and stock.warehouse_id = warehouse.id
  where component.bundle_id = p_bundle_id;
$$;

create or replace function private.inventory_bundle_category_components_json(
  p_bundle_id uuid,
  p_ws_id uuid,
  p_storefront_id uuid default null,
  p_currency text default 'USD',
  p_now timestamptz default now(),
  p_include_candidates boolean default false
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', component.id,
      'bundleId', component.bundle_id,
      'categoryId', component.category_id,
      'categoryName', category.name,
      'quantityRequired', component.quantity_required,
      'freeQuantity', component.free_quantity,
      'discountStrategy', component.discount_strategy,
      'sortOrder', component.sort_order,
      'candidateScope', bundle.category_candidate_scope,
      'candidates', case
        when p_include_candidates then coalesce(candidates.items, '[]'::jsonb)
        else '[]'::jsonb
      end
    )
    order by component.sort_order asc, category.name asc, component.created_at asc
  ), '[]'::jsonb)
  from private.inventory_bundle_category_components component
  join private.inventory_bundles bundle
    on bundle.id = component.bundle_id
   and bundle.ws_id = p_ws_id
  join public.product_categories category
    on category.id = component.category_id
   and category.ws_id = p_ws_id
  left join lateral (
    select jsonb_agg(candidate.item order by candidate.title asc, candidate.price asc) as items
    from (
      select
        listing.title,
        listing.price,
        jsonb_build_object(
          'selectionKind', 'listing',
          'componentId', component.id,
          'listingId', listing.id,
          'variantId', null,
          'productId', listing.product_id,
          'unitId', listing.unit_id,
          'warehouseId', listing.warehouse_id,
          'title', listing.title,
          'imageUrl', listing.image_url,
          'price', listing.price,
          'availableQuantity', private.inventory_stock_available_quantity(listing.product_id, listing.unit_id, listing.warehouse_id, p_now),
          'unitName', unit.name,
          'warehouseName', warehouse.name
        ) as item
      from private.inventory_storefront_listings listing
      join public.workspace_products product
        on product.id = listing.product_id
       and product.ws_id = p_ws_id
       and product.category_id = component.category_id
      left join private.inventory_units unit
        on unit.id = listing.unit_id
       and unit.ws_id = p_ws_id
      left join private.inventory_warehouses warehouse
        on warehouse.id = listing.warehouse_id
       and warehouse.ws_id = p_ws_id
      where p_include_candidates
        and p_storefront_id is not null
        and bundle.category_candidate_scope = 'published_listings'
        and listing.storefront_id = p_storefront_id
        and listing.status = 'published'
        and listing.listing_type = 'product'
        and listing.product_id is not null
        and not exists (
          select 1
          from private.inventory_storefront_listing_variants variant
          where variant.listing_id = listing.id
            and variant.status = 'active'
        )
        and coalesce(private.inventory_stock_available_quantity(listing.product_id, listing.unit_id, listing.warehouse_id, p_now), 1) > 0
      union all
      select
        coalesce(variant.title, listing.title) as title,
        coalesce(variant.price, listing.price) as price,
        jsonb_build_object(
          'selectionKind', 'variant',
          'componentId', component.id,
          'listingId', listing.id,
          'variantId', variant.id,
          'productId', variant.product_id,
          'unitId', variant.unit_id,
          'warehouseId', variant.warehouse_id,
          'title', coalesce(variant.title, listing.title),
          'imageUrl', coalesce(variant.image_url, listing.image_url),
          'price', coalesce(variant.price, listing.price),
          'availableQuantity', private.inventory_stock_available_quantity(variant.product_id, variant.unit_id, variant.warehouse_id, p_now),
          'unitName', unit.name,
          'warehouseName', warehouse.name
        ) as item
      from private.inventory_storefront_listing_variants variant
      join private.inventory_storefront_listings listing
        on listing.id = variant.listing_id
       and listing.storefront_id = p_storefront_id
       and listing.status = 'published'
       and listing.listing_type = 'product'
      join public.workspace_products product
        on product.id = variant.product_id
       and product.ws_id = p_ws_id
       and product.category_id = component.category_id
      left join private.inventory_units unit
        on unit.id = variant.unit_id
       and unit.ws_id = p_ws_id
      left join private.inventory_warehouses warehouse
        on warehouse.id = variant.warehouse_id
       and warehouse.ws_id = p_ws_id
      where p_include_candidates
        and p_storefront_id is not null
        and bundle.category_candidate_scope = 'published_listings'
        and variant.status = 'active'
        and coalesce(private.inventory_stock_available_quantity(variant.product_id, variant.unit_id, variant.warehouse_id, p_now), 1) > 0
      union all
      select
        product.name as title,
        private.inventory_major_to_minor(stock.price, p_currency) as price,
        jsonb_build_object(
          'selectionKind', 'stock',
          'componentId', component.id,
          'listingId', null,
          'variantId', null,
          'productId', stock.product_id,
          'unitId', stock.unit_id,
          'warehouseId', stock.warehouse_id,
          'title', product.name,
          'imageUrl', product.avatar_url,
          'price', private.inventory_major_to_minor(stock.price, p_currency),
          'availableQuantity', private.inventory_stock_available_quantity(stock.product_id, stock.unit_id, stock.warehouse_id, p_now),
          'unitName', unit.name,
          'warehouseName', warehouse.name
        ) as item
      from private.inventory_products stock
      join public.workspace_products product
        on product.id = stock.product_id
       and product.ws_id = p_ws_id
       and product.category_id = component.category_id
       and product.archived = false
      left join private.inventory_units unit
        on unit.id = stock.unit_id
       and unit.ws_id = p_ws_id
      left join private.inventory_warehouses warehouse
        on warehouse.id = stock.warehouse_id
       and warehouse.ws_id = p_ws_id
      where p_include_candidates
        and bundle.category_candidate_scope = 'all_stock'
        and coalesce(private.inventory_stock_available_quantity(stock.product_id, stock.unit_id, stock.warehouse_id, p_now), 1) > 0
    ) candidate
  ) candidates on true
  where component.bundle_id = p_bundle_id;
$$;
