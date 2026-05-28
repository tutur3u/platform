revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'inventory_products',
    'inventory_suppliers',
    'inventory_units',
    'inventory_warehouses',
    'inventory_batches',
    'inventory_batch_products',
    'inventory_owners',
    'inventory_audit_logs',
    'inventory_manufacturers'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I set schema private', table_name);
    end if;
  end loop;
end;
$$;

alter table if exists private.inventory_products enable row level security;
alter table if exists private.inventory_suppliers enable row level security;
alter table if exists private.inventory_units enable row level security;
alter table if exists private.inventory_warehouses enable row level security;
alter table if exists private.inventory_batches enable row level security;
alter table if exists private.inventory_batch_products enable row level security;
alter table if exists private.inventory_owners enable row level security;
alter table if exists private.inventory_audit_logs enable row level security;
alter table if exists private.inventory_manufacturers enable row level security;

revoke all on table
  private.inventory_products,
  private.inventory_suppliers,
  private.inventory_units,
  private.inventory_warehouses,
  private.inventory_batches,
  private.inventory_batch_products,
  private.inventory_owners,
  private.inventory_audit_logs,
  private.inventory_manufacturers
from public, anon, authenticated;

grant all on table
  private.inventory_products,
  private.inventory_suppliers,
  private.inventory_units,
  private.inventory_warehouses,
  private.inventory_batches,
  private.inventory_batch_products,
  private.inventory_owners,
  private.inventory_audit_logs,
  private.inventory_manufacturers
to service_role;

create or replace function public.get_inventory_products_count(ws_id uuid)
returns numeric
language sql
stable
as $function$
  select count(*)
  from private.inventory_products ip
  inner join public.workspace_products wp
    on wp.id = ip.product_id
  where wp.ws_id = $1;
$function$;

create or replace function public.get_inventory_suppliers_count(ws_id uuid)
returns numeric
language sql
stable
as $function$
  select count(*)
  from private.inventory_suppliers
  where ws_id = $1;
$function$;

create or replace function public.get_inventory_units_count(ws_id uuid)
returns numeric
language sql
stable
as $function$
  select count(*)
  from private.inventory_units
  where ws_id = $1;
$function$;

create or replace function public.get_inventory_warehouses_count(ws_id uuid)
returns numeric
language sql
stable
as $function$
  select count(*)
  from private.inventory_warehouses
  where ws_id = $1;
$function$;

create or replace function public.get_inventory_batches_count(ws_id uuid)
returns numeric
language sql
stable
as $function$
  select count(*)
  from private.inventory_batches batch
  inner join private.inventory_warehouses warehouse
    on warehouse.id = batch.warehouse_id
  where warehouse.ws_id = $1;
$function$;

create or replace function public.get_inventory_products(
  _category_ids uuid[] default null::uuid[],
  _ws_id uuid default null::uuid,
  _warehouse_ids uuid[] default null::uuid[],
  _has_unit boolean default null::boolean
)
returns table(
  id uuid,
  name text,
  manufacturer text,
  unit text,
  unit_id uuid,
  category text,
  price bigint,
  amount bigint,
  ws_id uuid,
  created_at timestamp with time zone
)
language plpgsql
as $function$
begin
  return query
  select
    p.id,
    p.name,
    im.name as manufacturer,
    iu.name as unit,
    ip.unit_id,
    pc.name as category,
    ip.price,
    coalesce(ip.amount, 0) as amount,
    p.ws_id,
    p.created_at
  from public.workspace_products p
    left join private.inventory_products ip
      on ip.product_id = p.id
      and (
        _warehouse_ids is null
        or ip.warehouse_id = any(_warehouse_ids)
      )
      and (
        _has_unit is null
        or ip.unit_id is not null
        or _has_unit is false
      )
    left join private.inventory_units iu on ip.unit_id = iu.id
    left join public.product_categories pc on p.category_id = pc.id
    left join private.inventory_manufacturers im on p.manufacturer_id = im.id
  where (
      _category_ids is null
      or p.category_id = any(_category_ids)
    )
    and (
      _ws_id is null
      or p.ws_id = _ws_id
    )
    and (
      _has_unit is null
      or ip.unit_id is not null
    )
  order by p.name asc;
end;
$function$;

