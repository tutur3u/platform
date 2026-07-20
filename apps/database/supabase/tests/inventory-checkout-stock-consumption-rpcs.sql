begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(8);

insert into public.users (id, display_name)
values (
  '00000000-0000-4000-8000-000000021101',
  'Inventory checkout platform owner'
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '00000000-0000-4000-8000-000000021201',
  'Inventory checkout stock workspace',
  '00000000-0000-4000-8000-000000021101',
  false
)
on conflict (id) do nothing;

insert into public.workspace_users (id, ws_id, display_name, email)
values (
  '00000000-0000-4000-8000-000000021301',
  '00000000-0000-4000-8000-000000021201',
  'Inventory checkout operator',
  'inventory-checkout-operator@example.test'
)
on conflict (id) do nothing;

insert into public.workspace_user_linked_users (
  platform_user_id,
  virtual_user_id,
  ws_id
)
values (
  '00000000-0000-4000-8000-000000021101',
  '00000000-0000-4000-8000-000000021301',
  '00000000-0000-4000-8000-000000021201'
)
on conflict (platform_user_id, ws_id) do update
set virtual_user_id = excluded.virtual_user_id;

insert into public.product_categories (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000021401',
  'Inventory checkout category',
  '00000000-0000-4000-8000-000000021201'
)
on conflict (id) do nothing;

insert into private.inventory_owners (id, ws_id, name)
values (
  '00000000-0000-4000-8000-000000021451',
  '00000000-0000-4000-8000-000000021201',
  'Inventory checkout owner'
)
on conflict (id) do nothing;

insert into public.workspace_products (
  id,
  category_id,
  name,
  usage,
  description,
  ws_id,
  avatar_url,
  creator_id,
  archived,
  owner_id,
  finance_category_id,
  manufacturer_id
)
select
  '00000000-0000-4000-8000-000000021501',
  '00000000-0000-4000-8000-000000021401',
  'Inventory checkout stock product',
  null,
  null,
  '00000000-0000-4000-8000-000000021201',
  null,
  null,
  false,
  owner.id,
  null,
  null
from private.inventory_owners owner
where owner.id = '00000000-0000-4000-8000-000000021451'
on conflict (id) do nothing;

insert into private.inventory_units (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000021601',
  'Piece',
  '00000000-0000-4000-8000-000000021201'
)
on conflict (id) do nothing;

insert into private.inventory_warehouses (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000021701',
  'Front counter',
  '00000000-0000-4000-8000-000000021201'
)
on conflict (id) do nothing;

insert into private.inventory_products (
  product_id,
  unit_id,
  warehouse_id,
  amount,
  price
)
values (
  '00000000-0000-4000-8000-000000021501',
  '00000000-0000-4000-8000-000000021601',
  '00000000-0000-4000-8000-000000021701',
  7,
  2000
)
on conflict (product_id, unit_id, warehouse_id) do update
set amount = excluded.amount;

insert into private.inventory_storefronts (
  id,
  ws_id,
  slug,
  name,
  status,
  visibility,
  currency,
  checkout_mode
)
values (
  '00000000-0000-4000-8000-000000021801',
  '00000000-0000-4000-8000-000000021201',
  'inventory-checkout-stock-test',
  'Inventory checkout stock test',
  'published',
  'public',
  'USD',
  'square_pos'
)
on conflict (id) do update
set status = excluded.status;

insert into private.inventory_storefront_listings (
  id,
  storefront_id,
  ws_id,
  listing_type,
  product_id,
  unit_id,
  warehouse_id,
  title,
  price,
  status
)
values (
  '00000000-0000-4000-8000-000000021901',
  '00000000-0000-4000-8000-000000021801',
  '00000000-0000-4000-8000-000000021201',
  'product',
  '00000000-0000-4000-8000-000000021501',
  '00000000-0000-4000-8000-000000021601',
  '00000000-0000-4000-8000-000000021701',
  'Inventory checkout stock listing',
  2000,
  'published'
)
on conflict (id) do update
set status = excluded.status;

insert into private.inventory_checkout_sessions (
  id,
  ws_id,
  storefront_id,
  public_token,
  customer_name,
  customer_email,
  currency,
  status,
  expires_at,
  subtotal_amount,
  total_amount,
  checkout_provider,
  square_environment,
  square_location_id,
  square_order_id,
  square_status
)
values (
  '00000000-0000-4000-8000-000000022001',
  '00000000-0000-4000-8000-000000021201',
  '00000000-0000-4000-8000-000000021801',
  'inventory-checkout-stock-token',
  'Inventory checkout customer',
  'inventory-checkout-customer@example.test',
  'USD',
  'reserved',
  now() + interval '15 minutes',
  2000,
  2000,
  'square_pos',
  'production',
  'location-1',
  'square-order-1',
  'in_progress'
)
on conflict (id) do update
set
  status = 'reserved',
  square_payment_id = null,
  square_status = 'in_progress';

