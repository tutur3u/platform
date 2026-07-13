begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(15);

select ok(
  to_regclass('private.inventory_square_catalog_links') is not null,
  'Square catalog links are private'
);

select ok(
  to_regclass('private.inventory_square_sync_state') is not null,
  'Square sync state is private'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.inventory_square_catalog_links'::regclass),
  'Square catalog links have RLS enabled'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.inventory_square_sync_state'::regclass),
  'Square sync state has RLS enabled'
);

select ok(
  not has_table_privilege('authenticated', 'private.inventory_square_catalog_links', 'select'),
  'authenticated users cannot read Square links directly'
);

select ok(
  has_table_privilege('service_role', 'private.inventory_square_catalog_links', 'select,insert,update,delete'),
  'service role can manage Square links'
);

select ok(
  not has_table_privilege('authenticated', 'private.inventory_square_sync_state', 'select'),
  'authenticated users cannot read Square sync state directly'
);

select ok(
  has_table_privilege('service_role', 'private.inventory_square_sync_state', 'select,insert,update,delete'),
  'service role can manage Square sync state'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.expire_inventory_checkout_sessions(timestamptz,integer,uuid)',
    'execute'
  ),
  'service role can materialize expired checkout sessions'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.expire_inventory_checkout_sessions(timestamptz,integer,uuid)',
    'execute'
  ),
  'authenticated users cannot invoke checkout expiry directly'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.inventory_checkout_sessions'::regclass
      and tgname = 'expire_inventory_checkouts_before_insert'
      and not tgisinternal
  ),
  'new checkouts lazily materialize older expiry states'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and tablename = 'inventory_checkout_sessions'
      and indexname = 'inventory_checkout_sessions_reserved_expiry_idx'
      and indexdef ilike '%where (status = ''reserved''%'
  ),
  'checkout expiry uses a partial reserved-session index'
);

select ok(
  pg_get_functiondef(
    'private.expire_inventory_checkout_sessions(timestamptz,integer,uuid)'::regprocedure
  ) ilike '%for update skip locked%',
  'checkout expiry safely supports concurrent sweepers'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    join pg_class source_table on source_table.oid = constraint_row.conrelid
    join pg_class target_table on target_table.oid = constraint_row.confrelid
    join pg_namespace target_schema on target_schema.oid = target_table.relnamespace
    where source_table.oid = 'private.inventory_square_catalog_links'::regclass
      and constraint_row.contype = 'f'
      and target_schema.nspname = 'private'
      and target_table.relname = 'inventory_units'
  ),
  'Square variation links reference private inventory units'
);

select ok(
  (
    select count(*)
    from pg_trigger
    where tgrelid in (
      'private.inventory_square_catalog_links'::regclass,
      'private.inventory_square_sync_state'::regclass
    )
      and tgname in (
        'inventory_square_catalog_links_updated_at',
        'inventory_square_sync_state_updated_at'
      )
      and not tgisinternal
  ) = 2,
  'Square sync tables maintain updated timestamps'
);

select * from finish();

rollback;