create or replace function private.assert_inventory_bundle_component_scope()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  bundle_workspace_id uuid;
begin
  select ws_id
  into bundle_workspace_id
  from private.inventory_bundles
  where id = new.bundle_id;

  if not found then
    raise exception 'INVENTORY_BUNDLE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from private.inventory_products stock
    join public.workspace_products product
      on product.id = stock.product_id
    join private.inventory_units unit
      on unit.id = stock.unit_id
    join private.inventory_warehouses warehouse
      on warehouse.id = stock.warehouse_id
    where product.ws_id = bundle_workspace_id
      and unit.ws_id = bundle_workspace_id
      and warehouse.ws_id = bundle_workspace_id
      and stock.product_id = new.product_id
      and stock.unit_id = new.unit_id
      and stock.warehouse_id = new.warehouse_id
  ) then
    raise exception 'INVALID_BUNDLE_COMPONENT_WORKSPACE_SCOPE'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

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
  p_now timestamptz
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

  reserved_quantity := public._inventory_reserved_quantity(
    p_product_id,
    p_unit_id,
    p_warehouse_id,
    p_now
  );
  available_quantity := coalesce(stock_row.amount, 0) - reserved_quantity;

  if available_quantity < p_quantity then
    raise exception 'INSUFFICIENT_STOCK'
      using errcode = 'P0001';
  end if;

  line_subtotal := p_quantity * p_unit_price;

  insert into private.inventory_checkout_lines (
    checkout_session_id,
    listing_id,
    bundle_id,
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

create or replace function public.complete_inventory_checkout_session(
  p_checkout_id uuid,
  p_finance_invoice_id uuid,
  p_now timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
  invoice_ws_id uuid;
begin
  select *
  into checkout_row
  from private.inventory_checkout_sessions
  where id = p_checkout_id
  for update;

  if not found then
    raise exception 'CHECKOUT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if checkout_row.status <> 'reserved' then
    raise exception 'CHECKOUT_NOT_RESERVED'
      using errcode = 'P0001';
  end if;

  select ws_id
  into invoice_ws_id
  from public.finance_invoices
  where id = p_finance_invoice_id
  for update;

  if not found or invoice_ws_id <> checkout_row.ws_id then
    raise exception 'FINANCE_INVOICE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  insert into public.finance_invoice_products (
    invoice_id,
    product_id,
    product_name,
    amount,
    price,
    unit_id,
    product_unit,
    warehouse_id,
    warehouse,
    owner_id,
    owner_name
  )
  select
    p_finance_invoice_id,
    line.product_id,
    coalesce(product.name, line.title),
    line.quantity,
    line.unit_price,
    line.unit_id,
    coalesce(unit.name, ''),
    line.warehouse_id,
    coalesce(warehouse.name, ''),
    product.owner_id,
    coalesce(owner.name, 'Unassigned')
  from private.inventory_checkout_lines line
  join public.workspace_products product
    on product.id = line.product_id
  left join private.inventory_owners owner
    on owner.id = product.owner_id
  left join private.inventory_units unit
    on unit.id = line.unit_id
  left join private.inventory_warehouses warehouse
    on warehouse.id = line.warehouse_id
  where line.checkout_session_id = checkout_row.id
    and not exists (
      select 1
      from public.finance_invoice_products existing
      where existing.invoice_id = p_finance_invoice_id
        and existing.product_id = line.product_id
        and existing.unit_id = line.unit_id
        and existing.warehouse_id = line.warehouse_id
    );

  update private.inventory_reservations
  set
    status = 'consumed',
    released_at = p_now
  where checkout_session_id = checkout_row.id
    and status = 'reserved';

  update private.inventory_checkout_sessions
  set
    status = 'completed',
    finance_invoice_id = p_finance_invoice_id,
    completed_at = p_now,
    updated_at = p_now
  where id = checkout_row.id;

update private.inventory_settlement_ledger_entries
  set finance_invoice_id = p_finance_invoice_id
  where checkout_session_id = checkout_row.id;

  return p_finance_invoice_id;
end;
$$;

create or replace function private.calculate_invoice_values(
  p_ws_id uuid,
  p_products jsonb,
  p_promotion_id uuid default null,
  p_frontend_subtotal numeric default null,
  p_frontend_discount_amount numeric default null,
  p_frontend_total numeric default null,
  p_is_subscription_invoice boolean default false
)
returns table (
  subtotal numeric,
  discount_amount numeric,
  total numeric,
  values_recalculated boolean,
  rounding_applied numeric,
  allow_promotions boolean,
  promotion_id uuid,
  promotion_name text,
  promotion_code text,
  promotion_description text,
  promotion_value numeric,
  promotion_use_ratio boolean
)
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_invalid_count integer;
  v_matched_count integer;
  v_promotion record;
  v_requested_count integer;
  v_total_before_rounding numeric;
begin
  if p_products is null
    or jsonb_typeof(p_products) <> 'array'
    or jsonb_array_length(p_products) = 0 then
    raise exception 'Products are required' using errcode = '22023';
  end if;

  with requested as (
    select *
    from jsonb_to_recordset(p_products) as product(
      product_id uuid,
      unit_id uuid,
      warehouse_id uuid,
      quantity numeric
    )
  ),
  invalid_requested as (
    select 1
    from requested
    where product_id is null
      or unit_id is null
      or warehouse_id is null
      or quantity is null
      or quantity <= 0
  ),
  normalized as (
    select
      product_id,
      unit_id,
      warehouse_id,
      sum(quantity) as quantity
    from requested
    group by product_id, unit_id, warehouse_id
  ),
  matched as (
    select
      n.product_id,
      n.unit_id,
      n.warehouse_id,
      inventory.price,
      n.quantity
    from normalized n
    join private.inventory_products inventory
      on inventory.product_id = n.product_id
     and inventory.unit_id = n.unit_id
     and inventory.warehouse_id = n.warehouse_id
    join public.workspace_products product
      on product.id = inventory.product_id
     and product.ws_id = p_ws_id
     and product.archived = false
  )
  select
    (select count(*) from invalid_requested),
    (select count(*) from normalized),
    (select count(*) from matched),
    coalesce((select sum(price * quantity) from matched), 0)
  into v_invalid_count, v_requested_count, v_matched_count, subtotal;

  if v_invalid_count > 0 or v_requested_count = 0 then
    raise exception 'Invalid invoice product payload' using errcode = '22023';
  end if;

  if v_matched_count <> v_requested_count then
    raise exception 'Product not found or not available' using errcode = '22023';
  end if;

  discount_amount := 0;
  promotion_id := null;
  promotion_name := null;
  promotion_code := null;
  promotion_description := null;
  promotion_value := null;
  promotion_use_ratio := null;

  if p_is_subscription_invoice then
    allow_promotions := true;
  else
    select coalesce((
      select case
        when lower(value) = 'false' then false
        when lower(value) = 'true' then true
        else true
      end
      from public.workspace_configs
      where ws_id = p_ws_id
        and id = 'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD'
      limit 1
    ), true)
    into allow_promotions;
  end if;

  if p_promotion_id is not null and allow_promotions then
    select
      id,
      name,
      code,
      description,
      value,
      use_ratio,
      max_uses,
      current_uses
    into v_promotion
    from public.workspace_promotions
    where id = p_promotion_id
      and ws_id = p_ws_id
    limit 1;

    if not found then
      raise exception 'Invalid promotion: %', p_promotion_id using errcode = '22023';
    end if;

    if v_promotion.max_uses is not null
      and coalesce(v_promotion.current_uses, 0) >= v_promotion.max_uses then
      raise exception 'Promotion usage limit reached' using errcode = 'P0001';
    end if;

    promotion_id := v_promotion.id;
    promotion_name := v_promotion.name;
    promotion_code := v_promotion.code;
    promotion_description := v_promotion.description;
    promotion_value := v_promotion.value;
    promotion_use_ratio := v_promotion.use_ratio;

    if coalesce(v_promotion.use_ratio, false) then
      discount_amount := subtotal * (v_promotion.value / 100);
    else
      discount_amount := least(v_promotion.value, subtotal);
    end if;
  end if;

  v_total_before_rounding := subtotal - discount_amount;

  if p_frontend_total is not null then
    total := p_frontend_total;
    rounding_applied := total - v_total_before_rounding;
  else
    total := v_total_before_rounding;
    rounding_applied := 0;
  end if;

  values_recalculated :=
    case
      when p_frontend_subtotal is null
        and p_frontend_discount_amount is null
        and p_frontend_total is null then true
      else abs(subtotal - coalesce(p_frontend_subtotal, 0)) > 0.01
        or abs(discount_amount - coalesce(p_frontend_discount_amount, 0)) > 0.01
    end;

  return next;
end;
$$;

revoke all on function public.get_inventory_products_count(uuid) from public;
revoke all on function public.get_inventory_suppliers_count(uuid) from public;
revoke all on function public.get_inventory_units_count(uuid) from public;
revoke all on function public.get_inventory_warehouses_count(uuid) from public;
revoke all on function public.get_inventory_batches_count(uuid) from public;
grant execute on function public.get_inventory_products_count(uuid) to service_role;
grant execute on function public.get_inventory_suppliers_count(uuid) to service_role;
grant execute on function public.get_inventory_units_count(uuid) to service_role;
grant execute on function public.get_inventory_warehouses_count(uuid) to service_role;
grant execute on function public.get_inventory_batches_count(uuid) to service_role;

revoke all on function public.get_inventory_products(
  uuid[],
  uuid,
  uuid[],
  boolean
) from public;
grant execute on function public.get_inventory_products(
  uuid[],
  uuid,
  uuid[],
  boolean
) to service_role;

revoke all on function private.calculate_invoice_values(
  uuid,
  jsonb,
  uuid,
  numeric,
  numeric,
  numeric,
  boolean
) from public, anon, authenticated;

grant execute on function private.calculate_invoice_values(
  uuid,
  jsonb,
  uuid,
  numeric,
  numeric,
  numeric,
  boolean
) to service_role;

create or replace function private.get_inventory_catalog_products(
  p_ws_id uuid,
  p_include_stock boolean default false,
  p_product_id uuid default null,
  p_category_id uuid default null,
  p_manufacturer_id uuid default null,
  p_search text default null,
  p_status text default 'active',
  p_sort_by text default 'created_at',
  p_sort_order text default 'desc',
  p_offset integer default 0,
  p_limit integer default 10
)
returns table (
  total_count integer,
  product jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      product.*,
      manufacturer.name as manufacturer_sort_name
    from public.workspace_products product
    left join private.inventory_manufacturers manufacturer
      on manufacturer.id = product.manufacturer_id
     and manufacturer.ws_id = p_ws_id
    where product.ws_id = p_ws_id
      and (p_product_id is null or product.id = p_product_id)
      and (p_category_id is null or product.category_id = p_category_id)
      and (p_manufacturer_id is null or product.manufacturer_id = p_manufacturer_id)
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or product.name ilike '%' || p_search || '%'
      )
      and (
        coalesce(p_status, 'active') = 'all'
        or (coalesce(p_status, 'active') = 'active' and product.archived = false)
        or (coalesce(p_status, 'active') = 'archived' and product.archived = true)
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by
      case
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'created_at'
        then created_at
      end asc nulls last,
      case
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'created_at'
        then created_at
      end desc nulls last,
      case
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'manufacturer'
        then manufacturer_sort_name
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'id'
        then id::text
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'name'
        then name
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'description'
        then description
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'usage'
        then usage
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'category_id'
        then category_id::text
      end asc nulls last,
      case
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'manufacturer'
        then manufacturer_sort_name
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'id'
        then id::text
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'name'
        then name
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'description'
        then description
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'usage'
        then usage
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'category_id'
        then category_id::text
      end desc nulls last,
      created_at desc,
      id asc
    limit greatest(1, least(coalesce(p_limit, 10), 10000))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    product_json.product
  from counted
  left join paged product on true
  left join public.product_categories category
    on category.id = product.category_id
  left join private.inventory_manufacturers manufacturer
    on manufacturer.id = product.manufacturer_id
   and manufacturer.ws_id = p_ws_id
  left join private.inventory_owners owner
    on owner.id = product.owner_id
   and owner.ws_id = p_ws_id
  left join public.transaction_categories finance_category
    on finance_category.id = product.finance_category_id
   and finance_category.ws_id = p_ws_id
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'amount', stock.amount,
          'min_amount', stock.min_amount,
          'price', stock.price,
          'warehouse_id', stock.warehouse_id,
          'unit_id', stock.unit_id,
          'created_at', stock.created_at,
          'inventory_units',
            case
              when unit.id is null then null
              else jsonb_build_object('id', unit.id, 'name', unit.name)
            end,
          'inventory_warehouses',
            case
              when warehouse.id is null then null
              else jsonb_build_object('id', warehouse.id, 'name', warehouse.name)
            end
        )
        order by stock.warehouse_id, stock.unit_id, stock.created_at
      ),
      '[]'::jsonb
    ) as items
    from private.inventory_products stock
    left join private.inventory_units unit
      on unit.id = stock.unit_id
     and unit.ws_id = p_ws_id
    left join private.inventory_warehouses warehouse
      on warehouse.id = stock.warehouse_id
     and warehouse.ws_id = p_ws_id
    where stock.product_id = product.id
  ) stock_items on p_include_stock and product.id is not null
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'amount', stock_change.amount,
          'created_at', stock_change.created_at,
          'warehouse_id', stock_change.warehouse_id,
          'beneficiary',
            case
              when beneficiary.id is null then null
              else jsonb_build_object(
                'full_name', beneficiary.full_name,
                'email', beneficiary.email
              )
            end,
          'creator',
            case
              when creator.id is null then null
              else jsonb_build_object(
                'full_name', creator.full_name,
                'email', creator.email
              )
            end,
          'warehouse',
            case
              when stock_change_warehouse.id is null then null
              else jsonb_build_object(
                'id', stock_change_warehouse.id,
                'name', stock_change_warehouse.name
              )
            end
        )
        order by stock_change.created_at desc
      ),
      '[]'::jsonb
    ) as items
    from public.product_stock_changes stock_change
    left join public.workspace_users beneficiary
      on beneficiary.id = stock_change.beneficiary_id
     and beneficiary.ws_id = p_ws_id
    left join public.workspace_users creator
      on creator.id = stock_change.creator_id
     and creator.ws_id = p_ws_id
    left join private.inventory_warehouses stock_change_warehouse
      on stock_change_warehouse.id = stock_change.warehouse_id
     and stock_change_warehouse.ws_id = p_ws_id
    where stock_change.product_id = product.id
  ) stock_changes on p_include_stock and product.id is not null
  left join lateral (
    select
      case
        when product.id is null then null
        else jsonb_build_object(
          'id', product.id,
          'name', product.name,
          'manufacturer_id', product.manufacturer_id,
          'description', product.description,
          'usage', product.usage,
          'category_id', product.category_id,
          'owner_id', product.owner_id,
          'finance_category_id', product.finance_category_id,
          'created_at', product.created_at,
          'ws_id', product.ws_id,
          'archived', product.archived,
          'product_categories',
            case
              when category.id is null then null
              else jsonb_build_object('name', category.name)
            end,
          'inventory_manufacturers',
            case
              when manufacturer.id is null then null
              else jsonb_build_object('id', manufacturer.id, 'name', manufacturer.name)
            end,
          'inventory_owners',
            case
              when owner.id is null then null
              else jsonb_build_object(
                'id', owner.id,
                'name', owner.name,
                'avatar_url', owner.avatar_url,
                'linked_workspace_user_id', owner.linked_workspace_user_id
              )
            end,
          'transaction_categories',
            case
              when finance_category.id is null then null
              else jsonb_build_object(
                'id', finance_category.id,
                'name', finance_category.name,
                'color', finance_category.color,
                'icon', finance_category.icon
              )
            end,
          'inventory_products',
            case
              when p_include_stock then coalesce(stock_items.items, '[]'::jsonb)
              else null
            end,
          'product_stock_changes',
            case
              when p_include_stock then coalesce(stock_changes.items, '[]'::jsonb)
              else null
            end
        )
      end as product
  ) product_json on true;
