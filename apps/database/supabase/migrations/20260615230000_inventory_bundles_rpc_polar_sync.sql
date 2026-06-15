-- Surface Polar sync state on the workspace bundles RPC so the inventory
-- dashboard can show a per-bundle sync badge (status, last synced, last error),
-- mirroring the storefront listings. Columns already exist on
-- private.inventory_bundles.

create or replace function private.list_inventory_bundles(
  p_ws_id uuid,
  p_search text default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  total_count integer,
  bundle jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      bundle.id,
      bundle.ws_id,
      bundle.storefront_id,
      bundle.slug,
      bundle.name,
      bundle.description,
      bundle.image_url,
      bundle.price,
      bundle.status,
      bundle.max_per_order,
      bundle.created_at,
      bundle.updated_at,
      bundle.polar_sync_status,
      bundle.polar_synced_at,
      bundle.polar_last_error,
      availability.available_quantity
    from private.inventory_bundles bundle
    left join lateral (
      select min(
        floor(
          greatest(
            case
              when stock.product_id is null then 0
              else coalesce(stock.amount, 0)
                - public._inventory_reserved_quantity(
                  component.product_id,
                  component.unit_id,
                  component.warehouse_id,
                  now()
                )
            end,
            0
          ) / nullif(component.quantity, 0)
        )
      )::integer as available_quantity
      from private.inventory_bundle_components component
      left join public.workspace_products product
        on product.id = component.product_id
       and product.ws_id = bundle.ws_id
      left join private.inventory_products stock
        on stock.product_id = product.id
       and stock.unit_id = component.unit_id
       and stock.warehouse_id = component.warehouse_id
      where component.bundle_id = bundle.id
    ) availability on true
    where bundle.ws_id = p_ws_id
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or bundle.status = p_status
      )
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or bundle.name ilike '%' || p_search || '%'
        or bundle.slug ilike '%' || p_search || '%'
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
        'storefrontId', paged.storefront_id,
        'slug', paged.slug,
        'name', paged.name,
        'description', paged.description,
        'imageUrl', paged.image_url,
        'price', paged.price,
        'status', paged.status,
        'maxPerOrder', paged.max_per_order,
        'availableQuantity', paged.available_quantity,
        'components', coalesce(components.items, '[]'::jsonb),
        'createdAt', paged.created_at::text,
        'updatedAt', paged.updated_at::text,
        'polarSyncStatus', paged.polar_sync_status,
        'polarSyncedAt', paged.polar_synced_at::text,
        'polarLastError', paged.polar_last_error
      )
    end as bundle
  from counted
  left join paged on true
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
        'quantity', component.quantity::integer
      )
      order by product.name asc, component.created_at asc
    ) as items
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
    where component.bundle_id = paged.id
  ) components on true;
$$;
