begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(21);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000003101',
  'authenticated',
  'authenticated',
  'fixed-bundle-owner@example.test',
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.users (id, display_name)
values (
  '00000000-0000-4000-8000-000000003101',
  'Fixed bundle checkout owner'
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '00000000-0000-4000-8000-000000003201',
  'Fixed bundle checkout workspace',
  '00000000-0000-4000-8000-000000003101',
  false
)
on conflict (id) do nothing;

insert into public.product_categories (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000003301',
  'Fixed bundle checkout category',
  '00000000-0000-4000-8000-000000003201'
)
on conflict (id) do nothing;

insert into private.inventory_owners (id, ws_id, name)
values (
  '00000000-0000-4000-8000-000000003351',
  '00000000-0000-4000-8000-000000003201',
  'Fixed bundle checkout owner'
)
on conflict (id) do nothing;

insert into public.workspace_products (
  id,
  category_id,
  name,
  ws_id,
  archived,
  owner_id
)
values (
  '00000000-0000-4000-8000-000000003401',
  '00000000-0000-4000-8000-000000003301',
  'Offkai demo item',
  '00000000-0000-4000-8000-000000003201',
  false,
  '00000000-0000-4000-8000-000000003351'
)
on conflict (id) do nothing;

insert into private.inventory_units (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000003501',
  'Piece',
  '00000000-0000-4000-8000-000000003201'
)
on conflict (id) do nothing;

insert into private.inventory_warehouses (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000003601',
  'Demo warehouse',
  '00000000-0000-4000-8000-000000003201'
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
  '00000000-0000-4000-8000-000000003401',
  '00000000-0000-4000-8000-000000003501',
  '00000000-0000-4000-8000-000000003601',
  12,
  1
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
  '00000000-0000-4000-8000-000000003701',
  '00000000-0000-4000-8000-000000003201',
  'fixed-bundle-checkout-test',
  'Fixed bundle checkout test',
  'published',
  'public',
  'USD',
  'square_pos'
)
on conflict (id) do update
set
  slug = excluded.slug,
  status = excluded.status,
  checkout_mode = excluded.checkout_mode;

insert into private.inventory_bundles (
  id,
  ws_id,
  storefront_id,
  slug,
  name,
  price,
  pricing_mode,
  status,
  max_per_order
)
values (
  '00000000-0000-4000-8000-000000003901',
  '00000000-0000-4000-8000-000000003201',
  '00000000-0000-4000-8000-000000003701',
  'storefront-testing-bundle',
  'Storefront Testing Bundle',
  200,
  'fixed_price',
  'active',
  4
)
on conflict (id) do update
set
  price = excluded.price,
  pricing_mode = excluded.pricing_mode,
  status = excluded.status;

insert into private.inventory_bundle_components (
  bundle_id,
  product_id,
  unit_id,
  warehouse_id,
  quantity
)
values (
  '00000000-0000-4000-8000-000000003901',
  '00000000-0000-4000-8000-000000003401',
  '00000000-0000-4000-8000-000000003501',
  '00000000-0000-4000-8000-000000003601',
  3
)
on conflict (bundle_id, product_id, unit_id, warehouse_id) do update
set quantity = excluded.quantity;

insert into private.inventory_storefront_listings (
  id,
  storefront_id,
  ws_id,
  listing_type,
  bundle_id,
  title,
  price,
  status,
  max_per_order
)
values (
  '00000000-0000-4000-8000-000000003801',
  '00000000-0000-4000-8000-000000003701',
  '00000000-0000-4000-8000-000000003201',
  'bundle',
  '00000000-0000-4000-8000-000000003901',
  'Storefront Testing Bundle',
  200,
  'published',
  4
)
on conflict (id) do update
set
  price = excluded.price,
  status = excluded.status;

create temporary table fixed_bundle_checkout_result on commit drop as
select public.create_inventory_checkout_session(
  'fixed-bundle-checkout-test',
  jsonb_build_object(
    'customerName', 'Bundle tester',
    'customerEmail', 'bundle-test@example.com',
    'lines', jsonb_build_array(
      jsonb_build_object(
        'listingId', '00000000-0000-4000-8000-000000003801',
        'quantity', 1
      )
    )
  )
) as result;

select is(
  (select (result ->> 'totalAmount')::bigint from fixed_bundle_checkout_result),
  200::bigint,
  'a three-component fixed bundle is charged exactly once'
);

select is(
  (
    select sum(line.subtotal_amount)::bigint
    from private.inventory_checkout_lines line
    where line.checkout_session_id = (
      select (result ->> 'id')::uuid from fixed_bundle_checkout_result
    )
  ),
  200::bigint,
  'persisted checkout line subtotals match the fixed bundle price'
);

