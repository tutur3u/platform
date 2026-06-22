begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(19);

select ok(
  to_regprocedure(
    'private.get_public_inventory_storefront(text,timestamptz)'
  ) is not null,
  'private public-storefront RPC exists'
);

select ok(
  to_regprocedure(
    'private.get_inventory_checkout_by_public_token(text)'
  ) is not null,
  'private checkout-by-public-token RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_public_inventory_storefront(text,timestamptz)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'private.get_inventory_checkout_by_public_token(text)',
    'execute'
  ),
  'service role can execute public storefront private RPCs'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.get_public_inventory_storefront(text,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.get_public_inventory_storefront(text,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'private.get_inventory_checkout_by_public_token(text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.get_inventory_checkout_by_public_token(text)',
    'execute'
  ),
  'anon and authenticated cannot execute public storefront private RPCs'
);

insert into public.users (id, display_name)
values (
  '00000000-0000-4000-8000-000000001101',
  'Inventory storefront RPC owner'
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '00000000-0000-4000-8000-000000001201',
  'Inventory storefront RPC workspace',
  '00000000-0000-4000-8000-000000001101',
  false
)
on conflict (id) do nothing;

insert into public.product_categories (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000001301',
  'Inventory storefront RPC category',
  '00000000-0000-4000-8000-000000001201'
)
on conflict (id) do nothing;

insert into private.inventory_owners (id, ws_id, name)
values (
  '00000000-0000-4000-8000-000000001351',
  '00000000-0000-4000-8000-000000001201',
  'Inventory storefront RPC owner'
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
  '00000000-0000-4000-8000-000000001401',
  '00000000-0000-4000-8000-000000001301',
  'Inventory storefront RPC product',
  null,
  null,
  '00000000-0000-4000-8000-000000001201',
  null,
  null,
  false,
  owner.id,
  null,
  null
from private.inventory_owners owner
where owner.id = '00000000-0000-4000-8000-000000001351'
on conflict (id) do nothing;

insert into private.inventory_units (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000001501',
  'Inventory storefront RPC unit',
  '00000000-0000-4000-8000-000000001201'
)
on conflict (id) do nothing;

insert into private.inventory_warehouses (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000001601',
  'Inventory storefront RPC warehouse',
  '00000000-0000-4000-8000-000000001201'
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
  '00000000-0000-4000-8000-000000001401',
  '00000000-0000-4000-8000-000000001501',
  '00000000-0000-4000-8000-000000001601',
  7,
  1200
)
on conflict (product_id, unit_id, warehouse_id) do update
set
  amount = excluded.amount,
  price = excluded.price;

insert into private.inventory_storefronts (
  id,
  ws_id,
  slug,
  name,
  status,
  visibility,
  currency,
  theme_preset,
  layout_style,
  surface_style,
  corner_style,
  show_inventory_badges
)
values (
  '00000000-0000-4000-8000-000000001701',
  '00000000-0000-4000-8000-000000001201',
  'inventory-public-rpc-test',
  'Inventory public RPC test',
  'published',
  'public',
  'USD',
  'boutique',
  'feature',
  'glass',
  'soft',
  false
)
on conflict (id) do update
set
  slug = excluded.slug,
  status = excluded.status,
  visibility = excluded.visibility,
  theme_preset = excluded.theme_preset,
  layout_style = excluded.layout_style,
  surface_style = excluded.surface_style,
  corner_style = excluded.corner_style,
  show_inventory_badges = excluded.show_inventory_badges;

insert into private.inventory_storefront_sections (
  id,
  ws_id,
  storefront_id,
  section_type,
  status,
  title,
  description,
  sort_order
)
values (
  '00000000-0000-4000-8000-000000001751',
  '00000000-0000-4000-8000-000000001201',
  '00000000-0000-4000-8000-000000001701',
  'promo',
  'published',
  'Inventory public RPC promo',
  'Published merch section',
  0
)
on conflict (id) do update
set
  status = excluded.status,
  title = excluded.title,
  description = excluded.description;

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
  status,
  max_per_order
)
values (
  '00000000-0000-4000-8000-000000001801',
  '00000000-0000-4000-8000-000000001701',
  '00000000-0000-4000-8000-000000001201',
  'product',
  '00000000-0000-4000-8000-000000001401',
  '00000000-0000-4000-8000-000000001501',
  '00000000-0000-4000-8000-000000001601',
  'Inventory storefront RPC listing',
  1200,
  'published',
  5
)
on conflict (id) do update
set
  status = excluded.status,
  price = excluded.price;

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
  '00000000-0000-4000-8000-000000001402',
  '00000000-0000-4000-8000-000000001301',
  'Inventory storefront unlimited product',
  null,
  null,
  '00000000-0000-4000-8000-000000001201',
  null,
  null,
  false,
  owner.id,
  null,
  null
