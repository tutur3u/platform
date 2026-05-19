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
    from public.inventory_products stock
    join public.workspace_products product
      on product.id = stock.product_id
    join public.inventory_units unit
      on unit.id = stock.unit_id
    join public.inventory_warehouses warehouse
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

delete from private.inventory_bundle_components component
using private.inventory_bundles bundle
where bundle.id = component.bundle_id
  and not exists (
    select 1
    from public.inventory_products stock
    join public.workspace_products product
      on product.id = stock.product_id
    join public.inventory_units unit
      on unit.id = stock.unit_id
    join public.inventory_warehouses warehouse
      on warehouse.id = stock.warehouse_id
    where product.ws_id = bundle.ws_id
      and unit.ws_id = bundle.ws_id
      and warehouse.ws_id = bundle.ws_id
      and stock.product_id = component.product_id
      and stock.unit_id = component.unit_id
      and stock.warehouse_id = component.warehouse_id
  );

drop trigger if exists inventory_bundle_components_scope
  on private.inventory_bundle_components;

create trigger inventory_bundle_components_scope
  before insert or update of bundle_id, product_id, unit_id, warehouse_id
  on private.inventory_bundle_components
  for each row
  execute function private.assert_inventory_bundle_component_scope();

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
  stock_row public.inventory_products%rowtype;
  reserved_quantity bigint;
  available_quantity bigint;
  new_line_id uuid;
  line_subtotal bigint;
begin
  select stock.*
  into stock_row
  from public.inventory_products stock
  join public.workspace_products product
    on product.id = stock.product_id
  join public.inventory_units unit
    on unit.id = stock.unit_id
  join public.inventory_warehouses warehouse
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

revoke all on function private.assert_inventory_bundle_component_scope()
  from public;
grant execute on function private.assert_inventory_bundle_component_scope()
  to service_role;

revoke all on function public._inventory_create_reserved_line(
  uuid,
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
) from public;
grant execute on function public._inventory_create_reserved_line(
  uuid,
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
) to service_role;
