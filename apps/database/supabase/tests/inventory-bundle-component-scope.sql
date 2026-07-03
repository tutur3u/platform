begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(13);

insert into public.users (id, display_name)
values
  ('00000000-0000-4000-8000-000000000101', 'Inventory attacker'),
  ('00000000-0000-4000-8000-000000000102', 'Inventory victim')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  (
    '00000000-0000-4000-8000-000000000201',
    'Inventory attacker workspace',
    '00000000-0000-4000-8000-000000000101',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    'Inventory victim workspace',
    '00000000-0000-4000-8000-000000000102',
    false
  )
on conflict (id) do nothing;

insert into public.product_categories (id, name, ws_id)
values
  (
    '00000000-0000-4000-8000-000000000301',
    'Attacker category',
    '00000000-0000-4000-8000-000000000201'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    'Victim category',
    '00000000-0000-4000-8000-000000000202'
  )
on conflict (id) do nothing;

insert into private.inventory_owners (id, ws_id, name)
values
  (
    '00000000-0000-4000-8000-000000000351',
    '00000000-0000-4000-8000-000000000201',
    'Attacker owner'
  ),
  (
    '00000000-0000-4000-8000-000000000352',
    '00000000-0000-4000-8000-000000000202',
    'Victim owner'
  )
on conflict (id) do nothing;

insert into public.workspace_products (id, category_id, name, ws_id, owner_id)
values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000301',
    'Attacker stock',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000351'
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000302',
    'Victim stock',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000352'
  )
on conflict (id) do nothing;

insert into private.inventory_units (id, name, ws_id)
values
  (
    '00000000-0000-4000-8000-000000000501',
    'Attacker unit',
    '00000000-0000-4000-8000-000000000201'
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    'Victim unit',
    '00000000-0000-4000-8000-000000000202'
  )
on conflict (id) do nothing;

insert into private.inventory_warehouses (id, name, ws_id)
values
  (
    '00000000-0000-4000-8000-000000000601',
    'Attacker warehouse',
    '00000000-0000-4000-8000-000000000201'
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    'Victim warehouse',
    '00000000-0000-4000-8000-000000000202'
  )
on conflict (id) do nothing;

insert into private.inventory_products (
  product_id,
  unit_id,
  warehouse_id,
  amount,
  price
)
values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000601',
    5,
    100
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000602',
    5,
    100
  )
on conflict (product_id, unit_id, warehouse_id) do update
set amount = excluded.amount;

select lives_ok(
  $$
    update private.inventory_products
    set
      revenue_share_partner_id = '00000000-0000-4000-8000-000000000351',
      revenue_share_bps = 2500
    where product_id = '00000000-0000-4000-8000-000000000401'
      and unit_id = '00000000-0000-4000-8000-000000000501'
      and warehouse_id = '00000000-0000-4000-8000-000000000601'
  $$,
  'stock revenue share accepts partners from the same workspace'
);

select is(
  (
    select revenue_share_bps
    from private.inventory_products
    where product_id = '00000000-0000-4000-8000-000000000401'
      and unit_id = '00000000-0000-4000-8000-000000000501'
      and warehouse_id = '00000000-0000-4000-8000-000000000601'
  ),
  2500,
  'stock revenue share split is persisted in basis points'
);

select throws_ok(
  $$
    update private.inventory_products
    set revenue_share_partner_id = '00000000-0000-4000-8000-000000000352'
    where product_id = '00000000-0000-4000-8000-000000000401'
      and unit_id = '00000000-0000-4000-8000-000000000501'
      and warehouse_id = '00000000-0000-4000-8000-000000000601'
  $$,
  'P0001',
  'INVALID_REVENUE_SHARE_PARTNER_WORKSPACE_SCOPE',
  'stock revenue share rejects partners from another workspace'
);

select throws_ok(
  $$
    update private.inventory_products
    set revenue_share_bps = 10001
    where product_id = '00000000-0000-4000-8000-000000000401'
      and unit_id = '00000000-0000-4000-8000-000000000501'
      and warehouse_id = '00000000-0000-4000-8000-000000000601'
  $$,
  '23514',
  'new row for relation "inventory_products" violates check constraint "inventory_products_revenue_share_bps_check"',
  'stock revenue share split rejects values above 100 percent'
);

insert into private.inventory_storefronts (
  id,
  ws_id,
  slug,
  name,
  status,
  currency
)
values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000201',
  'inventory-bundle-scope-test',
  'Inventory bundle scope test',
  'published',
  'USD'
)
on conflict (id) do nothing;

