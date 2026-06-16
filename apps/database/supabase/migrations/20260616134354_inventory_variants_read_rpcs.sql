-- Surface listing options + variants from the public storefront read RPC and
-- the operator listings RPC. Both gain two append-only keys per listing:
--   options:  the listing's option groups + values
--   variants: active SKUs (resolved price, per-variant availableQuantity, the
--             selected option value per axis, and — for operators — per-variant
--             Polar sync state)
-- Variant-less listings emit '[]' for both, so existing consumers are
-- unaffected. These are full `create or replace` definitions of the latest
-- bodies (from 20260614171313 / 20260615220000) plus the new keys.

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
      sf.cover_image_url,
      sf.hero_image_url,
      sf.accent_color,
      sf.currency,
      sf.checkout_mode,
      sf.theme_preset,
      sf.layout_style,
      sf.surface_style,
      sf.corner_style,
      sf.show_inventory_badges,
      sf.analytics_enabled,
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
        'coverImageUrl', storefront.cover_image_url,
        'heroImageUrl', storefront.hero_image_url,
        'accentColor', storefront.accent_color,
        'currency', storefront.currency,
        'checkoutMode', storefront.checkout_mode,
        'themePreset', storefront.theme_preset,
        'layoutStyle', storefront.layout_style,
        'surfaceStyle', storefront.surface_style,
        'cornerStyle', storefront.corner_style,
        'showInventoryBadges', storefront.show_inventory_badges,
        'analyticsEnabled', storefront.analytics_enabled,
        'sections', coalesce(sections.items, '[]'::jsonb),
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
        'id', section.id,
        'wsId', section.ws_id,
        'storefrontId', section.storefront_id,
        'sectionType', section.section_type,
        'status', section.status,
        'title', section.title,
        'description', section.description,
        'imageUrl', section.image_url,
        'href', section.href,
        'sortOrder', section.sort_order,
        'metadata', section.metadata,
        'items', coalesce(section_items.items, '[]'::jsonb),
        'createdAt', section.created_at::text,
        'updatedAt', section.updated_at::text
      )
      order by section.sort_order asc, section.created_at asc
    ) as items
    from private.inventory_storefront_sections section
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'wsId', item.ws_id,
          'storefrontId', item.storefront_id,
          'sectionId', item.section_id,
          'listingId', item.listing_id,
          'bundleId', item.bundle_id,
          'title', item.title,
          'description', item.description,
          'imageUrl', item.image_url,
          'href', item.href,
          'sortOrder', item.sort_order,
          'metadata', item.metadata,
          'createdAt', item.created_at::text,
          'updatedAt', item.updated_at::text
        )
        order by item.sort_order asc, item.created_at asc
      ) as items
      from private.inventory_storefront_section_items item
      where item.section_id = section.id
        and item.ws_id = section.ws_id
    ) section_items on true
    where section.storefront_id = storefront.id
      and section.ws_id = storefront.ws_id
      and section.status = 'published'
  ) sections on true
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
            when listing.listing_type <> 'product' then null
            when stock.product_id is null then 0
            when stock.amount is null then null
            else greatest(
              stock.amount
              - public._inventory_reserved_quantity(
                listing.product_id,
                listing.unit_id,
                listing.warehouse_id,
                p_now
              ),
              0
            )::int
          end,
        'unitName', unit.name,
        'warehouseName', warehouse.name,
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', grp.id,
              'name', grp.name,
              'sortOrder', grp.sort_order,
              'values', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', val.id,
                    'label', val.label,
                    'sortOrder', val.sort_order
                  )
                  order by val.sort_order asc, val.created_at asc
                )
                from private.inventory_listing_option_values val
                where val.group_id = grp.id
              ), '[]'::jsonb)
            )
            order by grp.sort_order asc, grp.created_at asc
          )
          from private.inventory_listing_option_groups grp
          where grp.listing_id = listing.id
        ), '[]'::jsonb),
        'variants', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', vr.id,
              'sku', vr.sku,
              'title', vr.title,
              'productId', vr.product_id,
              'unitId', vr.unit_id,
              'warehouseId', vr.warehouse_id,
              'price', coalesce(vr.price, listing.price),
              'compareAtPrice', vr.compare_at_price,
              'imageUrl', vr.image_url,
              'sortOrder', vr.sort_order,
              'status', vr.status,
              'availableQuantity',
                case
                  when vstock.product_id is null then 0
                  when vstock.amount is null then null
                  else greatest(
                    vstock.amount
                    - public._inventory_reserved_quantity(
                      vr.product_id,
                      vr.unit_id,
                      vr.warehouse_id,
                      p_now
                    ),
                    0
                  )::int
                end,
              'optionValues', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'groupId', link.group_id,
                    'valueId', link.value_id,
                    'label', val.label
                  )
                  order by grp.sort_order asc, val.sort_order asc
                )
                from private.inventory_listing_variant_option_values link
                join private.inventory_listing_option_values val
                  on val.id = link.value_id
                join private.inventory_listing_option_groups grp
                  on grp.id = link.group_id
                where link.variant_id = vr.id
              ), '[]'::jsonb)
            )
            order by vr.sort_order asc, vr.created_at asc
          )
          from private.inventory_storefront_listing_variants vr
          left join private.inventory_products vstock
            on vstock.product_id = vr.product_id
           and vstock.unit_id = vr.unit_id
           and vstock.warehouse_id = vr.warehouse_id
          where vr.listing_id = listing.id
            and vr.status = 'active'
        ), '[]'::jsonb),
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

