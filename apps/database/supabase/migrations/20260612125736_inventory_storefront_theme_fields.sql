alter table private.inventory_storefronts
  add column if not exists theme_preset text not null default 'minimal';

alter table private.inventory_storefronts
  add column if not exists layout_style text not null default 'grid';

alter table private.inventory_storefronts
  add column if not exists surface_style text not null default 'solid';

alter table private.inventory_storefronts
  add column if not exists corner_style text not null default 'rounded';

alter table private.inventory_storefronts
  add column if not exists show_inventory_badges boolean not null default true;

update private.inventory_storefronts
set
  theme_preset = coalesce(theme_preset, 'minimal'),
  layout_style = coalesce(layout_style, 'grid'),
  surface_style = coalesce(surface_style, 'solid'),
  corner_style = coalesce(corner_style, 'rounded'),
  show_inventory_badges = coalesce(show_inventory_badges, true);

alter table private.inventory_storefronts
  alter column theme_preset set not null,
  alter column theme_preset set default 'minimal',
  alter column layout_style set not null,
  alter column layout_style set default 'grid',
  alter column surface_style set not null,
  alter column surface_style set default 'solid',
  alter column corner_style set not null,
  alter column corner_style set default 'rounded',
  alter column show_inventory_badges set not null,
  alter column show_inventory_badges set default true;

alter table private.inventory_storefronts
  drop constraint if exists inventory_storefronts_theme_preset_check;

alter table private.inventory_storefronts
  add constraint inventory_storefronts_theme_preset_check
  check (theme_preset in ('minimal', 'editorial', 'boutique', 'catalog'));

alter table private.inventory_storefronts
  drop constraint if exists inventory_storefronts_layout_style_check;

alter table private.inventory_storefronts
  add constraint inventory_storefronts_layout_style_check
  check (layout_style in ('grid', 'list', 'feature'));

alter table private.inventory_storefronts
  drop constraint if exists inventory_storefronts_surface_style_check;

alter table private.inventory_storefronts
  add constraint inventory_storefronts_surface_style_check
  check (surface_style in ('solid', 'soft', 'glass'));

alter table private.inventory_storefronts
  drop constraint if exists inventory_storefronts_corner_style_check;

alter table private.inventory_storefronts
  add constraint inventory_storefronts_corner_style_check
  check (corner_style in ('compact', 'rounded', 'soft'));

create or replace function private.list_inventory_storefronts(
  p_ws_id uuid,
  p_search text default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  total_count integer,
  storefront jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      storefront.id,
      storefront.ws_id,
      storefront.slug,
      storefront.name,
      storefront.description,
      storefront.status,
      storefront.visibility,
      storefront.hero_image_url,
      storefront.accent_color,
      storefront.currency,
      storefront.theme_preset,
      storefront.layout_style,
      storefront.surface_style,
      storefront.corner_style,
      storefront.show_inventory_badges,
      storefront.created_at,
      storefront.updated_at,
      (
        select count(*)::integer
        from private.inventory_storefront_listings listing
        where listing.storefront_id = storefront.id
      ) as listings_count
    from private.inventory_storefronts storefront
    where storefront.ws_id = p_ws_id
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or storefront.status = p_status
      )
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or storefront.name ilike '%' || p_search || '%'
        or storefront.slug ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc nulls last, name asc
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
        'slug', paged.slug,
        'name', paged.name,
        'description', paged.description,
        'status', paged.status,
        'visibility', paged.visibility,
        'heroImageUrl', paged.hero_image_url,
        'accentColor', paged.accent_color,
        'currency', paged.currency,
        'themePreset', paged.theme_preset,
        'layoutStyle', paged.layout_style,
        'surfaceStyle', paged.surface_style,
        'cornerStyle', paged.corner_style,
        'showInventoryBadges', paged.show_inventory_badges,
        'listingsCount', paged.listings_count,
        'createdAt', paged.created_at::text,
        'updatedAt', paged.updated_at::text
      )
    end as storefront
  from counted
  left join paged on true;
$$;

