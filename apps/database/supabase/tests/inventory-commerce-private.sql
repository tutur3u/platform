begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select ok(
  to_regclass('public.inventory_storefronts') is null,
  'inventory storefronts are not exposed in the public schema'
);

select ok(
  to_regclass('private.inventory_storefronts') is not null,
  'inventory storefronts are created in the private schema'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'theme_preset',
      'layout_style',
      'surface_style',
      'corner_style',
      'checkout_mode',
      'show_inventory_badges'
    ]) as required(column_name)
    where not exists (
      select 1
      from information_schema.columns c
      where table_schema = 'private'
        and table_name = 'inventory_storefronts'
        and c.column_name = required.column_name
    )
  ),
  'inventory storefront theme and checkout mode columns exist in the private schema'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'inventory_cost_profiles',
      'inventory_cost_scenarios',
      'inventory_cost_profit_shares'
    ]) as table_name
    where to_regclass(format('private.%I', table_name)) is null
  ),
  'inventory costing tables exist in the private schema'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'inventory_products',
      'inventory_suppliers',
      'inventory_units',
      'inventory_warehouses',
      'inventory_batches',
      'inventory_batch_products',
      'inventory_owners',
      'inventory_audit_logs',
      'inventory_manufacturers'
    ]) as table_name
    where to_regclass(format('public.%I', table_name)) is not null
  ),
  'core inventory data tables are not exposed in the public schema'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'inventory_products',
      'inventory_suppliers',
      'inventory_units',
      'inventory_warehouses',
      'inventory_batches',
      'inventory_batch_products',
      'inventory_owners',
      'inventory_audit_logs',
      'inventory_manufacturers'
    ]) as table_name
    where to_regclass(format('private.%I', table_name)) is null
  ),
  'core inventory data tables exist in the private schema'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select ok(
  not has_table_privilege('authenticated', 'private.inventory_storefronts', 'select'),
  'authenticated cannot select private inventory storefronts'
);

select ok(
  has_table_privilege('service_role', 'private.inventory_storefronts', 'select'),
  'service role can select private inventory storefronts'
);

select ok(
  not has_table_privilege('authenticated', 'private.inventory_products', 'select'),
  'authenticated cannot select private inventory products'
);

select ok(
  has_table_privilege('service_role', 'private.inventory_products', 'select'),
  'service role can select private inventory products'
);

select ok(
  not has_table_privilege('authenticated', 'private.inventory_cost_profiles', 'select'),
  'authenticated cannot select private inventory costing profiles'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_inventory_costing_analytics(uuid)',
    'execute'
  ),
  'service role can execute private inventory costing analytics'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_inventory_dashboard_snapshot(uuid)',
    'execute'
  ),
  'service role can execute private inventory dashboard snapshot'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_inventory_dashboard_snapshot(uuid)',
    'execute'
  ),
  'authenticated cannot execute private inventory dashboard snapshot'
);

select is(
  jsonb_typeof(private.get_inventory_dashboard_snapshot(gen_random_uuid())),
  'object',
  'inventory dashboard snapshot returns a JSON object for empty workspaces'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_inventory_checkout_session(text,jsonb,timestamptz)',
    'execute'
  ),
  'service role can create inventory checkout reservations'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_inventory_checkout_session(text,jsonb,timestamptz)',
    'execute'
  ),
  'authenticated cannot call inventory checkout reservation RPC directly'
);

select * from finish();

rollback;
