-- Thread the chosen variant through checkout + reservations.
--
-- Additive: variant_id is nullable on checkout lines and reservations, so
-- existing rows, bundle lines, and variant-less listings stay null and behave
-- exactly as before. The checkout RPC computes the variant's price + stock
-- coordinate authoritatively server-side (the client only sends a variantId);
-- when a listing has active variants a variantId becomes required so a stale
-- client cannot silently buy the listing-level coordinate.

alter table private.inventory_checkout_lines
  add column if not exists variant_id uuid
    references private.inventory_storefront_listing_variants(id) on delete set null;

alter table private.inventory_reservations
  add column if not exists variant_id uuid
    references private.inventory_storefront_listing_variants(id) on delete set null;

-- Adding a parameter creates a new overload, so drop the previous 12-arg
-- signature first. The only caller is create_inventory_checkout_session, which
-- is replaced below to use the new signature.
drop function if exists public._inventory_create_reserved_line(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, bigint, bigint, timestamptz, timestamptz
);

create or replace function public._inventory_create_reserved_line(
  p_ws_id uuid,
  p_checkout_id uuid,
  p_listing_id uuid,
  p_bundle_id uuid,
  p_product_id uuid,
  p_unit_id uuid,
  p_warehouse_id uuid,
  p_title text,
  p_quantity bigint,
  p_unit_price bigint,
  p_expires_at timestamptz,
  p_now timestamptz,
  p_variant_id uuid default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_row private.inventory_products%rowtype;
  reserved_quantity bigint;
  available_quantity bigint;
  new_line_id uuid;
  line_subtotal bigint;
begin
  select stock.*
  into stock_row
  from private.inventory_products stock
  join public.workspace_products product
    on product.id = stock.product_id
  join private.inventory_units unit
    on unit.id = stock.unit_id
  join private.inventory_warehouses warehouse
    on warehouse.id = stock.warehouse_id
  where stock.product_id = p_product_id
    and stock.unit_id = p_unit_id
    and stock.warehouse_id = p_warehouse_id
    and product.ws_id = p_ws_id
    and unit.ws_id = p_ws_id
    and warehouse.ws_id = p_ws_id
  for update of stock;

  if not found then
    raise exception 'INVENTORY_STOCK_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if stock_row.amount is not null then
    reserved_quantity := public._inventory_reserved_quantity(
      p_product_id,
      p_unit_id,
      p_warehouse_id,
      p_now
    );
    available_quantity := stock_row.amount - reserved_quantity;

    if available_quantity < p_quantity then
      raise exception 'INSUFFICIENT_STOCK'
        using errcode = 'P0001';
    end if;
  end if;

  line_subtotal := p_quantity * p_unit_price;

  insert into private.inventory_checkout_lines (
    checkout_session_id,
    listing_id,
    bundle_id,
    variant_id,
    product_id,
    unit_id,
    warehouse_id,
    title,
    quantity,
    unit_price,
    subtotal_amount
  )
  values (
    p_checkout_id,
    p_listing_id,
    p_bundle_id,
    p_variant_id,
    p_product_id,
    p_unit_id,
    p_warehouse_id,
    p_title,
    p_quantity,
    p_unit_price,
    line_subtotal
  )
  returning id into new_line_id;

  insert into private.inventory_reservations (
    checkout_session_id,
    checkout_line_id,
    variant_id,
    product_id,
    unit_id,
    warehouse_id,
    amount,
    status,
    expires_at
  )
  values (
    p_checkout_id,
    new_line_id,
    p_variant_id,
    p_product_id,
    p_unit_id,
    p_warehouse_id,
    p_quantity,
    'reserved',
    p_expires_at
  );

  return line_subtotal;
end;
$$;

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
  variant_row private.inventory_storefront_listing_variants%rowtype;
  listing_has_variants boolean;
  variant_label text;
  variant_unit_price bigint;
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
    customer_auth_uid,
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
    nullif(p_payload ->> 'customerAuthUid', '')::uuid,
    coalesce(nullif(p_payload ->> 'customerName', ''), 'Tuturuuu buyer'),
    lower(coalesce(nullif(p_payload ->> 'customerEmail', ''), 'buyer@users.tuturuuu.local')),
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
        select exists (
          select 1
          from private.inventory_storefront_listing_variants v
          where v.listing_id = listing_row.id
            and v.status = 'active'
        )
        into listing_has_variants;

        if listing_has_variants then
          -- A listing with active variants must be purchased by variant; the
          -- server picks the coordinate + price, never the client.
          select *
          into variant_row
          from private.inventory_storefront_listing_variants
          where id = coalesce(
              nullif(line_payload ->> 'variantId', '')::uuid,
              nullif(line_payload ->> 'variant_id', '')::uuid
            )
            and listing_id = listing_row.id
            and ws_id = storefront_row.ws_id
            and status = 'active'
          limit 1;

          if not found then
            if (line_payload ? 'variantId') or (line_payload ? 'variant_id') then
              raise exception 'VARIANT_NOT_FOUND'
                using errcode = 'P0001';
            else
              raise exception 'LISTING_VARIANT_REQUIRED'
                using errcode = 'P0001';
            end if;
          end if;

          variant_unit_price := coalesce(variant_row.price, listing_row.price);

          variant_label := coalesce(
            nullif(variant_row.title, ''),
            listing_row.title || ' - ' || coalesce(
              (
                select string_agg(value.label, ' / ' order by grp.sort_order, value.sort_order)
                from private.inventory_listing_variant_option_values link
                join private.inventory_listing_option_values value
                  on value.id = link.value_id
                join private.inventory_listing_option_groups grp
                  on grp.id = link.group_id
                where link.variant_id = variant_row.id
              ),
              coalesce(nullif(variant_row.sku, ''), 'variant')
            )
          );

          subtotal := subtotal + public._inventory_create_reserved_line(
            storefront_row.ws_id,
            checkout_row.id,
            listing_row.id,
            null,
            variant_row.product_id,
            variant_row.unit_id,
            variant_row.warehouse_id,
            variant_label,
            quantity,
            variant_unit_price,
            expires_at,
            p_now,
            variant_row.id
          );
        else
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
            p_now,
            null
          );
        end if;
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
          join private.inventory_units unit
            on unit.id = component.unit_id
            and unit.ws_id = storefront_row.ws_id
          join private.inventory_warehouses warehouse
            on warehouse.id = component.warehouse_id
            and warehouse.ws_id = storefront_row.ws_id
          join private.inventory_products stock
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
            p_now,
            null
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
        join private.inventory_units unit
          on unit.id = component.unit_id
          and unit.ws_id = storefront_row.ws_id
        join private.inventory_warehouses warehouse
          on warehouse.id = component.warehouse_id
          and warehouse.ws_id = storefront_row.ws_id
        join private.inventory_products stock
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
          p_now,
          null
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

revoke all on function public._inventory_create_reserved_line(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, bigint, bigint, timestamptz, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public._inventory_create_reserved_line(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, bigint, bigint, timestamptz, timestamptz, uuid
) to service_role;

revoke all on function public.create_inventory_checkout_session(
  text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_inventory_checkout_session(
  text, jsonb, timestamptz
) to service_role;