$$;

create or replace function private.get_inventory_low_stock_products(p_ws_id uuid)
returns table (product jsonb)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'product_id', product.id,
    'product_name', product.name,
    'owner_name', owner.name,
    'category_name', category.name,
    'amount', stock.amount,
    'min_amount', stock.min_amount,
    'price', stock.price,
    'unit_name', unit.name,
    'warehouse_name', warehouse.name
  ) as product
  from private.inventory_products stock
  join public.workspace_products product
    on product.id = stock.product_id
   and product.ws_id = p_ws_id
   and product.archived = false
  left join private.inventory_owners owner
    on owner.id = product.owner_id
   and owner.ws_id = p_ws_id
  left join public.product_categories category
    on category.id = product.category_id
  left join private.inventory_units unit
    on unit.id = stock.unit_id
   and unit.ws_id = p_ws_id
  left join private.inventory_warehouses warehouse
    on warehouse.id = stock.warehouse_id
   and warehouse.ws_id = p_ws_id
  where stock.amount is not null
    and stock.amount <= coalesce(stock.min_amount, 0)
  order by product.name asc, warehouse.name asc nulls last, unit.name asc nulls last;
$$;

create or replace function private.get_inventory_product_form_options(p_ws_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'categories',
      coalesce((
        select jsonb_agg(to_jsonb(category) order by category.name)
        from public.product_categories category
        where category.ws_id = p_ws_id
      ), '[]'::jsonb),
    'manufacturers',
      coalesce((
        select jsonb_agg(to_jsonb(manufacturer) order by manufacturer.name)
        from private.inventory_manufacturers manufacturer
        where manufacturer.ws_id = p_ws_id
      ), '[]'::jsonb),
    'owners',
      coalesce((
        select jsonb_agg(to_jsonb(owner) order by owner.archived, owner.name)
        from private.inventory_owners owner
        where owner.ws_id = p_ws_id
      ), '[]'::jsonb),
    'financeCategories',
      coalesce((
        select jsonb_agg(to_jsonb(category) order by category.name)
        from public.transaction_categories category
        where category.ws_id = p_ws_id
      ), '[]'::jsonb),
    'warehouses',
      coalesce((
        select jsonb_agg(to_jsonb(warehouse) order by warehouse.name)
        from private.inventory_warehouses warehouse
        where warehouse.ws_id = p_ws_id
      ), '[]'::jsonb),
    'units',
      coalesce((
        select jsonb_agg(to_jsonb(unit) order by unit.name)
        from private.inventory_units unit
        where unit.ws_id = p_ws_id
      ), '[]'::jsonb)
  );
