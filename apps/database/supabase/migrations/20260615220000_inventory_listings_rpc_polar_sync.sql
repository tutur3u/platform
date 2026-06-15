-- Surface Polar sync state on the workspace storefront-listings RPC so the
-- inventory dashboard can show a per-listing sync badge (status, last synced,
-- last error). Re-declares the function with the extra fields; the columns
-- already exist on private.inventory_storefront_listings.

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