create or replace function private.list_inventory_storefront_listings(
  p_ws_id uuid,
  p_storefront_id uuid,
  p_status text default null
)
returns table (
  total_count integer,
  listing jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      listing.id,
      listing.storefront_id,
      listing.ws_id,
      listing.listing_type,
      listing.product_id,
      listing.unit_id,
      unit.name as unit_name,
      listing.warehouse_id,
      warehouse.name as warehouse_name,
      listing.bundle_id,
      listing.title,
      listing.description,
      listing.image_url,
      listing.price,
      listing.compare_at_price,
      listing.status,
      listing.sort_order,
      listing.max_per_order,
      listing.created_at,
      listing.updated_at,
      listing.polar_sync_status,
      listing.polar_synced_at,
      listing.polar_last_error,
      case
        when listing.listing_type <> 'product' then null
        when stock.product_id is null then 0
        when stock.amount is null then null
        else greatest(
          stock.amount
          - public._inventory_reserved_quantity(
            listing.product_id,
            listing.unit_id,
            listing.warehouse_id,
            now()
          ),
          0
        )::integer
      end as available_quantity
    from private.inventory_storefront_listings listing
    left join private.inventory_products stock
      on stock.product_id = listing.product_id
     and stock.unit_id = listing.unit_id
     and stock.warehouse_id = listing.warehouse_id
    left join private.inventory_units unit
      on unit.id = listing.unit_id
     and unit.ws_id = p_ws_id
    left join private.inventory_warehouses warehouse
      on warehouse.id = listing.warehouse_id
     and warehouse.ws_id = p_ws_id
    where listing.ws_id = p_ws_id
      and listing.storefront_id = p_storefront_id
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or listing.status = p_status
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  )
  select
    counted.total_count,
    case
      when filtered.id is null then null
      else jsonb_build_object(
        'id', filtered.id,
        'storefrontId', filtered.storefront_id,
        'wsId', filtered.ws_id,
        'listingType', filtered.listing_type,
        'productId', filtered.product_id,
        'bundleId', filtered.bundle_id,
        'unitId', filtered.unit_id,
        'warehouseId', filtered.warehouse_id,
        'title', filtered.title,
        'description', filtered.description,
        'imageUrl', filtered.image_url,
        'price', filtered.price,
        'compareAtPrice', filtered.compare_at_price,
        'status', filtered.status,
        'sortOrder', filtered.sort_order,
        'maxPerOrder', filtered.max_per_order,
        'availableQuantity', filtered.available_quantity,
        'unitName', filtered.unit_name,
        'warehouseName', filtered.warehouse_name,
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', grp.id,
              'name', grp.name,
              'sortOrder', grp.sort_order,
              'values', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', val.id,
                    'label', val.label,
                    'sortOrder', val.sort_order
                  )
                  order by val.sort_order asc, val.created_at asc
                )
                from private.inventory_listing_option_values val
                where val.group_id = grp.id
              ), '[]'::jsonb)
            )
            order by grp.sort_order asc, grp.created_at asc
          )
          from private.inventory_listing_option_groups grp
          where grp.listing_id = filtered.id
        ), '[]'::jsonb),
        'variants', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', vr.id,
              'sku', vr.sku,
              'title', vr.title,
              'productId', vr.product_id,
              'unitId', vr.unit_id,
              'warehouseId', vr.warehouse_id,
              'price', coalesce(vr.price, filtered.price),
              'compareAtPrice', vr.compare_at_price,
              'imageUrl', vr.image_url,
              'sortOrder', vr.sort_order,
              'status', vr.status,
              'availableQuantity',
                case
                  when vstock.product_id is null then 0
                  when vstock.amount is null then null
                  else greatest(
                    vstock.amount
                    - public._inventory_reserved_quantity(
                      vr.product_id,
                      vr.unit_id,
                      vr.warehouse_id,
                      now()
                    ),
                    0
                  )::int
                end,
              'optionValues', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'groupId', link.group_id,
                    'valueId', link.value_id,
                    'label', val.label
                  )
                  order by grp.sort_order asc, val.sort_order asc
                )
                from private.inventory_listing_variant_option_values link
                join private.inventory_listing_option_values val
                  on val.id = link.value_id
                join private.inventory_listing_option_groups grp
                  on grp.id = link.group_id
                where link.variant_id = vr.id
              ), '[]'::jsonb),
              'polarSyncStatus', vr.polar_sync_status,
              'polarSyncedAt', vr.polar_synced_at::text,
              'polarLastError', vr.polar_last_error
            )
            order by vr.sort_order asc, vr.created_at asc
          )
          from private.inventory_storefront_listing_variants vr
          left join private.inventory_products vstock
            on vstock.product_id = vr.product_id
           and vstock.unit_id = vr.unit_id
           and vstock.warehouse_id = vr.warehouse_id
          where vr.listing_id = filtered.id
            and vr.status <> 'archived'
        ), '[]'::jsonb),
        'createdAt', filtered.created_at::text,
        'updatedAt', filtered.updated_at::text,
        'polarSyncStatus', filtered.polar_sync_status,
        'polarSyncedAt', filtered.polar_synced_at::text,
        'polarLastError', filtered.polar_last_error
      )
    end as listing
  from counted
  left join filtered on true
  order by filtered.sort_order asc nulls last, filtered.created_at desc nulls last;
$$;

revoke all on function private.get_public_inventory_storefront(
  text, timestamptz
) from public, anon, authenticated;
grant execute on function private.get_public_inventory_storefront(
  text, timestamptz
) to service_role;

revoke all on function private.list_inventory_storefront_listings(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function private.list_inventory_storefront_listings(
  uuid, uuid, text
) to service_role;