$$;

create or replace function private.get_user_group_linked_products_with_units(
  p_ws_id uuid,
  p_group_ids uuid[]
)
returns table (item jsonb)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'group_id', linked.group_id,
    'unit_id', linked.unit_id,
    'warehouse_id', linked.warehouse_id,
    'workspace_user_groups', jsonb_build_object(
      'name', user_group.name
    ),
    'workspace_products',
      case
        when product.id is null then null
        else jsonb_build_object(
          'id', product.id,
          'name', product.name,
          'product_categories',
            case
              when category.id is null then null
              else jsonb_build_object('name', category.name)
            end
        )
      end,
    'inventory_units',
      case
        when unit.id is null then null
        else jsonb_build_object('id', unit.id, 'name', unit.name)
      end
  ) as item
  from public.user_group_linked_products linked
  join public.workspace_user_groups user_group
    on user_group.id = linked.group_id
   and user_group.ws_id = p_ws_id
  left join public.workspace_products product
    on product.id = linked.product_id
  left join public.product_categories category
    on category.id = product.category_id
  left join private.inventory_units unit
    on unit.id = linked.unit_id
   and unit.ws_id = p_ws_id
  where linked.group_id = any(coalesce(p_group_ids, array[]::uuid[]));
$$;

create or replace function private.get_inventory_batches(
  p_ws_id uuid,
  p_search text default null,
  p_offset integer default 0,
  p_limit integer default 10
)
returns table (
  total_count integer,
  batch jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      batch.*,
      warehouse.ws_id,
      warehouse.name as warehouse_name,
      supplier.name as supplier_name
    from private.inventory_batches batch
    join private.inventory_warehouses warehouse
      on warehouse.id = batch.warehouse_id
     and warehouse.ws_id = p_ws_id
    left join private.inventory_suppliers supplier
      on supplier.id = batch.supplier_id
     and supplier.ws_id = p_ws_id
    where (
      coalesce(nullif(p_search, ''), '') = ''
      or batch.id::text ilike '%' || p_search || '%'
      or warehouse.name ilike '%' || p_search || '%'
      or supplier.name ilike '%' || p_search || '%'
    )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc nulls last, id asc
    limit greatest(1, least(coalesce(p_limit, 10), 1000))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    case
      when paged.id is null then null
      else jsonb_build_object(
        'id', paged.id,
        'created_at', paged.created_at,
        'price', paged.price,
        'total_diff', paged.total_diff,
        'supplier_id', paged.supplier_id,
        'warehouse_id', paged.warehouse_id,
        'ws_id', paged.ws_id,
        'warehouse', paged.warehouse_name,
        'supplier', paged.supplier_name
      )
    end as batch
  from counted
  left join paged on true;
$$;

create or replace function private.get_inventory_overview_metrics(p_ws_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with sales_lines as (
    select
      line.amount,
      line.price,
      line.owner_id,
      line.owner_name,
      line.product_id,
      coalesce(category.name, 'Uncategorized') as category_name
    from public.finance_invoice_products line
    join public.finance_invoices invoice
      on invoice.id = line.invoice_id
     and invoice.ws_id = p_ws_id
    left join public.workspace_products product
      on product.id = line.product_id
    left join public.product_categories category
      on category.id = product.category_id
  ),
  owner_breakdown as (
    select
      owner_id,
      coalesce(nullif(owner_name, ''), 'Unassigned') as owner_name,
      coalesce(sum(coalesce(amount, 0) * coalesce(price, 0)), 0) as revenue,
      coalesce(sum(coalesce(amount, 0)), 0) as quantity
    from sales_lines
    group by owner_id, coalesce(nullif(owner_name, ''), 'Unassigned')
  ),
  category_breakdown as (
    select
      category_name,
      coalesce(sum(coalesce(amount, 0) * coalesce(price, 0)), 0) as revenue,
      coalesce(sum(coalesce(amount, 0)), 0) as quantity
    from sales_lines
    group by category_name
  ),
  recent_invoices as (
    select
      invoice.id,
      invoice.paid_amount,
      invoice.completed_at,
      invoice.created_at,
      wallet.name as wallet_name,
      invoice_category.name as category_name,
      customer.full_name as customer_name,
      coalesce(creator.full_name, platform_creator.display_name) as creator_name
    from public.finance_invoices invoice
    left join public.workspace_wallets wallet
      on wallet.id = invoice.wallet_id
    left join public.transaction_categories invoice_category
      on invoice_category.id = invoice.category_id
    left join public.workspace_users customer
      on customer.id = invoice.customer_id
    left join public.workspace_users creator
      on creator.id = invoice.creator_id
    left join public.users platform_creator
      on platform_creator.id = invoice.platform_creator_id
    where invoice.ws_id = p_ws_id
    order by invoice.created_at desc
    limit 10
  ),
  recent_sales as (
    select
      invoice.*,
      coalesce(line_summary.items_count, 0) as items_count,
      coalesce(line_summary.owners, array[]::text[]) as owners
    from recent_invoices invoice
    left join lateral (
      select
        count(*)::integer as items_count,
        array_agg(distinct coalesce(nullif(line.owner_name, ''), 'Unassigned')) as owners
      from public.finance_invoice_products line
      where line.invoice_id = invoice.id
    ) line_summary on true
  )
  select jsonb_build_object(
    'wallets_count',
      (
        select count(*)::integer
        from public.workspace_wallets wallet
        where wallet.ws_id = p_ws_id
      ),
    'total_income',
      coalesce((
        select sum(wallet_transaction.amount)
        from public.wallet_transactions wallet_transaction
        join public.workspace_wallets wallet
          on wallet.id = wallet_transaction.wallet_id
         and wallet.ws_id = p_ws_id
        where wallet_transaction.amount > 0
      ), 0),
    'total_expense',
      coalesce((
        select sum(abs(wallet_transaction.amount))
        from public.wallet_transactions wallet_transaction
        join public.workspace_wallets wallet
          on wallet.id = wallet_transaction.wallet_id
         and wallet.ws_id = p_ws_id
        where wallet_transaction.amount < 0
      ), 0),
    'inventory_sales_revenue',
      coalesce((
        select sum(coalesce(amount, 0) * coalesce(price, 0))
        from sales_lines
      ), 0),
    'owner_breakdown',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'owner_id', owner_id,
            'owner_name', owner_name,
            'revenue', revenue,
            'quantity', quantity
          )
          order by revenue desc, owner_name asc
        )
        from owner_breakdown
      ), '[]'::jsonb),
    'category_breakdown',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'category_name', category_name,
            'revenue', revenue,
            'quantity', quantity
          )
          order by revenue desc, category_name asc
        )
        from category_breakdown
      ), '[]'::jsonb),
    'recent_sales',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', id,
            'created_at', created_at,
            'completed_at', completed_at,
            'paid_amount', paid_amount,
            'wallet_name', wallet_name,
            'category_name', category_name,
            'customer_name', customer_name,
            'creator_name', creator_name,
            'items_count', items_count,
            'owners', to_jsonb(owners)
          )
          order by created_at desc
        )
        from recent_sales
      ), '[]'::jsonb)
  );
