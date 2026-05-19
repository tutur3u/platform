create or replace function public.create_inventory_checkout_session(
  p_storefront_slug text,
  p_payload jsonb,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  storefront_row private.inventory_storefronts%rowtype;
  checkout_row private.inventory_checkout_sessions%rowtype;
  line_payload jsonb;
  quantity bigint;
  subtotal bigint := 0;
  expires_at timestamptz := p_now + interval '15 minutes';
  listing_row private.inventory_storefront_listings%rowtype;
  bundle_row private.inventory_bundles%rowtype;
  component_row record;
  bundle_component_index integer;
begin
  select *
  into storefront_row
  from private.inventory_storefronts
  where slug = p_storefront_slug
    and status = 'published'
  limit 1;

  if not found then
    raise exception 'STOREFRONT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_payload -> 'lines') <> 'array'
    or jsonb_array_length(p_payload -> 'lines') = 0 then
    raise exception 'CHECKOUT_LINES_REQUIRED'
      using errcode = 'P0001';
  end if;

  insert into private.inventory_checkout_sessions (
    ws_id,
    storefront_id,
    customer_name,
    customer_email,
    customer_phone,
    note,
    currency,
    status,
    expires_at
  )
  values (
    storefront_row.ws_id,
    storefront_row.id,
    coalesce(nullif(p_payload ->> 'customerName', ''), 'Guest'),
    lower(coalesce(nullif(p_payload ->> 'customerEmail', ''), 'guest@example.com')),
    nullif(p_payload ->> 'customerPhone', ''),
    nullif(p_payload ->> 'note', ''),
    storefront_row.currency,
    'reserved',
    expires_at
  )
  returning * into checkout_row;

  for line_payload in
    select value
    from jsonb_array_elements(p_payload -> 'lines')
  loop
    quantity := greatest(coalesce((line_payload ->> 'quantity')::bigint, 1), 1);

    if line_payload ? 'listingId' or line_payload ? 'listing_id' then
      select *
      into listing_row
      from private.inventory_storefront_listings
      where id = coalesce(
          nullif(line_payload ->> 'listingId', '')::uuid,
          nullif(line_payload ->> 'listing_id', '')::uuid
        )
        and storefront_id = storefront_row.id
        and ws_id = storefront_row.ws_id
        and status = 'published'
      limit 1;

      if not found then
        raise exception 'LISTING_NOT_FOUND'
          using errcode = 'P0001';
      end if;

      if quantity > listing_row.max_per_order then
        raise exception 'LISTING_MAX_PER_ORDER_EXCEEDED'
          using errcode = 'P0001';
      end if;

      if listing_row.listing_type = 'product' then
        subtotal := subtotal + public._inventory_create_reserved_line(
          storefront_row.ws_id,
          checkout_row.id,
          listing_row.id,
          null,
          listing_row.product_id,
          listing_row.unit_id,
          listing_row.warehouse_id,
          listing_row.title,
          quantity,
          listing_row.price,
          expires_at,
          p_now
        );
      else
        select *
        into bundle_row
        from private.inventory_bundles
        where id = listing_row.bundle_id
          and ws_id = storefront_row.ws_id
          and status = 'active'
        limit 1;

        if not found then
          raise exception 'BUNDLE_NOT_FOUND'
            using errcode = 'P0001';
        end if;

        bundle_component_index := 0;
        for component_row in
          select
            component.*,
            product.name as product_name
          from private.inventory_bundle_components component
          join public.workspace_products product
            on product.id = component.product_id
            and product.ws_id = storefront_row.ws_id
          join public.inventory_units unit
            on unit.id = component.unit_id
            and unit.ws_id = storefront_row.ws_id
          join public.inventory_warehouses warehouse
            on warehouse.id = component.warehouse_id
            and warehouse.ws_id = storefront_row.ws_id
          join public.inventory_products stock
            on stock.product_id = product.id
            and stock.unit_id = unit.id
            and stock.warehouse_id = warehouse.id
          where component.bundle_id = bundle_row.id
          order by component.created_at, component.id
        loop
          bundle_component_index := bundle_component_index + 1;
          subtotal := subtotal + public._inventory_create_reserved_line(
            storefront_row.ws_id,
            checkout_row.id,
            listing_row.id,
            bundle_row.id,
            component_row.product_id,
            component_row.unit_id,
            component_row.warehouse_id,
            bundle_row.name || ' - ' || component_row.product_name,
            quantity * component_row.quantity,
            case when bundle_component_index = 1 then listing_row.price else 0 end,
            expires_at,
            p_now
          );
        end loop;

        if bundle_component_index = 0 then
          raise exception 'BUNDLE_COMPONENTS_REQUIRED'
            using errcode = 'P0001';
        end if;
      end if;
    elsif line_payload ? 'bundleId' or line_payload ? 'bundle_id' then
      select *
      into bundle_row
      from private.inventory_bundles
      where id = coalesce(
          nullif(line_payload ->> 'bundleId', '')::uuid,
          nullif(line_payload ->> 'bundle_id', '')::uuid
        )
        and ws_id = storefront_row.ws_id
        and status = 'active'
      limit 1;

      if not found then
        raise exception 'BUNDLE_NOT_FOUND'
          using errcode = 'P0001';
      end if;

      if quantity > bundle_row.max_per_order then
        raise exception 'BUNDLE_MAX_PER_ORDER_EXCEEDED'
          using errcode = 'P0001';
      end if;

      bundle_component_index := 0;
      for component_row in
        select
          component.*,
          product.name as product_name
        from private.inventory_bundle_components component
        join public.workspace_products product
          on product.id = component.product_id
          and product.ws_id = storefront_row.ws_id
        join public.inventory_units unit
          on unit.id = component.unit_id
          and unit.ws_id = storefront_row.ws_id
        join public.inventory_warehouses warehouse
          on warehouse.id = component.warehouse_id
          and warehouse.ws_id = storefront_row.ws_id
        join public.inventory_products stock
          on stock.product_id = product.id
          and stock.unit_id = unit.id
          and stock.warehouse_id = warehouse.id
        where component.bundle_id = bundle_row.id
        order by component.created_at, component.id
      loop
        bundle_component_index := bundle_component_index + 1;
        subtotal := subtotal + public._inventory_create_reserved_line(
          storefront_row.ws_id,
          checkout_row.id,
          null,
          bundle_row.id,
          component_row.product_id,
          component_row.unit_id,
          component_row.warehouse_id,
          bundle_row.name || ' - ' || component_row.product_name,
          quantity * component_row.quantity,
          case when bundle_component_index = 1 then bundle_row.price else 0 end,
          expires_at,
          p_now
        );
      end loop;

      if bundle_component_index = 0 then
        raise exception 'BUNDLE_COMPONENTS_REQUIRED'
          using errcode = 'P0001';
      end if;
    else
      raise exception 'CHECKOUT_LINE_TARGET_REQUIRED'
        using errcode = 'P0001';
    end if;
  end loop;

  update private.inventory_checkout_sessions
  set
    subtotal_amount = subtotal,
    total_amount = subtotal,
    updated_at = p_now
  where id = checkout_row.id
  returning * into checkout_row;

  insert into private.inventory_settlement_ledger_entries (
    ws_id,
    checkout_session_id,
    entry_kind,
    amount,
    currency,
    source
  )
  values
    (
      checkout_row.ws_id,
      checkout_row.id,
      'subtotal',
      subtotal,
      checkout_row.currency,
      'estimate'
    ),
    (
      checkout_row.ws_id,
      checkout_row.id,
      'platform_fee_estimate',
      checkout_row.platform_fee_amount,
      checkout_row.currency,
      'estimate'
    ),
    (
      checkout_row.ws_id,
      checkout_row.id,
      'total',
      checkout_row.total_amount,
      checkout_row.currency,
      'estimate'
    );

  return jsonb_build_object(
    'id', checkout_row.id,
    'publicToken', checkout_row.public_token,
    'status', checkout_row.status,
    'expiresAt', checkout_row.expires_at,
    'totalAmount', checkout_row.total_amount
  );
end;
$$;

revoke all on function public.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) from public;
grant execute on function public.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) to service_role;

drop function if exists public._inventory_create_reserved_line(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  bigint,
  bigint,
  timestamptz,
  timestamptz
);
