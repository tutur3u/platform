begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into public.users (id, display_name)
values ('10000000-0000-4000-8000-000000008001', 'Analytics test owner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '10000000-0000-4000-8000-000000008002',
  'Inventory analytics test',
  '10000000-0000-4000-8000-000000008001',
  false
);
insert into public.product_categories (id, name, ws_id)
values (
  '10000000-0000-4000-8000-000000008003',
  'Analytics category',
  '10000000-0000-4000-8000-000000008002'
);
insert into private.inventory_owners (id, name, ws_id)
values (
  '10000000-0000-4000-8000-000000008004',
  'Analytics owner',
  '10000000-0000-4000-8000-000000008002'
);
insert into public.workspace_products (
  id,
  category_id,
  name,
  owner_id,
  ws_id
)
values (
  '10000000-0000-4000-8000-000000008005',
  '10000000-0000-4000-8000-000000008003',
  'Cent price product',
  '10000000-0000-4000-8000-000000008004',
  '10000000-0000-4000-8000-000000008002'
);

select is(
  private.get_inventory_analytics(
    '10000000-0000-4000-8000-000000008002',
    30
  ) -> 'quality' ->> 'productsWithoutStock',
  '1',
  'analytics identifies products without stock'
);
select is(
  private.get_inventory_analytics(
    '10000000-0000-4000-8000-000000008002',
    30
  ) -> 'quality' ->> 'productsWithUnlimitedStock',
  '0',
  'a missing stock row is not treated as unlimited stock'
);

insert into private.inventory_units (id, name, ws_id)
values (
  '10000000-0000-4000-8000-000000008006',
  'Each',
  '10000000-0000-4000-8000-000000008002'
);
insert into private.inventory_warehouses (id, name, ws_id)
values (
  '10000000-0000-4000-8000-000000008007',
  'Front counter',
  '10000000-0000-4000-8000-000000008002'
);
insert into private.inventory_products (
  product_id,
  unit_id,
  warehouse_id,
  amount,
  price
)
values (
  '10000000-0000-4000-8000-000000008005',
  '10000000-0000-4000-8000-000000008006',
  '10000000-0000-4000-8000-000000008007',
  5,
  10.81
);
insert into private.inventory_storefronts (
  id,
  ws_id,
  slug,
  name,
  currency
)
values (
  '10000000-0000-4000-8000-000000008008',
  '10000000-0000-4000-8000-000000008002',
  'analytics-import-test',
  'Analytics import test',
  'USD'
);

select ok(
  to_regprocedure('private.get_inventory_analytics(uuid,integer,text)') is not null,
  'inventory analytics RPC exists'
);
select ok(
  to_regprocedure(
    'private.bulk_create_inventory_storefront_listings_from_stock(uuid,uuid,integer)'
  ) is not null,
  'safe storefront bulk import RPC exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'private.get_inventory_analytics(uuid,integer,text)',
    'execute'
  ),
  'service role can read inventory analytics'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_inventory_analytics(uuid,integer,text)',
    'execute'
  ),
  'authenticated clients cannot call analytics directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'private.bulk_create_inventory_storefront_listings_from_stock(uuid,uuid,integer)',
    'execute'
  ),
  'service role can run the safe storefront import'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.bulk_create_inventory_storefront_listings_from_stock(uuid,uuid,integer)',
    'execute'
  ),
  'authenticated clients cannot run bulk import directly'
);
select is(
  jsonb_typeof(private.get_inventory_analytics(gen_random_uuid(), 30)),
  'object',
  'analytics returns one coordinated object for an empty workspace'
);
select ok(
  private.get_inventory_analytics(gen_random_uuid(), 2)
    -> 'range' ->> 'days' = '7',
  'analytics clamps undersized ranges to seven days'
);
select throws_ok(
  $$select private.bulk_create_inventory_storefront_listings_from_stock(
    gen_random_uuid(),
    gen_random_uuid(),
    100
  )$$,
  'P0001',
  'Inventory storefront not found',
  'bulk import refuses an unknown storefront'
);

select is(
  private.bulk_create_inventory_storefront_listings_from_stock(
    '10000000-0000-4000-8000-000000008002',
    '10000000-0000-4000-8000-000000008008',
    100
  ) ->> 'created',
  '1',
  'bulk import creates a draft for the eligible product'
);
select is(
  (
    select price::text
    from private.inventory_storefront_listings
    where storefront_id = '10000000-0000-4000-8000-000000008008'
  ),
  '1081',
  'bulk import preserves the exact cent-level stock price'
);
select is(
  (
    select status::text
    from private.inventory_storefront_listings
    where storefront_id = '10000000-0000-4000-8000-000000008008'
  ),
  'draft',
  'bulk import keeps generated listings reviewable as drafts'
);
select is(
  private.bulk_create_inventory_storefront_listings_from_stock(
    '10000000-0000-4000-8000-000000008002',
    '10000000-0000-4000-8000-000000008008',
    100
  ) ->> 'created',
  '0',
  'repeating bulk import does not overwrite existing listings'
);
select is(
  (
    select count(*)::text
    from private.inventory_storefront_listings
    where storefront_id = '10000000-0000-4000-8000-000000008008'
  ),
  '1',
  'repeating bulk import never duplicates existing listings'
);

select * from finish();
rollback;