$$;

create or replace function private.get_inventory_sales(
  p_ws_id uuid,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  total_count integer,
  sale jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      invoice.id,
      invoice.notice,
      invoice.note,
      invoice.paid_amount,
      invoice.created_at,
      invoice.completed_at,
      wallet.name as wallet_name,
      invoice_category.name as category_name,
      customer.full_name as customer_name,
      coalesce(creator.full_name, platform_creator.display_name) as creator_name
    from public.finance_invoices invoice
    left join public.workspace_wallets wallet
      on wallet.id = invoice.wallet_id
    left join public.transaction_categories invoice_category
      on invoice_category.id = invoice.category_id
    left join public.workspace_users customer
      on customer.id = invoice.customer_id
    left join public.workspace_users creator
      on creator.id = invoice.creator_id
    left join public.users platform_creator
      on platform_creator.id = invoice.platform_creator_id
    where invoice.ws_id = p_ws_id
      and exists (
        select 1
        from public.finance_invoice_products line
        where line.invoice_id = invoice.id
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc nulls last, id asc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    case
      when paged.id is null then null
      else jsonb_build_object(
        'id', paged.id,
        'notice', paged.notice,
        'note', paged.note,
        'paid_amount', paged.paid_amount,
        'created_at', paged.created_at,
        'completed_at', paged.completed_at,
        'wallet_name', paged.wallet_name,
        'category_name', paged.category_name,
        'customer_name', paged.customer_name,
        'creator_name', paged.creator_name,
        'items_count', coalesce(line_summary.items_count, 0),
        'total_quantity', coalesce(line_summary.total_quantity, 0),
        'owners', to_jsonb(coalesce(line_summary.owners, array[]::text[]))
      )
    end as sale
  from counted
  left join paged on true
  left join lateral (
    select
      count(*)::integer as items_count,
      coalesce(sum(coalesce(line.amount, 0)), 0) as total_quantity,
      array_agg(distinct coalesce(nullif(line.owner_name, ''), 'Unassigned')) as owners
    from public.finance_invoice_products line
    where line.invoice_id = paged.id
  ) line_summary on paged.id is not null;
$$;

create or replace function private.get_inventory_sale(
  p_ws_id uuid,
  p_sale_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'id', invoice.id,
    'notice', invoice.notice,
    'note', invoice.note,
    'paid_amount', invoice.paid_amount,
    'created_at', invoice.created_at,
    'completed_at', invoice.completed_at,
    'wallet_id', invoice.wallet_id,
    'category_id', invoice.category_id,
    'customer_id', invoice.customer_id,
    'creator_id', invoice.creator_id,
    'platform_creator_id', invoice.platform_creator_id,
    'transaction_id', invoice.transaction_id,
    'wallet',
      case
        when wallet.id is null then null
        else jsonb_build_object('name', wallet.name)
      end,
    'category',
      case
        when invoice_category.id is null then null
        else jsonb_build_object('name', invoice_category.name)
      end,
    'customer',
      case
        when customer.id is null then null
        else jsonb_build_object(
          'id', customer.id,
          'full_name', customer.full_name,
          'display_name', customer.display_name
        )
      end,
    'creator',
      case
        when creator.id is null then null
        else jsonb_build_object(
          'id', creator.id,
          'full_name', creator.full_name,
          'display_name', creator.display_name
        )
      end,
    'platform_creator',
      case
        when platform_creator.id is null then null
        else jsonb_build_object(
          'id', platform_creator.id,
          'display_name', platform_creator.display_name
        )
      end,
    'linked_transaction',
      case
        when linked_transaction.id is null then null
        else jsonb_build_object(
          'id', linked_transaction.id,
          'taken_at', linked_transaction.taken_at
        )
      end,
    'finance_invoice_products',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'amount', line.amount,
            'price', line.price,
            'owner_id', line.owner_id,
            'owner_name', line.owner_name,
            'product_id', line.product_id,
            'product_name', line.product_name,
            'product_unit', line.product_unit,
            'unit_id', line.unit_id,
            'warehouse_id', line.warehouse_id,
            'warehouse', line.warehouse
          )
          order by line.product_name asc nulls last, line.unit_id, line.warehouse_id
        )
        from public.finance_invoice_products line
        where line.invoice_id = invoice.id
      ), '[]'::jsonb)
  )
  from public.finance_invoices invoice
  left join public.workspace_wallets wallet
    on wallet.id = invoice.wallet_id
  left join public.transaction_categories invoice_category
    on invoice_category.id = invoice.category_id
  left join public.workspace_users customer
    on customer.id = invoice.customer_id
  left join public.workspace_users creator
    on creator.id = invoice.creator_id
  left join public.users platform_creator
    on platform_creator.id = invoice.platform_creator_id
  left join public.wallet_transactions linked_transaction
    on linked_transaction.id = invoice.transaction_id
  where invoice.ws_id = p_ws_id
    and invoice.id = p_sale_id
    and exists (
      select 1
      from public.finance_invoice_products line
      where line.invoice_id = invoice.id
    );
