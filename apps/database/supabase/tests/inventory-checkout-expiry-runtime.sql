begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(3);

insert into public.workspaces (id, name, creator_id, personal)
values (
  '10000000-0000-4000-8000-000000000001',
  'Expiry pgTAP',
  '00000000-0000-0000-0000-000000000001',
  false
);

insert into public.product_categories (id, name, ws_id)
values (
  '20000000-0000-0000-0000-000000000001',
  'Expiry pgTAP',
  '10000000-0000-4000-8000-000000000001'
);

insert into private.inventory_owners (id, name, ws_id)
values (
  '30000000-0000-0000-0000-000000000001',
  'Expiry pgTAP',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.workspace_products (id, category_id, name, owner_id, ws_id)
values (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Expiry pgTAP',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);

insert into private.inventory_units (id, name, ws_id)
values (
  '50000000-0000-0000-0000-000000000001',
  'Unit',
  '10000000-0000-4000-8000-000000000001'
);

insert into private.inventory_warehouses (id, name, ws_id)
values (
  '60000000-0000-0000-0000-000000000001',
  'Warehouse',
  '10000000-0000-4000-8000-000000000001'
);

insert into private.inventory_storefronts (id, name, slug, ws_id)
values (
  '70000000-0000-0000-0000-000000000001',
  'Expiry pgTAP',
  'expiry-pgtap',
  '10000000-0000-4000-8000-000000000001'
);

insert into private.inventory_checkout_sessions (
  id,
  customer_email,
  customer_name,
  expires_at,
  storefront_id,
  ws_id
)
values (
  '80000000-0000-0000-0000-000000000001',
  'expiry@example.com',
  'Expiry pgTAP',
  now() - interval '1 minute',
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);

insert into private.inventory_checkout_lines (
  id,
  checkout_session_id,
  product_id,
  quantity,
  title,
  unit_id,
  warehouse_id
)
values (
  '90000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  1,
  'Expiry pgTAP',
  '50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001'
);

insert into private.inventory_reservations (
  id,
  amount,
  checkout_line_id,
  checkout_session_id,
  expires_at,
  product_id,
  unit_id,
  warehouse_id
)
values (
  'a0000000-0000-0000-0000-000000000001',
  1,
  '90000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  now() - interval '1 minute',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001'
);

select is(
  (
    select count(*)::integer
    from private.expire_inventory_checkout_sessions(
      p_now := now(),
      p_limit := 50,
      p_ws_id := '10000000-0000-4000-8000-000000000001'
    )
  ),
  1,
  'the expiry sweep returns the checkout it materialized'
);

select is(
  (
    select status
    from private.inventory_checkout_sessions
    where id = '80000000-0000-0000-0000-000000000001'
  ),
  'expired',
  'the expiry sweep marks the checkout expired'
);

select is(
  (
    select status
    from private.inventory_reservations
    where id = 'a0000000-0000-0000-0000-000000000001'
  ),
  'expired',
  'the expiry sweep releases the held reservation as expired'
);

select * from finish();

rollback;
