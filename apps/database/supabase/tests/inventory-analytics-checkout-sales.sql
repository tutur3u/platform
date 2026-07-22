begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into public.users (id, display_name)
values (
  '10000000-0000-4000-8000-000000009001',
  'Checkout analytics owner'
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '10000000-0000-4000-8000-000000009002',
  'Checkout analytics workspace',
  '10000000-0000-4000-8000-000000009001',
  false
)
on conflict (id) do nothing;

insert into public.product_categories (id, name, ws_id)
values (
  '10000000-0000-4000-8000-000000009003',
  'Posters',
  '10000000-0000-4000-8000-000000009002'
)
on conflict (id) do nothing;

insert into private.inventory_owners (id, name, ws_id)
values (
  '10000000-0000-4000-8000-000000009004',
  'Convention team',
  '10000000-0000-4000-8000-000000009002'
)
on conflict (id) do nothing;

insert into public.workspace_products (
  id,
  category_id,
  name,
  owner_id,
  ws_id
)
values (
  '10000000-0000-4000-8000-000000009005',
  '10000000-0000-4000-8000-000000009003',
  'Checkout analytics poster',
  '10000000-0000-4000-8000-000000009004',
  '10000000-0000-4000-8000-000000009002'
)
on conflict (id) do nothing;

insert into private.inventory_units (id, name, ws_id)
values (
  '10000000-0000-4000-8000-000000009006',
  'Piece',
  '10000000-0000-4000-8000-000000009002'
)
on conflict (id) do nothing;

insert into private.inventory_warehouses (id, name, ws_id)
values (
  '10000000-0000-4000-8000-000000009007',
  'Event booth',
  '10000000-0000-4000-8000-000000009002'
)
on conflict (id) do nothing;

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
  '10000000-0000-4000-8000-000000009008',
  '10000000-0000-4000-8000-000000009002',
  'checkout-analytics-test',
  'Checkout analytics test',
  'published',
  'public',
  'USD',
  'square_pos'
)
on conflict (id) do nothing;

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
  completed_at,
  subtotal_amount,
  total_amount,
  checkout_provider,
  square_order_id
)
values
  (
    '10000000-0000-4000-8000-000000009009',
    '10000000-0000-4000-8000-000000009002',
    '10000000-0000-4000-8000-000000009008',
    'checkout-analytics-usd-completed',
    'Square customer',
    'square-customer@example.test',
    'USD',
    'completed',
    now() + interval '15 minutes',
    now(),
    4321,
    4321,
    'square_pos',
    'square-order-analytics'
  ),
  (
    '10000000-0000-4000-8000-000000009010',
    '10000000-0000-4000-8000-000000009002',
    '10000000-0000-4000-8000-000000009008',
    'checkout-analytics-vnd-excluded',
    'Different currency customer',
    'vnd-customer@example.test',
    'VND',
    'completed',
    now() + interval '15 minutes',
    now(),
    50000,
    50000,
    'square_pos',
    'square-order-vnd-excluded'
  ),
  (
    '10000000-0000-4000-8000-000000009011',
    '10000000-0000-4000-8000-000000009002',
    '10000000-0000-4000-8000-000000009008',
    'checkout-analytics-reserved-excluded',
    'Reserved customer',
    'reserved-customer@example.test',
    'USD',
    'reserved',
    now() + interval '15 minutes',
    null,
    9999,
    9999,
    'square_pos',
    'square-order-reserved-excluded'
  );

insert into private.inventory_checkout_lines (
  id,
  checkout_session_id,
  product_id,
  unit_id,
  warehouse_id,
  title,
  quantity,
  unit_price,
  subtotal_amount
)
values
  (
    '10000000-0000-4000-8000-000000009012',
    '10000000-0000-4000-8000-000000009009',
    '10000000-0000-4000-8000-000000009005',
    '10000000-0000-4000-8000-000000009006',
    '10000000-0000-4000-8000-000000009007',
    'Checkout analytics poster',
    2,
    2160,
    4321
  ),
  (
    '10000000-0000-4000-8000-000000009013',
    '10000000-0000-4000-8000-000000009010',
    '10000000-0000-4000-8000-000000009005',
    '10000000-0000-4000-8000-000000009006',
    '10000000-0000-4000-8000-000000009007',
    'Excluded VND poster',
    1,
    50000,
    50000
  ),
  (
    '10000000-0000-4000-8000-000000009014',
    '10000000-0000-4000-8000-000000009011',
    '10000000-0000-4000-8000-000000009005',
    '10000000-0000-4000-8000-000000009006',
    '10000000-0000-4000-8000-000000009007',
    'Excluded reserved poster',
    4,
    2499,
    9999
  );

select ok(
  to_regprocedure(
    'private.get_inventory_analytics(uuid,integer,text)'
  ) is not null,
  'inventory analytics accepts the workspace currency'
);
select ok(
  has_function_privilege(
    'service_role',
    'private.get_inventory_analytics(uuid,integer,text)',
    'execute'
  ),
  'service role can read combined inventory analytics'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_inventory_analytics(uuid,integer,text)',
    'execute'
  ),
  'authenticated clients cannot call combined analytics directly'
);
select is(
  private.get_inventory_analytics(
    '10000000-0000-4000-8000-000000009002',
    30,
    'USD'
  ) -> 'summary' ->> 'revenue',
  '43.2100000000000000',
  'completed checkout minor units are normalized to USD revenue'
);
select is(
  private.get_inventory_analytics(
    '10000000-0000-4000-8000-000000009002',
    30,
    'USD'
  ) -> 'summary' ->> 'sales',
  '1',
  'only completed checkouts in the requested currency count as sales'
);
select is(
  private.get_inventory_analytics(
    '10000000-0000-4000-8000-000000009002',
    30,
    'USD'
  ) -> 'summary' ->> 'units',
  '2',
  'completed checkout line quantities count as units sold'
);
select is(
  (
    select entry ->> 'revenue'
    from jsonb_array_elements(
      private.get_inventory_analytics(
        '10000000-0000-4000-8000-000000009002',
        30,
        'USD'
      ) -> 'products'
    ) entry
    where entry ->> 'label' = 'Checkout analytics poster'
  ),
  '43.2100000000000000',
  'product analytics use normalized checkout line revenue'
);
select is(
  (
    select entry ->> 'label'
    from jsonb_array_elements(
      private.get_inventory_analytics(
        '10000000-0000-4000-8000-000000009002',
        30,
        'USD'
      ) -> 'channels'
    ) entry
    where entry ->> 'label' = 'square'
  ),
  'square',
  'Square POS checkouts appear in channel analytics'
);
select is(
  (
    select entry ->> 'sales'
    from jsonb_array_elements(
      private.get_inventory_analytics(
        '10000000-0000-4000-8000-000000009002',
        30,
        'USD'
      ) -> 'trend'
    ) entry
    where entry ->> 'date' = current_date::text
  ),
  '1',
  'completed checkouts appear in the daily sales trend'
);
select is(
  private.get_inventory_analytics(
    '10000000-0000-4000-8000-000000009002',
    30,
    'USD'
  ) -> 'summary' ->> 'averageOrderValue',
  '43.2100000000000000',
  'average order value is calculated from checkout revenue'
);

select * from finish();
rollback;
