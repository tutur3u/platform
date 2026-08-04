begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into public.users (id, display_name)
values (
  '20000000-0000-4000-8000-000000001001',
  'Sales export owner'
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  (
    '20000000-0000-4000-8000-000000001002',
    'Sales export workspace',
    '20000000-0000-4000-8000-000000001001',
    false
  ),
  (
    '20000000-0000-4000-8000-000000001003',
    'Other sales export workspace',
    '20000000-0000-4000-8000-000000001001',
    false
  )
on conflict (id) do nothing;

insert into public.product_categories (id, name, ws_id)
values (
  '20000000-0000-4000-8000-000000001004',
  'Export category',
  '20000000-0000-4000-8000-000000001002'
)
on conflict (id) do nothing;

insert into public.transaction_categories (id, name, ws_id)
values (
  '20000000-0000-4000-8000-000000001004',
  'Export income',
  '20000000-0000-4000-8000-000000001002'
)
on conflict (id) do nothing;

insert into private.workspace_wallets (id, name, currency, ws_id)
values (
  '20000000-0000-4000-8000-000000001005',
  'Export wallet',
  'USD',
  '20000000-0000-4000-8000-000000001002'
)
on conflict (id) do nothing;

insert into private.inventory_owners (id, name, ws_id)
values (
  '20000000-0000-4000-8000-000000001006',
  'Export owner',
  '20000000-0000-4000-8000-000000001002'
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
  '20000000-0000-4000-8000-000000001007',
  '20000000-0000-4000-8000-000000001004',
  'Export product',
  '20000000-0000-4000-8000-000000001006',
  '20000000-0000-4000-8000-000000001002'
)
on conflict (id) do nothing;

insert into private.inventory_units (id, name, ws_id)
values (
  '20000000-0000-4000-8000-000000001008',
  'Piece',
  '20000000-0000-4000-8000-000000001002'
)
on conflict (id) do nothing;

insert into private.inventory_warehouses (id, name, ws_id)
values (
  '20000000-0000-4000-8000-000000001009',
  'Export booth',
  '20000000-0000-4000-8000-000000001002'
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
  '20000000-0000-4000-8000-000000001010',
  '20000000-0000-4000-8000-000000001002',
  'sales-export-test',
  'Sales export test',
  'published',
  'public',
  'USD',
  'square_pos'
)
on conflict (id) do nothing;

insert into public.workspace_users (
  id,
  ws_id,
  full_name,
  email
)
values (
  '20000000-0000-4000-8000-000000001011',
  '20000000-0000-4000-8000-000000001002',
  'Export customer',
  'export-customer@example.test'
)
on conflict (id) do nothing;

insert into private.inventory_sales_periods (
  id,
  ws_id,
  name,
  status
)
values
  (
    '20000000-0000-4000-8000-000000001012',
    '20000000-0000-4000-8000-000000001002',
    'Archived export period',
    'archived'
  ),
  (
    '20000000-0000-4000-8000-000000001013',
    '20000000-0000-4000-8000-000000001003',
    'Other workspace period',
    'active'
  );

insert into public.finance_invoices (
  id,
  ws_id,
  category_id,
  customer_id,
  wallet_id,
  notice,
  note,
  paid_amount,
  price,
  completed_at
)
values (
  '20000000-0000-4000-8000-000000001014',
  '20000000-0000-4000-8000-000000001002',
  '20000000-0000-4000-8000-000000001004',
  '20000000-0000-4000-8000-000000001011',
  '20000000-0000-4000-8000-000000001005',
  'Manual export sale',
  'Manual note',
  19.95,
  19.95,
  now()
);

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
values (
  '20000000-0000-4000-8000-000000001014',
  '20000000-0000-4000-8000-000000001007',
  'Export product',
  3,
  6.65,
  '20000000-0000-4000-8000-000000001008',
  'Piece',
  '20000000-0000-4000-8000-000000001009',
  'Export booth',
  '20000000-0000-4000-8000-000000001006',
  'Export owner'
);

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
    '20000000-0000-4000-8000-000000001015',
    '20000000-0000-4000-8000-000000001002',
    '20000000-0000-4000-8000-000000001010',
    'sales-export-checkout',
    'Checkout customer',
    'checkout-customer@example.test',
    'USD',
    'completed',
    now() + interval '15 minutes',
    now(),
    12625,
    12625,
    'square_pos',
    'square-order-export'
  ),
  (
    '20000000-0000-4000-8000-000000001016',
    '20000000-0000-4000-8000-000000001002',
    '20000000-0000-4000-8000-000000001010',
    'sales-export-empty-checkout',
    'Empty checkout customer',
    'empty-checkout@example.test',
    'USD',
    'completed',
    now() + interval '15 minutes',
    now(),
    500,
    500,
    'simulated',
    null
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
select
  gen_random_uuid(),
  '20000000-0000-4000-8000-000000001015',
  '20000000-0000-4000-8000-000000001007',
  '20000000-0000-4000-8000-000000001008',
  '20000000-0000-4000-8000-000000001009',
  'Export product ' || series,
  1,
  125,
  125
from generate_series(1, 101) as series;

insert into private.inventory_sales_period_assignments (
  ws_id,
  period_id,
  sale_source,
  sale_id
)
values
  (
    '20000000-0000-4000-8000-000000001002',
    '20000000-0000-4000-8000-000000001012',
    'finance_invoice',
    '20000000-0000-4000-8000-000000001014'
  ),
  (
    '20000000-0000-4000-8000-000000001002',
    '20000000-0000-4000-8000-000000001012',
    'checkout_session',
    '20000000-0000-4000-8000-000000001015'
  ),
  (
    '20000000-0000-4000-8000-000000001002',
    '20000000-0000-4000-8000-000000001012',
    'checkout_session',
    '20000000-0000-4000-8000-000000001016'
  );

select ok(
  to_regprocedure(
    'private.list_inventory_sales_export_rows(uuid,uuid)'
  ) is not null,
  'sales export RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.list_inventory_sales_export_rows(uuid,uuid)',
    'execute'
  ),
  'service role can execute the sales export RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.list_inventory_sales_export_rows(uuid,uuid)',
    'execute'
  ),
  'authenticated clients cannot execute the sales export RPC'
);