from private.inventory_owners owner
where owner.id = '00000000-0000-4000-8000-000000001351'
on conflict (id) do nothing;

insert into private.inventory_products (
  product_id,
  unit_id,
  warehouse_id,
  amount,
  price
)
values (
  '00000000-0000-4000-8000-000000001402',
  '00000000-0000-4000-8000-000000001501',
  '00000000-0000-4000-8000-000000001601',
  null,
  1500
)
on conflict (product_id, unit_id, warehouse_id) do update
set
  amount = excluded.amount,
  price = excluded.price;

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
  status,
  sort_order,
  max_per_order
)
values (
  '00000000-0000-4000-8000-000000001802',
  '00000000-0000-4000-8000-000000001701',
  '00000000-0000-4000-8000-000000001201',
  'product',
  '00000000-0000-4000-8000-000000001402',
  '00000000-0000-4000-8000-000000001501',
  '00000000-0000-4000-8000-000000001601',
  'Inventory storefront unlimited listing',
  1500,
  'published',
  2,
  5
)
on conflict (id) do update
set
  status = excluded.status,
  price = excluded.price,
  sort_order = excluded.sort_order;

insert into private.inventory_bundles (
  id,
  ws_id,
  storefront_id,
  slug,
  name,
  price,
  status,
  max_per_order
)
values (
  '00000000-0000-4000-8000-000000001901',
  '00000000-0000-4000-8000-000000001201',
  '00000000-0000-4000-8000-000000001701',
  'inventory-public-rpc-bundle',
  'Inventory public RPC bundle',
  2100,
  'active',
  3
)
on conflict (id) do update
set
  status = excluded.status,
  price = excluded.price;

insert into private.inventory_bundle_components (
  bundle_id,
  product_id,
  unit_id,
  warehouse_id,
  quantity
)
values (
  '00000000-0000-4000-8000-000000001901',
  '00000000-0000-4000-8000-000000001401',
  '00000000-0000-4000-8000-000000001501',
  '00000000-0000-4000-8000-000000001601',
  2
)
on conflict (bundle_id, product_id, unit_id, warehouse_id) do update
set quantity = excluded.quantity;

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
  total_amount
)
values (
  '00000000-0000-4000-8000-000000002001',
  '00000000-0000-4000-8000-000000001201',
  '00000000-0000-4000-8000-000000001701',
  'inventory-public-rpc-token',
  'Inventory storefront RPC customer',
  'inventory-rpc@example.com',
  'USD',
  'reserved',
  now() + interval '15 minutes',
  1200,
  1200
)
on conflict (id) do update
set
  public_token = excluded.public_token,
  status = excluded.status,
  polar_order_id = null,
  polar_status = null,
  completed_at = null;

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
  '00000000-0000-4000-8000-000000002101',
  '00000000-0000-4000-8000-000000002001',
  '00000000-0000-4000-8000-000000001801',
  '00000000-0000-4000-8000-000000001401',
  '00000000-0000-4000-8000-000000001501',
  '00000000-0000-4000-8000-000000001601',
  'Inventory storefront RPC checkout line',
  1,
  1200,
  1200
)
on conflict (id) do update
set quantity = excluded.quantity;