insert into private.inventory_checkout_lines (
  id,
  checkout_session_id,
  listing_id,
  product_id,
  unit_id,
  warehouse_id,
  title,
  quantity,
  unit_price,
  subtotal_amount
)
values (
  '00000000-0000-4000-8000-000000022101',
  '00000000-0000-4000-8000-000000022001',
  '00000000-0000-4000-8000-000000021901',
  '00000000-0000-4000-8000-000000021501',
  '00000000-0000-4000-8000-000000021601',
  '00000000-0000-4000-8000-000000021701',
  'Inventory checkout stock line',
  1,
  2000,
  2000
)
on conflict (id) do update
set quantity = excluded.quantity;

insert into private.inventory_reservations (
  id,
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
  '00000000-0000-4000-8000-000000022201',
  '00000000-0000-4000-8000-000000022001',
  '00000000-0000-4000-8000-000000022101',
  '00000000-0000-4000-8000-000000021501',
  '00000000-0000-4000-8000-000000021601',
  '00000000-0000-4000-8000-000000021701',
  1,
  'reserved',
  now() + interval '15 minutes'
)
on conflict (id) do update
set status = 'reserved';

select lives_ok(
  $$
    select private.complete_inventory_checkout_session_square_payment(
      p_checkout_id := '00000000-0000-4000-8000-000000022001',
      p_ws_id := '00000000-0000-4000-8000-000000021201',
      p_square_payment_id := 'square-payment-paid',
      p_square_order_id := 'square-order-paid'
    )
  $$,
  'Square payment completion consumes reserved stock'
);

select ok(
  exists (
    select 1
    from private.inventory_checkout_sessions checkout
    where checkout.id = '00000000-0000-4000-8000-000000022001'
      and checkout.status = 'completed'
      and checkout.square_payment_id = 'square-payment-paid'
      and checkout.square_status = 'paid'
  ),
  'Square payment completion persists the paid checkout state'
);

select is(
  (
    select stock.amount
    from private.inventory_products stock
    where stock.product_id = '00000000-0000-4000-8000-000000021501'
      and stock.unit_id = '00000000-0000-4000-8000-000000021601'
      and stock.warehouse_id = '00000000-0000-4000-8000-000000021701'
  ),
  6::bigint,
  'Square payment completion decrements finite stock exactly once'
);

select is(
  (
    select count(*)::int
    from private.inventory_checkout_stock_consumptions consumption
    where consumption.reservation_id = '00000000-0000-4000-8000-000000022201'
      and consumption.outcome = 'decremented'
      and consumption.stock_before_amount = 7
      and consumption.stock_after_amount = 6
  ),
  1,
  'Square stock consumption records an observable before and after quantity'
);

select is(
  (
    select count(*)::int
    from public.product_stock_changes stock_change
    where stock_change.product_id = '00000000-0000-4000-8000-000000021501'
      and stock_change.amount = -1
      and stock_change.creator_id = '00000000-0000-4000-8000-000000021301'
      and stock_change.note like 'Storefront checkout % completed via square_pos'
  ),
  1,
  'Square stock consumption appears in product stock history'
);

select lives_ok(
  $$
    select private.complete_inventory_checkout_session_square_payment(
      p_checkout_id := '00000000-0000-4000-8000-000000022001',
      p_ws_id := '00000000-0000-4000-8000-000000021201',
      p_square_payment_id := 'square-payment-paid',
      p_square_order_id := 'square-order-paid'
    )
  $$,
  'Square payment completion is safe to retry'
);

select is(
  (
    select stock.amount
    from private.inventory_products stock
    where stock.product_id = '00000000-0000-4000-8000-000000021501'
      and stock.unit_id = '00000000-0000-4000-8000-000000021601'
      and stock.warehouse_id = '00000000-0000-4000-8000-000000021701'
  ),
  6::bigint,
  'Square payment retry does not decrement stock twice'
);

select is(
  (
    select count(*)::int
    from private.inventory_checkout_stock_consumptions consumption
    where consumption.reservation_id = '00000000-0000-4000-8000-000000022201'
  ),
  1,
  'Square payment retry keeps a single stock-consumption record'
);

select * from finish();

rollback;
