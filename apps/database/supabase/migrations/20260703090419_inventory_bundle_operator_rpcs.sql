drop function if exists private.upsert_inventory_bundle_with_components(
  uuid, uuid, uuid, text, text, text, text, bigint, text, integer, jsonb
);

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
      bundle.*,
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
        'pricingMode', paged.pricing_mode,
        'categoryCandidateScope', paged.category_candidate_scope,
        'status', paged.status,
        'maxPerOrder', paged.max_per_order,
        'availableQuantity', paged.available_quantity,
        'components', private.inventory_bundle_fixed_components_json(paged.id, p_ws_id),
        'categoryComponents', private.inventory_bundle_category_components_json(
          paged.id,
          p_ws_id,
          paged.storefront_id,
          'USD',
          now(),
          false
        ),
        'createdAt', paged.created_at::text,
        'updatedAt', paged.updated_at::text,
        'polarProductId', paged.polar_product_id,
        'polarPriceId', paged.polar_price_id,
        'polarSyncStatus', paged.polar_sync_status,
        'polarSyncedAt', paged.polar_synced_at::text,
        'polarLastError', paged.polar_last_error
      )
    end as bundle
  from counted
  left join paged on true;
$$;

create or replace function private.upsert_inventory_bundle_with_components(
  p_ws_id uuid,
  p_bundle_id uuid default null,
  p_storefront_id uuid default null,
  p_slug text default null,
  p_name text default null,
  p_description text default null,
  p_image_url text default null,
  p_price bigint default null,
  p_status text default null,
  p_max_per_order integer default null,
  p_components jsonb default null,
  p_pricing_mode text default null,
  p_category_candidate_scope text default null,
  p_category_components jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  bundle_row private.inventory_bundles%rowtype;
  component jsonb;
  component_product_id uuid;
  component_unit_id uuid;
  component_warehouse_id uuid;
  component_quantity bigint;
  category_component jsonb;
  category_id uuid;
  category_quantity integer;
  free_quantity integer;
  discount_strategy text;
  result jsonb;
begin
  if p_storefront_id is not null and not exists (
    select 1
    from private.inventory_storefronts storefront
    where storefront.id = p_storefront_id
      and storefront.ws_id = p_ws_id
  ) then
    raise exception 'INVALID_INVENTORY_STOREFRONT'
      using errcode = 'P0001';
  end if;

  if coalesce(p_pricing_mode, 'fixed_price') not in ('fixed_price', 'selected_items') then
    raise exception 'INVALID_BUNDLE_PRICING_MODE'
      using errcode = 'P0001';
  end if;

  if coalesce(p_category_candidate_scope, 'published_listings') not in ('published_listings', 'all_stock') then
    raise exception 'INVALID_BUNDLE_CATEGORY_CANDIDATE_SCOPE'
      using errcode = 'P0001';
  end if;

  if p_bundle_id is null then
    insert into private.inventory_bundles (
      ws_id,
      storefront_id,
      slug,
      name,
      description,
      image_url,
      price,
      pricing_mode,
      category_candidate_scope,
      status,
      max_per_order
    )
    values (
      p_ws_id,
      p_storefront_id,
      p_slug,
      p_name,
      p_description,
      p_image_url,
      coalesce(p_price, 0),
      coalesce(p_pricing_mode, 'fixed_price'),
      coalesce(p_category_candidate_scope, 'published_listings'),
      coalesce(p_status, 'draft'),
      coalesce(p_max_per_order, 99)
    )
    returning * into bundle_row;
  else
    update private.inventory_bundles
    set
      storefront_id = p_storefront_id,
      slug = coalesce(p_slug, slug),
      name = coalesce(p_name, name),
      description = p_description,
      image_url = p_image_url,
      price = coalesce(p_price, price),
      pricing_mode = coalesce(p_pricing_mode, pricing_mode),
      category_candidate_scope = coalesce(p_category_candidate_scope, category_candidate_scope),
      status = coalesce(p_status, status),
      max_per_order = coalesce(p_max_per_order, max_per_order),
      updated_at = now()
    where id = p_bundle_id
      and ws_id = p_ws_id
    returning * into bundle_row;

    if not found then
      return null;
    end if;
  end if;

  if p_components is not null then
    delete from private.inventory_bundle_components
    where bundle_id = bundle_row.id;

    for component in
      select value
      from jsonb_array_elements(p_components)
    loop
      component_product_id := coalesce(component ->> 'productId', component ->> 'product_id')::uuid;
      component_unit_id := coalesce(component ->> 'unitId', component ->> 'unit_id')::uuid;
      component_warehouse_id := coalesce(component ->> 'warehouseId', component ->> 'warehouse_id')::uuid;
      component_quantity := greatest(coalesce((component ->> 'quantity')::bigint, 1), 1);

      if not exists (
        select 1
        from private.inventory_products stock
        join public.workspace_products product
          on product.id = stock.product_id
        join private.inventory_units unit
          on unit.id = stock.unit_id
        join private.inventory_warehouses warehouse
          on warehouse.id = stock.warehouse_id
        where product.ws_id = p_ws_id
          and unit.ws_id = p_ws_id
          and warehouse.ws_id = p_ws_id
          and stock.product_id = component_product_id
          and stock.unit_id = component_unit_id
          and stock.warehouse_id = component_warehouse_id
      ) then
        raise exception 'INVALID_BUNDLE_COMPONENT_WORKSPACE_SCOPE'
          using errcode = 'P0001';
      end if;

      insert into private.inventory_bundle_components (
        bundle_id,
        product_id,
        unit_id,
        warehouse_id,
        quantity
      )
      values (
        bundle_row.id,
        component_product_id,
        component_unit_id,
        component_warehouse_id,
        component_quantity
      );
    end loop;
  end if;

  if p_category_components is not null then
    delete from private.inventory_bundle_category_components
    where bundle_id = bundle_row.id;

    for category_component in
      select value
      from jsonb_array_elements(p_category_components)
    loop
      category_id := coalesce(
        category_component ->> 'categoryId',
        category_component ->> 'category_id'
      )::uuid;
      category_quantity := greatest(coalesce(
        (category_component ->> 'quantityRequired')::integer,
        (category_component ->> 'quantity_required')::integer,
        1
      ), 1);
      free_quantity := greatest(coalesce(
        (category_component ->> 'freeQuantity')::integer,
        (category_component ->> 'free_quantity')::integer,
        0
      ), 0);
      discount_strategy := coalesce(
        nullif(category_component ->> 'discountStrategy', ''),
        nullif(category_component ->> 'discount_strategy', ''),
        'cheapest_free'
      );

      if free_quantity > category_quantity then
        raise exception 'INVALID_BUNDLE_CATEGORY_FREE_QUANTITY'
          using errcode = 'P0001';
      end if;

      if discount_strategy not in ('none', 'cheapest_free') then
        raise exception 'INVALID_BUNDLE_CATEGORY_DISCOUNT_STRATEGY'
          using errcode = 'P0001';
      end if;

      if not exists (
        select 1
        from public.product_categories category
        where category.id = category_id
          and category.ws_id = p_ws_id
      ) then
        raise exception 'INVALID_BUNDLE_CATEGORY_COMPONENT_WORKSPACE_SCOPE'
          using errcode = 'P0001';
      end if;

      insert into private.inventory_bundle_category_components (
        bundle_id,
        category_id,
        quantity_required,
        free_quantity,
        discount_strategy,
        sort_order
      )
      values (
        bundle_row.id,
        category_id,
        category_quantity,
        free_quantity,
        discount_strategy,
        coalesce((category_component ->> 'sortOrder')::integer, 0)
      );
    end loop;
  end if;

  select jsonb_build_object(
    'id', bundle.id,
    'wsId', bundle.ws_id,
    'storefrontId', bundle.storefront_id,
    'slug', bundle.slug,
    'name', bundle.name,
    'description', bundle.description,
    'imageUrl', bundle.image_url,
    'price', bundle.price,
    'pricingMode', bundle.pricing_mode,
    'categoryCandidateScope', bundle.category_candidate_scope,
    'status', bundle.status,
    'maxPerOrder', bundle.max_per_order,
    'availableQuantity', availability.available_quantity,
    'components', private.inventory_bundle_fixed_components_json(bundle.id, p_ws_id),
    'categoryComponents', private.inventory_bundle_category_components_json(
      bundle.id,
      p_ws_id,
      bundle.storefront_id,
      'USD',
      now(),
      false
    ),
    'createdAt', bundle.created_at::text,
    'updatedAt', bundle.updated_at::text,
    'polarProductId', bundle.polar_product_id,
    'polarPriceId', bundle.polar_price_id,
    'polarSyncStatus', bundle.polar_sync_status,
    'polarSyncedAt', bundle.polar_synced_at::text,
    'polarLastError', bundle.polar_last_error
  )
  into result
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
  where bundle.id = bundle_row.id
    and bundle.ws_id = p_ws_id;

  return result;
end;
$$;

revoke all on function private.list_inventory_bundles(
  uuid, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function private.list_inventory_bundles(
  uuid, text, text, integer, integer
) to service_role;

revoke all on function private.upsert_inventory_bundle_with_components(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  text,
  integer,
  jsonb,
  text,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function private.upsert_inventory_bundle_with_components(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  text,
  integer,
  jsonb,
  text,
  text,
  jsonb
) to service_role;
