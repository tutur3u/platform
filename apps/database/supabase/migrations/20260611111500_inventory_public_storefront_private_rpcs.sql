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

create or replace function private.get_inventory_checkout_by_public_token(
  p_public_token text
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with checkout_session as (
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
      checkout.polar_status
    from private.inventory_checkout_sessions checkout
    where checkout.public_token = p_public_token
    limit 1
  )
  select jsonb_build_object(
    'id', checkout_session.id,
    'wsId', checkout_session.ws_id,
    'publicToken', checkout_session.public_token,
    'status', checkout_session.status,
    'customerName', checkout_session.customer_name,
    'customerEmail', checkout_session.customer_email,
    'customerPhone', checkout_session.customer_phone,
    'note', checkout_session.note,
    'currency', checkout_session.currency,
    'subtotalAmount', checkout_session.subtotal_amount,
    'platformFeeAmount', checkout_session.platform_fee_amount,
    'processingFeeEstimateAmount', checkout_session.processing_fee_estimate_amount,
    'conversionFeeEstimateAmount', checkout_session.conversion_fee_estimate_amount,
    'totalAmount', checkout_session.total_amount,
    'expiresAt', checkout_session.expires_at::text,
    'completedAt', checkout_session.completed_at::text,
    'financeInvoiceId', checkout_session.finance_invoice_id,
    'polarCheckoutId', checkout_session.polar_checkout_id,
    'polarCheckoutUrl', checkout_session.polar_checkout_url,
    'polarEnvironment', checkout_session.polar_environment,
    'polarOrderId', checkout_session.polar_order_id,
    'polarProductId', checkout_session.polar_product_id,
    'polarStatus', checkout_session.polar_status,
    'lines', coalesce(lines.items, '[]'::jsonb)
  )
  from checkout_session
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
        'quantity', line.quantity::int,
        'unitPrice', line.unit_price,
        'subtotalAmount', line.subtotal_amount
      )
      order by line.created_at asc
    ) as items
    from private.inventory_checkout_lines line
    where line.checkout_session_id = checkout_session.id
  ) lines on true;
$$;

revoke all on function private.get_public_inventory_storefront(
  text,
  timestamptz
) from public, anon, authenticated;

revoke all on function private.get_inventory_checkout_by_public_token(
  text
) from public, anon, authenticated;

grant execute on function private.get_public_inventory_storefront(
  text,
  timestamptz
) to service_role;

grant execute on function private.get_inventory_checkout_by_public_token(
  text
) to service_role;