$$;

revoke all on function private.get_inventory_catalog_products(
  uuid,
  boolean,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function private.get_inventory_catalog_products(
  uuid,
  boolean,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
) to service_role;

revoke all on function private.get_inventory_low_stock_products(uuid)
from public, anon, authenticated;

grant execute on function private.get_inventory_low_stock_products(uuid)
to service_role;

revoke all on function private.get_inventory_product_form_options(uuid)
from public, anon, authenticated;

grant execute on function private.get_inventory_product_form_options(uuid)
to service_role;

revoke all on function private.get_user_group_linked_products_with_units(
  uuid,
  uuid[]
) from public, anon, authenticated;

grant execute on function private.get_user_group_linked_products_with_units(
  uuid,
  uuid[]
) to service_role;

revoke all on function private.get_inventory_batches(
  uuid,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function private.get_inventory_batches(
  uuid,
  text,
  integer,
  integer
) to service_role;

revoke all on function private.get_inventory_overview_metrics(uuid)
from public, anon, authenticated;

grant execute on function private.get_inventory_overview_metrics(uuid)
to service_role;

revoke all on function private.get_inventory_sales(
  uuid,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function private.get_inventory_sales(
  uuid,
  integer,
  integer
) to service_role;

revoke all on function private.get_inventory_sale(uuid, uuid)
from public, anon, authenticated;

grant execute on function private.get_inventory_sale(uuid, uuid)
to service_role;

select audit.enable_tracking('private.inventory_manufacturers'::regclass);
