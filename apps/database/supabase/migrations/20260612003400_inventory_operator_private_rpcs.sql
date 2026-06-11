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
        'listingsCount', paged.listings_count,
        'createdAt', paged.created_at::text,
        'updatedAt', paged.updated_at::text
      )
    end as storefront
  from counted
  left join paged on true;
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
      case
        when listing.listing_type = 'product' then greatest(
          coalesce(stock.amount, 0)
          - public._inventory_reserved_quantity(
            listing.product_id,
            listing.unit_id,
            listing.warehouse_id,
            now()
          ),
          0
        )::integer
        else null
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
        'updatedAt', filtered.updated_at::text
      )
    end as listing
  from counted
  left join filtered on true
  order by filtered.sort_order asc nulls last, filtered.created_at desc nulls last;
$$;

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
        'updatedAt', paged.updated_at::text
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

create or replace function private.list_inventory_checkouts(
  p_ws_id uuid,
  p_search text default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  total_count integer,
  checkout jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      checkout.id,
      checkout.ws_id,
      checkout.public_token,
      checkout.status,
      checkout.customer_name,
      checkout.customer_email,
      checkout.customer_phone,
      checkout.note,
      checkout.currency,
      checkout.subtotal_amount,
      checkout.platform_fee_amount,
      checkout.processing_fee_estimate_amount,
      checkout.conversion_fee_estimate_amount,
      checkout.total_amount,
      checkout.expires_at,
      checkout.completed_at,
      checkout.finance_invoice_id,
      checkout.polar_checkout_id,
      checkout.polar_checkout_url,
      checkout.polar_environment,
      checkout.polar_order_id,
      checkout.polar_product_id,
      checkout.polar_status,
      checkout.created_at
    from private.inventory_checkout_sessions checkout
    where checkout.ws_id = p_ws_id
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or checkout.status = p_status
      )
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or checkout.customer_name ilike '%' || p_search || '%'
        or checkout.customer_email ilike '%' || p_search || '%'
        or checkout.public_token ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc nulls last
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
        'publicToken', paged.public_token,
        'status', paged.status,
        'customerName', paged.customer_name,
        'customerEmail', paged.customer_email,
        'customerPhone', paged.customer_phone,
        'note', paged.note,
        'currency', paged.currency,
        'subtotalAmount', paged.subtotal_amount,
        'platformFeeAmount', paged.platform_fee_amount,
        'processingFeeEstimateAmount', paged.processing_fee_estimate_amount,
        'conversionFeeEstimateAmount', paged.conversion_fee_estimate_amount,
        'totalAmount', paged.total_amount,
        'expiresAt', paged.expires_at::text,
        'completedAt', paged.completed_at::text,
        'financeInvoiceId', paged.finance_invoice_id,
        'polarCheckoutId', paged.polar_checkout_id,
        'polarCheckoutUrl', paged.polar_checkout_url,
        'polarEnvironment', paged.polar_environment,
        'polarOrderId', paged.polar_order_id,
        'polarProductId', paged.polar_product_id,
        'polarStatus', paged.polar_status,
        'lines', coalesce(lines.items, '[]'::jsonb)
      )
    end as checkout
  from counted
  left join paged on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', line.id,
        'listingId', line.listing_id,
        'bundleId', line.bundle_id,
        'productId', line.product_id,
        'unitId', line.unit_id,
        'warehouseId', line.warehouse_id,
        'title', line.title,
        'quantity', line.quantity::integer,
        'unitPrice', line.unit_price,
        'subtotalAmount', line.subtotal_amount
      )
      order by line.created_at asc
    ) as items
    from private.inventory_checkout_lines line
    where line.checkout_session_id = paged.id
  ) lines on true;
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
  p_components jsonb default null
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

  if p_bundle_id is null then
    insert into private.inventory_bundles (
      ws_id,
      storefront_id,
      slug,
      name,
      description,
      image_url,
      price,
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
      component_product_id := coalesce(
        component ->> 'productId',
        component ->> 'product_id'
      )::uuid;
      component_unit_id := coalesce(
        component ->> 'unitId',
        component ->> 'unit_id'
      )::uuid;
      component_warehouse_id := coalesce(
        component ->> 'warehouseId',
        component ->> 'warehouse_id'
      )::uuid;
      component_quantity := (component ->> 'quantity')::bigint;

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

  select jsonb_build_object(
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
    'availableQuantity', availability.available_quantity,
    'components', coalesce(components.items, '[]'::jsonb),
    'createdAt', bundle.created_at::text,
    'updatedAt', bundle.updated_at::text
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
     and product.ws_id = bundle.ws_id
    join private.inventory_units unit
      on unit.id = component.unit_id
     and unit.ws_id = bundle.ws_id
    join private.inventory_warehouses warehouse
      on warehouse.id = component.warehouse_id
     and warehouse.ws_id = bundle.ws_id
    join private.inventory_products stock
      on stock.product_id = product.id
     and stock.unit_id = unit.id
     and stock.warehouse_id = warehouse.id
    where component.bundle_id = bundle.id
  ) components on true
  where bundle.id = bundle_row.id
    and bundle.ws_id = p_ws_id;

  return result;
end;
$$;

create or replace function private.create_inventory_checkout_session(
  p_storefront_slug text,
  p_payload jsonb,
  p_now timestamptz default now()
) returns jsonb
language sql
volatile
security definer
set search_path = private, public, pg_temp
as $$
  select public.create_inventory_checkout_session(
    p_storefront_slug := p_storefront_slug,
    p_payload := p_payload,
    p_now := p_now
  );
$$;

create or replace function private.release_inventory_checkout_session(
  p_checkout_id uuid,
  p_now timestamptz default now()
) returns void
language sql
volatile
security definer
set search_path = private, public, pg_temp
as $$
  select public.release_inventory_checkout_session(
    p_checkout_id := p_checkout_id,
    p_now := p_now
  );
$$;

create or replace function private.complete_inventory_checkout_session_payment(
  p_checkout_id uuid,
  p_polar_order_id text,
  p_now timestamptz default now()
) returns uuid
language sql
volatile
security definer
set search_path = private, public, pg_temp
as $$
  select public.complete_inventory_checkout_session_payment(
    p_checkout_id := p_checkout_id,
    p_polar_order_id := p_polar_order_id,
    p_now := p_now
  );
$$;

revoke all on function private.list_inventory_storefronts(
  uuid,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
revoke all on function private.list_inventory_storefront_listings(
  uuid,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function private.list_inventory_bundles(
  uuid,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
revoke all on function private.list_inventory_checkouts(
  uuid,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
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
  jsonb
) from public, anon, authenticated;
revoke all on function private.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) from public, anon, authenticated;
revoke all on function private.release_inventory_checkout_session(
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function private.complete_inventory_checkout_session_payment(
  uuid,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function private.list_inventory_storefronts(
  uuid,
  text,
  text,
  integer,
  integer
) to service_role;
grant execute on function private.list_inventory_storefront_listings(
  uuid,
  uuid,
  text
) to service_role;
grant execute on function private.list_inventory_bundles(
  uuid,
  text,
  text,
  integer,
  integer
) to service_role;
grant execute on function private.list_inventory_checkouts(
  uuid,
  text,
  text,
  integer,
  integer
) to service_role;
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
  jsonb
) to service_role;
grant execute on function private.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) to service_role;
grant execute on function private.release_inventory_checkout_session(
  uuid,
  timestamptz
) to service_role;
grant execute on function private.complete_inventory_checkout_session_payment(
  uuid,
  text,
  timestamptz
) to service_role;