insert into private.inventory_bundles (
  id,
  ws_id,
  storefront_id,
  slug,
  name,
  price,
  status
)
values (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000701',
  'inventory-bundle-scope-test',
  'Inventory bundle scope test',
  100,
  'active'
)
on conflict (id) do nothing;

insert into private.inventory_checkout_sessions (
  id,
  ws_id,
  storefront_id,
  customer_name,
  customer_email,
  currency,
  status,
  expires_at
)
values (
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000701',
  'Checkout tester',
  'checkout-tester@example.com',
  'USD',
  'reserved',
  now() + interval '15 minutes'
)
on conflict (id) do nothing;

select throws_ok(
  $$
    insert into private.inventory_bundle_components (
      bundle_id,
      product_id,
      unit_id,
      warehouse_id,
      quantity
    )
    values (
      '00000000-0000-4000-8000-000000000801',
      '00000000-0000-4000-8000-000000000402',
      '00000000-0000-4000-8000-000000000502',
      '00000000-0000-4000-8000-000000000602',
      1
    )
  $$,
  'P0001',
  'INVALID_BUNDLE_COMPONENT_WORKSPACE_SCOPE',
  'bundle components reject stock from another workspace'
);

select throws_ok(
  $$
    insert into private.inventory_bundle_category_components (
      bundle_id,
      category_id,
      quantity_required,
      free_quantity,
      discount_strategy
    )
    values (
      '00000000-0000-4000-8000-000000000801',
      '00000000-0000-4000-8000-000000000302',
      3,
      1,
      'cheapest_free'
    )
  $$,
  'P0001',
  'INVALID_BUNDLE_CATEGORY_COMPONENT_WORKSPACE_SCOPE',
  'category bundle components reject categories from another workspace'
);

select lives_ok(
  $$
    insert into private.inventory_bundle_components (
      bundle_id,
      product_id,
      unit_id,
      warehouse_id,
      quantity
    )
    values (
      '00000000-0000-4000-8000-000000000801',
      '00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000501',
      '00000000-0000-4000-8000-000000000601',
      1
    )
    on conflict (bundle_id, product_id, unit_id, warehouse_id) do nothing
  $$,
  'bundle components accept stock from the bundle workspace'
);

select throws_ok(
  $$
    select public._inventory_create_reserved_line(
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000901',
      null,
      '00000000-0000-4000-8000-000000000801',
      '00000000-0000-4000-8000-000000000402',
      '00000000-0000-4000-8000-000000000502',
      '00000000-0000-4000-8000-000000000602',
      'Victim line',
      1,
      100,
      now() + interval '15 minutes',
      now()
    )
  $$,
  'P0001',
  'INVENTORY_STOCK_NOT_FOUND',
  'reservation helper rejects stock from another workspace'
);

select lives_ok(
  $$
    select public._inventory_create_reserved_line(
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000901',
      null,
      '00000000-0000-4000-8000-000000000801',
      '00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000501',
      '00000000-0000-4000-8000-000000000601',
      'Attacker line',
      2,
      100,
      now() + interval '15 minutes',
      now()
    )
  $$,
  'reservation helper accepts stock from the checkout workspace'
);

select lives_ok(
  $$
    update private.inventory_products
    set amount = null
    where product_id = '00000000-0000-4000-8000-000000000401'
      and unit_id = '00000000-0000-4000-8000-000000000501'
      and warehouse_id = '00000000-0000-4000-8000-000000000601';

    select public._inventory_create_reserved_line(
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000901',
      null,
      '00000000-0000-4000-8000-000000000801',
      '00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000501',
      '00000000-0000-4000-8000-000000000601',
      'Unlimited attacker line',
      12,
      100,
      now() + interval '15 minutes',
      now()
    )
  $$,
  'reservation helper accepts unlimited stock rows'
);

select is(
  (
    select count(*)::int
    from private.inventory_reservations
    where checkout_session_id = '00000000-0000-4000-8000-000000000901'
  ),
  2,
  'only same-workspace reservations were persisted'
);

select is(
  (
    select coalesce(sum(amount), 0)::bigint
    from private.inventory_reservations
    where checkout_session_id = '00000000-0000-4000-8000-000000000901'
  ),
  14::bigint,
  'reservation amount belongs to the same-workspace stock line'
);

select ok(
  to_regprocedure(
    'public._inventory_create_reserved_line(uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,timestamptz)'
  ) is null,
  'old unscoped reservation helper signature is removed'
);

select * from finish();

rollback;
