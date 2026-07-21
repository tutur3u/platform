create or replace function public._inventory_reserve_bundle_components(
  p_ws_id uuid,
  p_checkout_id uuid,
  p_storefront_id uuid,
  p_listing_id uuid,
  p_bundle_id uuid,
  p_line_payload jsonb,
  p_quantity bigint,
  p_fixed_price bigint,
  p_currency text,
  p_expires_at timestamptz,
  p_now timestamptz
) returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  bundle_row private.inventory_bundles%rowtype;
  component_row record;
  category_component_row record;
  bundle_component_index integer := 0;
  category_component_count integer := 0;
  line_subtotal bigint := 0;
  line_price bigint;
  bundle_selections jsonb;
  selection_payload jsonb;
  selection_items jsonb;
  selection_item jsonb;
  selected_quantity bigint;
  item_quantity bigint;
  candidate_listing_id uuid;
  candidate_variant_id uuid;
  candidate_product_id uuid;
  candidate_unit_id uuid;
  candidate_warehouse_id uuid;
  candidate_title text;
  candidate_price bigint;
  selected_index integer;
  selected_row record;
  effective_quantity bigint;
  free_remaining bigint;
  free_units bigint;
  paid_units bigint;
  fixed_price_applied boolean := false;
begin
  select *
  into bundle_row
  from private.inventory_bundles
  where id = p_bundle_id
    and ws_id = p_ws_id
    and status = 'active'
  limit 1;

  if not found then
    raise exception 'BUNDLE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if p_quantity > bundle_row.max_per_order then
    raise exception 'BUNDLE_MAX_PER_ORDER_EXCEEDED'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into category_component_count
  from private.inventory_bundle_category_components component
  where component.bundle_id = bundle_row.id;

  for component_row in
    select
      component.*,
      product.name as product_name,
      stock.price as stock_price
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
    where component.bundle_id = bundle_row.id
    order by component.created_at, component.id
  loop
    bundle_component_index := bundle_component_index + 1;
    effective_quantity := p_quantity * component_row.quantity;

    if bundle_row.pricing_mode = 'selected_items' then
      line_price := private.inventory_major_to_minor(
        component_row.stock_price,
        p_currency
      );
      line_subtotal := line_subtotal + public._inventory_create_reserved_line(
        p_ws_id,
        p_checkout_id,
        p_listing_id,
        bundle_row.id,
        component_row.product_id,
        component_row.unit_id,
        component_row.warehouse_id,
        bundle_row.name || ' - ' || component_row.product_name,
        effective_quantity,
        line_price,
        p_expires_at,
        p_now,
        null
      );
    elsif not fixed_price_applied then
      -- A fixed-price bundle is one sellable unit even when its first stock
      -- component consumes several units. Keep the charged line at the number
      -- of bundles purchased, then reserve the remaining included units on a
      -- zero-priced line so Square and every other provider receive the exact
      -- fixed bundle total without weakening stock consumption.
      line_price := coalesce(p_fixed_price, bundle_row.price);
      line_subtotal := line_subtotal + public._inventory_create_reserved_line(
        p_ws_id,
        p_checkout_id,
        p_listing_id,
        bundle_row.id,
        component_row.product_id,
        component_row.unit_id,
        component_row.warehouse_id,
        bundle_row.name || ' - ' || component_row.product_name,
        p_quantity,
        line_price,
        p_expires_at,
        p_now,
        null
      );

      if effective_quantity > p_quantity then
        line_subtotal := line_subtotal + public._inventory_create_reserved_line(
          p_ws_id,
          p_checkout_id,
          p_listing_id,
          bundle_row.id,
          component_row.product_id,
          component_row.unit_id,
          component_row.warehouse_id,
          bundle_row.name || ' - ' || component_row.product_name || ' (included)',
          effective_quantity - p_quantity,
          0,
          p_expires_at,
          p_now,
          null
        );
      end if;

      fixed_price_applied := true;
    else
      line_subtotal := line_subtotal + public._inventory_create_reserved_line(
        p_ws_id,
        p_checkout_id,
        p_listing_id,
        bundle_row.id,
        component_row.product_id,
        component_row.unit_id,
        component_row.warehouse_id,
        bundle_row.name || ' - ' || component_row.product_name || ' (included)',
        effective_quantity,
        0,
        p_expires_at,
        p_now,
        null
      );
    end if;
  end loop;

  if jsonb_typeof(p_line_payload -> 'bundleSelections') in ('array', 'object') then
    bundle_selections := p_line_payload -> 'bundleSelections';
  elsif jsonb_typeof(p_line_payload -> 'bundle_selections') in ('array', 'object') then
    bundle_selections := p_line_payload -> 'bundle_selections';
  else
    bundle_selections := '[]'::jsonb;
  end if;

  create temporary table if not exists pg_temp.inventory_bundle_selected_items (
    row_index integer,
    product_id uuid,
    unit_id uuid,
    warehouse_id uuid,
    listing_id uuid,
    variant_id uuid,
    title text,
    quantity bigint,
    unit_price bigint
  ) on commit drop;

  for category_component_row in
    select
      component.*,
      category.name as category_name
    from private.inventory_bundle_category_components component
    join public.product_categories category
      on category.id = component.category_id
     and category.ws_id = p_ws_id
    where component.bundle_id = bundle_row.id
    order by component.sort_order asc, category.name asc, component.created_at asc
  loop
    truncate table pg_temp.inventory_bundle_selected_items;
    selection_payload := null;

    if jsonb_typeof(bundle_selections) = 'object' then
      selection_payload := bundle_selections -> category_component_row.id::text;
    else
      for selection_payload in
        select value
        from jsonb_array_elements(bundle_selections)
        where nullif(coalesce(value ->> 'componentId', value ->> 'component_id'), '')::uuid = category_component_row.id
        limit 1
      loop
        exit;
      end loop;
    end if;

    if selection_payload is null then
      raise exception 'BUNDLE_CATEGORY_SELECTION_REQUIRED'
        using errcode = 'P0001';
    end if;

    if jsonb_typeof(selection_payload) = 'array' then
      selection_items := selection_payload;
    elsif jsonb_typeof(selection_payload -> 'items') = 'array' then
      selection_items := selection_payload -> 'items';
    elsif jsonb_typeof(selection_payload -> 'selections') = 'array' then
      selection_items := selection_payload -> 'selections';
    else
      raise exception 'BUNDLE_CATEGORY_SELECTION_ITEMS_REQUIRED'
        using errcode = 'P0001';
    end if;

    selected_quantity := 0;
    selected_index := 0;

    for selection_item in
      select value
      from jsonb_array_elements(selection_items)
    loop
      selected_index := selected_index + 1;
      item_quantity := greatest(coalesce((selection_item ->> 'quantity')::bigint, 1), 1);
      candidate_listing_id := nullif(selection_item ->> 'listingId', '')::uuid;
      if candidate_listing_id is null then
        candidate_listing_id := nullif(selection_item ->> 'listing_id', '')::uuid;
      end if;
      candidate_variant_id := nullif(selection_item ->> 'variantId', '')::uuid;
      if candidate_variant_id is null then
        candidate_variant_id := nullif(selection_item ->> 'variant_id', '')::uuid;
      end if;
      candidate_product_id := null;
      candidate_unit_id := null;
      candidate_warehouse_id := null;
      candidate_title := null;
      candidate_price := null;

      if candidate_listing_id is not null and candidate_variant_id is not null then
        select
          variant.product_id,
          variant.unit_id,
          variant.warehouse_id,
          coalesce(variant.title, listing.title),
          coalesce(variant.price, listing.price)
        into
          candidate_product_id,
          candidate_unit_id,
          candidate_warehouse_id,
          candidate_title,
          candidate_price
        from private.inventory_storefront_listing_variants variant
        join private.inventory_storefront_listings listing
          on listing.id = variant.listing_id
         and listing.id = candidate_listing_id
         and listing.storefront_id = p_storefront_id
         and listing.ws_id = p_ws_id
         and listing.status = 'published'
         and listing.listing_type = 'product'
        join public.workspace_products product
          on product.id = variant.product_id
         and product.ws_id = p_ws_id
         and product.category_id = category_component_row.category_id
        where variant.id = candidate_variant_id
          and variant.ws_id = p_ws_id
          and variant.status = 'active'
        limit 1;
      elsif candidate_listing_id is not null then
        select
          listing.product_id,
          listing.unit_id,
          listing.warehouse_id,
          listing.title,
          listing.price
        into
          candidate_product_id,
          candidate_unit_id,
          candidate_warehouse_id,
          candidate_title,
          candidate_price
        from private.inventory_storefront_listings listing
        join public.workspace_products product
          on product.id = listing.product_id
         and product.ws_id = p_ws_id
         and product.category_id = category_component_row.category_id
        where listing.id = candidate_listing_id
          and listing.storefront_id = p_storefront_id
          and listing.ws_id = p_ws_id
          and listing.status = 'published'
          and listing.listing_type = 'product'
          and not exists (
            select 1
            from private.inventory_storefront_listing_variants variant
            where variant.listing_id = listing.id
              and variant.status = 'active'
          )
        limit 1;
      elsif bundle_row.category_candidate_scope = 'all_stock' then
        candidate_product_id := coalesce(
          nullif(selection_item ->> 'productId', '')::uuid,
          nullif(selection_item ->> 'product_id', '')::uuid
        );
        candidate_unit_id := coalesce(
          nullif(selection_item ->> 'unitId', '')::uuid,
          nullif(selection_item ->> 'unit_id', '')::uuid
        );
        candidate_warehouse_id := coalesce(
          nullif(selection_item ->> 'warehouseId', '')::uuid,
          nullif(selection_item ->> 'warehouse_id', '')::uuid
        );

        select
          product.name,
          private.inventory_major_to_minor(stock.price, p_currency)
        into candidate_title, candidate_price
        from private.inventory_products stock
        join public.workspace_products product
          on product.id = stock.product_id
         and product.ws_id = p_ws_id
         and product.category_id = category_component_row.category_id
         and product.archived = false
        where stock.product_id = candidate_product_id
          and stock.unit_id = candidate_unit_id
          and stock.warehouse_id = candidate_warehouse_id
        limit 1;
      end if;

      if candidate_product_id is null
        or candidate_unit_id is null
        or candidate_warehouse_id is null
        or candidate_price is null then
        raise exception 'BUNDLE_CATEGORY_SELECTION_ITEM_NOT_FOUND'
          using errcode = 'P0001';
      end if;

      insert into pg_temp.inventory_bundle_selected_items (
        row_index,
        product_id,
        unit_id,
        warehouse_id,
        listing_id,
        variant_id,
        title,
        quantity,
        unit_price
      )
      values (
        selected_index,
        candidate_product_id,
        candidate_unit_id,
        candidate_warehouse_id,
        candidate_listing_id,
        candidate_variant_id,
        coalesce(candidate_title, bundle_row.name),
        item_quantity,
        candidate_price
      );

      selected_quantity := selected_quantity + item_quantity;
    end loop;

    if selected_quantity <> category_component_row.quantity_required then
      raise exception 'BUNDLE_CATEGORY_SELECTION_QUANTITY_MISMATCH'
        using errcode = 'P0001';
    end if;

    if bundle_row.pricing_mode = 'fixed_price' then
      for selected_row in
        select *
        from pg_temp.inventory_bundle_selected_items
        order by row_index asc
      loop
        effective_quantity := selected_row.quantity * p_quantity;

        if not fixed_price_applied then
          line_subtotal := line_subtotal + public._inventory_create_reserved_line(
            p_ws_id,
            p_checkout_id,
            coalesce(selected_row.listing_id, p_listing_id),
            bundle_row.id,
            selected_row.product_id,
            selected_row.unit_id,
            selected_row.warehouse_id,
            bundle_row.name || ' - ' || selected_row.title,
            p_quantity,
            coalesce(p_fixed_price, bundle_row.price),
            p_expires_at,
            p_now,
            selected_row.variant_id
          );

          if effective_quantity > p_quantity then
            line_subtotal := line_subtotal + public._inventory_create_reserved_line(
              p_ws_id,
              p_checkout_id,
              coalesce(selected_row.listing_id, p_listing_id),
              bundle_row.id,
              selected_row.product_id,
              selected_row.unit_id,
              selected_row.warehouse_id,
              bundle_row.name || ' - ' || selected_row.title || ' (included)',
              effective_quantity - p_quantity,
              0,
              p_expires_at,
              p_now,
              selected_row.variant_id
            );
          end if;

          fixed_price_applied := true;
        else
          line_subtotal := line_subtotal + public._inventory_create_reserved_line(
            p_ws_id,
            p_checkout_id,
            coalesce(selected_row.listing_id, p_listing_id),
            bundle_row.id,
            selected_row.product_id,
            selected_row.unit_id,
            selected_row.warehouse_id,
            bundle_row.name || ' - ' || selected_row.title || ' (included)',
            effective_quantity,
            0,
            p_expires_at,
            p_now,
            selected_row.variant_id
          );
        end if;
      end loop;
    else
      free_remaining := case
        when category_component_row.discount_strategy = 'cheapest_free'
          then category_component_row.free_quantity * p_quantity
        else 0
      end;

      for selected_row in
        select *
        from pg_temp.inventory_bundle_selected_items
        order by unit_price asc, row_index asc
      loop
        effective_quantity := selected_row.quantity * p_quantity;
        free_units := least(effective_quantity, free_remaining);
        paid_units := effective_quantity - free_units;
        free_remaining := free_remaining - free_units;

        if free_units > 0 then
          line_subtotal := line_subtotal + public._inventory_create_reserved_line(
            p_ws_id,
            p_checkout_id,
            coalesce(selected_row.listing_id, p_listing_id),
            bundle_row.id,
            selected_row.product_id,
            selected_row.unit_id,
            selected_row.warehouse_id,
            bundle_row.name || ' - ' || selected_row.title || ' (free)',
            free_units,
            0,
            p_expires_at,
            p_now,
            selected_row.variant_id
          );
        end if;

        if paid_units > 0 then
          line_subtotal := line_subtotal + public._inventory_create_reserved_line(
            p_ws_id,
            p_checkout_id,
            coalesce(selected_row.listing_id, p_listing_id),
            bundle_row.id,
            selected_row.product_id,
            selected_row.unit_id,
            selected_row.warehouse_id,
            bundle_row.name || ' - ' || selected_row.title,
            paid_units,
            selected_row.unit_price,
            p_expires_at,
            p_now,
            selected_row.variant_id
          );
        end if;
      end loop;
    end if;
  end loop;

  if bundle_component_index = 0 and category_component_count = 0 then
    raise exception 'BUNDLE_COMPONENTS_REQUIRED'
      using errcode = 'P0001';
  end if;

  return line_subtotal;
end;
$$;

revoke all on function public._inventory_reserve_bundle_components(
  uuid, uuid, uuid, uuid, uuid, jsonb, bigint, bigint, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public._inventory_reserve_bundle_components(
  uuid, uuid, uuid, uuid, uuid, jsonb, bigint, bigint, text, timestamptz, timestamptz
) to service_role;