select is(
  (
    select sum(line.recognized_revenue_amount)::bigint
    from private.inventory_checkout_lines line
    where line.checkout_session_id = (
      select (result ->> 'id')::uuid from fixed_bundle_checkout_result
    )
  ),
  200::bigint,
  'recognized component revenue exactly matches the fixed bundle price'
);

select is(
  (
    select sum(line.catalog_basis_amount)::bigint
    from private.inventory_checkout_lines line
    where line.checkout_session_id = (
      select (result ->> 'id')::uuid from fixed_bundle_checkout_result
    )
  ),
  300::bigint,
  'catalog basis snapshots every consumed component unit'
);

select is(
  (
    select count(distinct line.revenue_allocation_source)::bigint
    from private.inventory_checkout_lines line
    where line.checkout_session_id = (
      select (result ->> 'id')::uuid from fixed_bundle_checkout_result
    )
      and line.revenue_allocation_source = 'stock_snapshot'
  ),
  1::bigint,
  'new fixed-bundle lines record stock-snapshot allocation provenance'
);

select is(
  (
    select sum(line.quantity)::bigint
    from private.inventory_checkout_lines line
    where line.checkout_session_id = (
      select (result ->> 'id')::uuid from fixed_bundle_checkout_result
    )
      and line.unit_price = 200
  ),
  1::bigint,
  'the charged checkout line represents one purchased bundle'
);

select is(
  (
    select sum(line.quantity)::bigint
    from private.inventory_checkout_lines line
    where line.checkout_session_id = (
      select (result ->> 'id')::uuid from fixed_bundle_checkout_result
    )
      and line.unit_price = 0
  ),
  2::bigint,
  'the remaining component units are included without another charge'
);

select is(
  (
    select sum(reservation.amount)::bigint
    from private.inventory_reservations reservation
    where reservation.checkout_session_id = (
      select (result ->> 'id')::uuid from fixed_bundle_checkout_result
    )
  ),
  3::bigint,
  'all three component units remain reserved for stock consumption'
);

select is(
  (
    select stock.amount::bigint
    from private.inventory_products stock
    where stock.product_id = '00000000-0000-4000-8000-000000003401'
      and stock.unit_id = '00000000-0000-4000-8000-000000003501'
      and stock.warehouse_id = '00000000-0000-4000-8000-000000003601'
  ),
  12::bigint,
  'reservation creation does not consume stock before payment confirmation'
);

select public.complete_inventory_checkout_session_square_payment(
  (select (result ->> 'id')::uuid from fixed_bundle_checkout_result),
  '00000000-0000-4000-8000-000000003201',
  'fixed-bundle-test-payment',
  'fixed-bundle-test-order'
);

select is(
  (
    select stock.amount::bigint
    from private.inventory_products stock
    where stock.product_id = '00000000-0000-4000-8000-000000003401'
      and stock.unit_id = '00000000-0000-4000-8000-000000003501'
      and stock.warehouse_id = '00000000-0000-4000-8000-000000003601'
  ),
  9::bigint,
  'payment confirmation consumes every included bundle component unit'
);

select is(
  (
    select sum(reservation.amount)::bigint
    from private.inventory_reservations reservation
    where reservation.checkout_session_id = (
      select (result ->> 'id')::uuid from fixed_bundle_checkout_result
    )
      and reservation.status = 'consumed'
  ),
  3::bigint,
  'all fixed-bundle reservations are marked consumed after payment'
);

insert into private.workspace_wallets (id, name, currency, ws_id)
values (
  '00000000-0000-4000-8000-000000003011',
  'Cash drawer',
  'USD',
  '00000000-0000-4000-8000-000000003201'
);

insert into public.transaction_categories (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000003012',
  'Cash storefront sales',
  '00000000-0000-4000-8000-000000003201'
);

create temporary table cash_bundle_checkout_result on commit drop as
select public.create_inventory_checkout_session(
  'fixed-bundle-checkout-test',
  jsonb_build_object(
    'customerName', 'Cash bundle tester',
    'customerEmail', 'cash-bundle-test@example.com',
    'lines', jsonb_build_array(
      jsonb_build_object(
        'listingId', '00000000-0000-4000-8000-000000003801',
        'quantity', 1
      )
    )
  )
) as result;

select lives_ok(
  format(
    $$select * from private.complete_inventory_checkout_session_cash_payment(
      %L::uuid,
      '00000000-0000-4000-8000-000000003201',
      '00000000-0000-4000-8000-000000003011',
      '00000000-0000-4000-8000-000000003012',
      '00000000-0000-4000-8000-000000003101'
    )$$,
    (select result ->> 'id' from cash_bundle_checkout_result)
  ),
  'cash completion atomically consumes stock and posts Finance'
);

