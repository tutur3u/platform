begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(14);

select ok(
  to_regclass('private.inventory_sales_periods') is not null,
  'inventory sales periods exist in private'
);

select ok(
  to_regclass('private.inventory_sales_period_assignments') is not null,
  'inventory sales period assignments exist in private'
);

select ok(
  to_regclass('public.inventory_sales_periods') is null
    and to_regclass('public.inventory_sales_period_assignments') is null,
  'inventory sales period data is absent from public'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.inventory_sales_periods'::regclass
  ),
  'inventory sales periods have RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.inventory_sales_period_assignments'::regclass
  ),
  'inventory sales period assignments have RLS enabled'
);

select ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as roles(role_name)
    cross join (values ('select'), ('insert'), ('update'), ('delete'))
      as privileges(privilege_name)
    where has_table_privilege(
      roles.role_name,
      'private.inventory_sales_periods',
      privileges.privilege_name
    )
  ),
  'client roles cannot access inventory sales periods directly'
);

select ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as roles(role_name)
    cross join (values ('select'), ('insert'), ('update'), ('delete'))
      as privileges(privilege_name)
    where has_table_privilege(
      roles.role_name,
      'private.inventory_sales_period_assignments',
      privileges.privilege_name
    )
  ),
  'client roles cannot access inventory sales period assignments directly'
);

select ok(
  not exists (
    select 1
    from (values ('select'), ('insert'), ('update'), ('delete'))
      as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      'private.inventory_sales_periods',
      privileges.privilege_name
    )
  ),
  'service role can manage inventory sales periods'
);

select ok(
  not exists (
    select 1
    from (values ('select'), ('insert'), ('update'), ('delete'))
      as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      'private.inventory_sales_period_assignments',
      privileges.privilege_name
    )
  ),
  'service role can manage inventory sales period assignments'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'inventory_sales_period_assignments_period_fkey'
      and conrelid = 'private.inventory_sales_period_assignments'::regclass
      and confrelid = 'private.inventory_sales_periods'::regclass
  ),
  'assignments reference a period in the same workspace'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'private.inventory_sales_period_assignments'::regclass
      and contype = 'p'
  ),
  'each sale source can have only one period assignment per workspace'
);

select ok(
  to_regprocedure(
    'private.list_inventory_sales_for_period(uuid,uuid,integer,integer)'
  ) is not null,
  'period-filtered mixed-source sales RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.list_inventory_sales_for_period(uuid,uuid,integer,integer)',
    'execute'
  ),
  'service role can execute the period-filtered sales RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.list_inventory_sales_for_period(uuid,uuid,integer,integer)',
    'execute'
  ),
  'authenticated clients cannot execute the period-filtered sales RPC'
);

select * from finish();

rollback;