select is(
  (
    select count(*)::integer
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001012'
    )
  ),
  103,
  'exports every line without the 100-row sales page limit'
);

select is(
  (
    select count(*)::integer
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001012'
    )
    where sale_source = 'finance_invoice'
  ),
  1,
  'exports assigned manual invoice sales'
);

select is(
  (
    select count(*)::integer
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001012'
    )
    where sale_source = 'checkout_session'
  ),
  102,
  'exports assigned completed checkout sales'
);

select is(
  (
    select count(*)::integer
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001012'
    )
    where sale_id = '20000000-0000-4000-8000-000000001016'
      and line_id is null
  ),
  1,
  'retains a sale with no line items as a blank line row'
);

select results_eq(
  $$
    select monetary_unit, sale_amount, unit_price, line_total
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001012'
    )
    where sale_id = '20000000-0000-4000-8000-000000001014'
  $$,
  $$
    values ('major'::text, 19.95::numeric, 6.65::numeric, 19.95::numeric)
  $$,
  'manual invoice values retain their major-unit marker and exact decimals'
);

select results_eq(
  $$
    select monetary_unit, sale_amount, unit_price, line_total
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001012'
    )
    where sale_id = '20000000-0000-4000-8000-000000001015'
    limit 1
  $$,
  $$
    values ('minor'::text, 12625::numeric, 125::numeric, 125::numeric)
  $$,
  'checkout values retain their minor-unit marker for currency normalization'
);

select results_eq(
  $$
    select
      product_name,
      product_category_name,
      owner_name,
      unit_name,
      warehouse_name
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001012'
    )
    where sale_id = '20000000-0000-4000-8000-000000001014'
  $$,
  $$
    values (
      'Export product'::text,
      'Export category'::text,
      'Export owner'::text,
      'Piece'::text,
      'Export booth'::text
    )
  $$,
  'exports complete finance-invoice line-item metadata'
);

select results_eq(
  $$
    select distinct product_name, product_category_name
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001012'
    )
    where sale_id = '20000000-0000-4000-8000-000000001015'
  $$,
  $$
    values ('Export product'::text, 'Export category'::text)
  $$,
  'exports checkout product names and inventory categories'
);

select is(
  (
    select max(period_name)
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001012'
    )
  ),
  'Archived export period',
  'archived periods remain exportable'
);

select is(
  (
    select count(*)::integer
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001003',
      '20000000-0000-4000-8000-000000001012'
    )
  ),
  0,
  'a period cannot be exported through another workspace'
);

select is(
  (
    select count(*)::integer
    from private.list_inventory_sales_export_rows(
      '20000000-0000-4000-8000-000000001002',
      '20000000-0000-4000-8000-000000001013'
    )
  ),
  0,
  'another workspace period cannot leak into the requested workspace'
);

select * from finish();

rollback;