select is(
  (
    select checkout.checkout_provider
    from private.inventory_checkout_sessions checkout
    where checkout.id = (
      select (result ->> 'id')::uuid from cash_bundle_checkout_result
    )
  ),
  'cash'::text,
  'cash completion records cash as the checkout provider'
);

select ok(
  (
    select checkout.finance_transaction_id is not null
    from private.inventory_checkout_sessions checkout
    where checkout.id = (
      select (result ->> 'id')::uuid from cash_bundle_checkout_result
    )
  ),
  'cash completion links exactly one Finance wallet transaction'
);

select lives_ok(
  format(
    $$select * from private.complete_inventory_checkout_session_cash_payment(
      %L::uuid,
      '00000000-0000-4000-8000-000000003201',
      '00000000-0000-4000-8000-000000003011',
      '00000000-0000-4000-8000-000000003012',
      '00000000-0000-4000-8000-000000003101'
    )$$,
    (select result ->> 'id' from cash_bundle_checkout_result)
  ),
  'repeating the same cash completion is idempotent'
);

select is(
  (
    select count(*)::bigint
    from private.inventory_finance_entries entry
    where entry.checkout_session_id = (
      select (result ->> 'id')::uuid from cash_bundle_checkout_result
    )
      and entry.wallet_transaction_id is not null
  ),
  1::bigint,
  'cash retries retain exactly one linked Finance wallet transaction'
);

create temporary table rejected_cash_checkout_result on commit drop as
select public.create_inventory_checkout_session(
  'fixed-bundle-checkout-test',
  jsonb_build_object(
    'customerName', 'Rejected cash tester',
    'customerEmail', 'rejected-cash@example.com',
    'lines', jsonb_build_array(
      jsonb_build_object(
        'listingId', '00000000-0000-4000-8000-000000003801',
        'quantity', 1
      )
    )
  )
) as result;

select throws_ok(
  format(
    $$select * from private.complete_inventory_checkout_session_cash_payment(
      %L::uuid,
      '00000000-0000-4000-8000-000000003201',
      '00000000-0000-4000-8000-000000009999',
      '00000000-0000-4000-8000-000000003012',
      '00000000-0000-4000-8000-000000003101'
    )$$,
    (select result ->> 'id' from rejected_cash_checkout_result)
  ),
  'P0001',
  'CASH_WALLET_INVALID',
  'an invalid cash wallet rolls back completion'
);

select is(
  (
    select checkout.status
    from private.inventory_checkout_sessions checkout
    where checkout.id = (
      select (result ->> 'id')::uuid from rejected_cash_checkout_result
    )
  ),
  'reserved'::text,
  'a rejected cash checkout remains reserved rather than partially completed'
);

select is(
  (
    select stock.amount::bigint
    from private.inventory_products stock
    where stock.product_id = '00000000-0000-4000-8000-000000003401'
      and stock.unit_id = '00000000-0000-4000-8000-000000003501'
      and stock.warehouse_id = '00000000-0000-4000-8000-000000003601'
  ),
  6::bigint,
  'a rejected cash checkout does not consume any stock'
);

update private.inventory_products
set price = 0
where product_id = '00000000-0000-4000-8000-000000003401'
  and unit_id = '00000000-0000-4000-8000-000000003501'
  and warehouse_id = '00000000-0000-4000-8000-000000003601';

create temporary table zero_basis_checkout_result on commit drop as
select public.create_inventory_checkout_session(
  'fixed-bundle-checkout-test',
  jsonb_build_object(
    'customerName', 'Zero basis tester',
    'customerEmail', 'zero-basis@example.com',
    'lines', jsonb_build_array(
      jsonb_build_object(
        'listingId', '00000000-0000-4000-8000-000000003801',
        'quantity', 1
      )
    )
  )
) as result;

select is(
  (
    select sum(line.recognized_revenue_amount)::bigint
    from private.inventory_checkout_lines line
    where line.checkout_session_id = (
      select (result ->> 'id')::uuid from zero_basis_checkout_result
    )
  ),
  200::bigint,
  'zero-price component fallback still preserves the exact bundle total'
);

select is(
  (
    select count(*)::bigint
    from private.inventory_checkout_lines line
    where line.checkout_session_id = (
      select (result ->> 'id')::uuid from zero_basis_checkout_result
    )
      and line.revenue_allocation_source = 'equal_weight_fallback'
  ),
  2::bigint,
  'zero-price components record equal-weight fallback provenance'
);

select * from finish();

rollback;