create or replace function private.get_public_inventory_storefront(
  p_storefront_slug text,
  p_now timestamptz default now()
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with storefront as (
    select
      sf.id,
      sf.ws_id,
      sf.slug,
      sf.name,
      sf.description,
      sf.status,
      sf.visibility,
      sf.hero_image_url,
      sf.accent_color,
      sf.currency,
      sf.theme_preset,
      sf.layout_style,
      sf.surface_style,
      sf.corner_style,
      sf.show_inventory_badges,
      sf.created_at,
      sf.updated_at,
      (
        select count(*)::int
        from private.inventory_storefront_listings listing
        where listing.storefront_id = sf.id
          and listing.status = 'published'
      ) as listings_count
    from private.inventory_storefronts sf
    where sf.slug = p_storefront_slug
      and sf.status = 'published'
    limit 1
  )
  select jsonb_build_object(
    'storefront',
      jsonb_build_object(
        'id', storefront.id,
        'wsId', storefront.ws_id,
        'slug', storefront.slug,
        'name', storefront.name,
        'description', storefront.description,
        'status', storefront.status,
        'visibility', storefront.visibility,
        'heroImageUrl', storefront.hero_image_url,
        'accentColor', storefront.accent_color,
        'currency', storefront.currency,
        'themePreset', storefront.theme_preset,
        'layoutStyle', storefront.layout_style,
        'surfaceStyle', storefront.surface_style,
        'cornerStyle', storefront.corner_style,
        'showInventoryBadges', storefront.show_inventory_badges,
        'listingsCount', storefront.listings_count,
        'createdAt', storefront.created_at::text,
        'updatedAt', storefront.updated_at::text
      ),
    'listings', coalesce(listings.items, '[]'::jsonb),
    'bundles', coalesce(bundles.items, '[]'::jsonb)
  )
  from storefront
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', listing.id,
        'storefrontId', listing.storefront_id,
        'wsId', listing.ws_id,
        'listingType', listing.listing_type,
        'productId', listing.product_id,
        'bundleId', listing.bundle_id,
        'unitId', listing.unit_id,
        'warehouseId', listing.warehouse_id,
        'title', listing.title,
        'description', listing.description,
        'imageUrl', listing.image_url,
        'price', listing.price,
        'compareAtPrice', listing.compare_at_price,
        'status', listing.status,
        'sortOrder', listing.sort_order,
        'maxPerOrder', listing.max_per_order,
        'availableQuantity',
          case
            when listing.listing_type = 'product' then greatest(
              coalesce(stock.amount, 0)
              - public._inventory_reserved_quantity(
                listing.product_id,
                listing.unit_id,
                listing.warehouse_id,
                p_now
              ),
              0
            )::int
            else null
          end,
        'unitName', unit.name,
        'warehouseName', warehouse.name,
        'createdAt', listing.created_at::text,
        'updatedAt', listing.updated_at::text
      )
      order by listing.sort_order asc, listing.created_at desc
    ) as items
    from private.inventory_storefront_listings listing
    left join private.inventory_products stock
      on stock.product_id = listing.product_id
     and stock.unit_id = listing.unit_id
     and stock.warehouse_id = listing.warehouse_id
    left join private.inventory_units unit
      on unit.id = listing.unit_id
     and unit.ws_id = storefront.ws_id
    left join private.inventory_warehouses warehouse
      on warehouse.id = listing.warehouse_id
     and warehouse.ws_id = storefront.ws_id
    where listing.storefront_id = storefront.id
      and listing.status = 'published'
  ) listings on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', bundle.id,
        'wsId', bundle.ws_id,
        'storefrontId', bundle.storefront_id,
        'slug', bundle.slug,
        'name', bundle.name,
        'description', bundle.description,
        'imageUrl', bundle.image_url,
        'price', bundle.price,
        'status', bundle.status,
        'maxPerOrder', bundle.max_per_order,
        'availableQuantity', null,
        'components', coalesce(components.items, '[]'::jsonb),
        'createdAt', bundle.created_at::text,
        'updatedAt', bundle.updated_at::text
      )
      order by bundle.created_at desc
    ) as items
    from private.inventory_bundles bundle
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', component.id,
          'bundleId', component.bundle_id,
          'productId', component.product_id,
          'productName', product.name,
          'unitId', component.unit_id,
          'unitName', unit.name,
          'warehouseId', component.warehouse_id,
          'warehouseName', warehouse.name,
          'quantity', component.quantity::int
        )
        order by product.name asc, component.created_at asc
      ) as items
      from private.inventory_bundle_components component
      join public.workspace_products product
        on product.id = component.product_id
       and product.ws_id = storefront.ws_id
      join private.inventory_units unit
        on unit.id = component.unit_id
       and unit.ws_id = storefront.ws_id
      join private.inventory_warehouses warehouse
        on warehouse.id = component.warehouse_id
       and warehouse.ws_id = storefront.ws_id
      join private.inventory_products stock
        on stock.product_id = product.id
       and stock.unit_id = unit.id
       and stock.warehouse_id = warehouse.id
      where component.bundle_id = bundle.id
    ) components on true
    where bundle.ws_id = storefront.ws_id
      and bundle.status = 'active'
      and (
        bundle.storefront_id = storefront.id
        or exists (
          select 1
          from private.inventory_storefront_listings listing
          where listing.storefront_id = storefront.id
            and listing.bundle_id = bundle.id
            and listing.status = 'published'
        )
      )
  ) bundles on true;
$$;
