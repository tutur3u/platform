begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(7);

select ok(
  to_regclass('public.inventory_storefronts') is null,
  'inventory storefronts are not exposed in the public schema'
);

select ok(
  to_regclass('private.inventory_storefronts') is not null,
  'inventory storefronts are created in the private schema'
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