select throws_ok(
  $$
    select private.release_inventory_checkout_session(
      p_checkout_id := '00000000-0000-4000-8000-000000002001',
      p_ws_id := '00000000-0000-4000-8000-000000009999'
    )
  $$,
  'P0001',
  'CHECKOUT_NOT_FOUND',
  'release RPC rejects checkout ids outside the supplied workspace'
);

select is(
  (
    select status
    from private.inventory_checkout_sessions
    where id = '00000000-0000-4000-8000-000000002001'
  ),
  'reserved',
  'wrong-workspace release leaves checkout reserved'
);

select throws_ok(
  $$
    select private.complete_inventory_checkout_session_payment(
      p_checkout_id := '00000000-0000-4000-8000-000000002001',
      p_ws_id := '00000000-0000-4000-8000-000000009999',
      p_polar_order_id := 'forged-order-id'
    )
  $$,
  'P0001',
  'CHECKOUT_NOT_FOUND',
  'payment RPC rejects checkout ids outside the supplied workspace'
);

select is(
  (
    select polar_order_id
    from private.inventory_checkout_sessions
    where id = '00000000-0000-4000-8000-000000002001'
  ),
  null::text,
  'wrong-workspace payment leaves checkout unpaid'
);

select ok(
  private.get_public_inventory_storefront('missing-public-rpc-store') is null,
  'missing storefront returns null'
);

select is(
  private.get_public_inventory_storefront('inventory-public-rpc-test')
    -> 'storefront'
    ->> 'slug',
  'inventory-public-rpc-test',
  'public storefront RPC returns storefront identity'
);

select is(
  private.get_public_inventory_storefront('inventory-public-rpc-test')
    -> 'storefront'
    ->> 'themePreset',
  'boutique',
  'public storefront RPC returns storefront theme fields'
);

select is(
  jsonb_array_length(
    private.get_public_inventory_storefront('inventory-public-rpc-test')
      -> 'listings'
  ),
  2,
  'public storefront RPC returns published listings'
);

select is(
  (
    private.get_public_inventory_storefront('inventory-public-rpc-test')
      -> 'listings'
      -> 0
      ->> 'availableQuantity'
  )::int,
  7,
  'public storefront RPC returns listing availability'
);

select ok(
  exists (
    select 1
    from jsonb_array_elements(
      private.get_public_inventory_storefront('inventory-public-rpc-test')
        -> 'listings'
    ) listing
    where listing ->> 'id' = '00000000-0000-4000-8000-000000001802'
      and listing ->> 'availableQuantity' is null
  ),
  'public storefront RPC returns null availability for unlimited stock'
);

select is(
  jsonb_array_length(
    private.get_public_inventory_storefront('inventory-public-rpc-test')
      -> 'storefront'
      -> 'sections'
  ),
  1,
  'public storefront RPC returns published storefront sections'
);

select is(
  jsonb_array_length(
    private.get_public_inventory_storefront('inventory-public-rpc-test')
      -> 'bundles'
  ),
  1,
  'public storefront RPC returns active bundles'
);

select ok(
  private.get_inventory_checkout_by_public_token('missing-public-rpc-token') is null,
  'missing public checkout token returns null'
);

select is(
  private.get_inventory_checkout_by_public_token('inventory-public-rpc-token')
    ->> 'publicToken',
  'inventory-public-rpc-token',
  'public checkout RPC returns checkout identity'
);

select is(
  jsonb_array_length(
    private.get_inventory_checkout_by_public_token('inventory-public-rpc-token')
      -> 'lines'
  ),
  1,
  'public checkout RPC returns checkout lines'
);

select * from finish();

rollback;
