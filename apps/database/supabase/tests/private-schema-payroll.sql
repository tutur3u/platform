begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(15);

select ok(
  to_regclass('public.payroll_runs') is null
    and to_regclass('public.payroll_run_items') is null,
  'payroll tables are no longer in the public schema'
);

select ok(
  to_regclass('private.payroll_runs') is not null
    and to_regclass('private.payroll_run_items') is not null,
  'payroll tables exist in the private schema'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'private', 'usage'),
  'client roles cannot use the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('payroll_runs'),
        ('payroll_run_items')
    ) as payroll_tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'anon',
      format('private.%I', payroll_tables.table_name),
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private payroll tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('payroll_runs'),
        ('payroll_run_items')
    ) as payroll_tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', payroll_tables.table_name),
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private payroll tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('payroll_runs'),
        ('payroll_run_items')
    ) as payroll_tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', payroll_tables.table_name),
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private payroll tables'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.payroll_runs'::regclass
  ) and (
    select relrowsecurity
    from pg_class
    where oid = 'private.payroll_run_items'::regclass
  ),
  'private payroll tables have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'payroll_runs'
      and policyname = 'Service role can manage private payroll runs'
  ),
  'private payroll runs have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'payroll_run_items'
      and policyname = 'Service role can manage private payroll run items'
  ),
  'private payroll run items have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename in ('payroll_runs', 'payroll_run_items')
      and (
        'authenticated' = any (roles)
        or 'anon' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'private payroll tables have no client-role policies'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'payroll_run_items_run_id_fkey'
      and conrelid = 'private.payroll_run_items'::regclass
      and confrelid = 'private.payroll_runs'::regclass
  ),
  'private payroll items still reference private payroll runs'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'payroll_runs_ws_id_fkey'
      and conrelid = 'private.payroll_runs'::regclass
      and confrelid = 'public.workspaces'::regclass
  ),
  'private payroll runs still reference public workspaces'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'payroll_run_items_user_id_fkey'
      and conrelid = 'private.payroll_run_items'::regclass
      and confrelid = 'public.workspace_users'::regclass
  ),
  'private payroll items still reference public workspace users'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.payroll_runs'::regclass
      and tgname = 'enforce_strict_text_field_limits'
      and not tgisinternal
  ),
  'payroll run strict text trigger moved with the table'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.payroll_run_items'::regclass
      and tgname = 'payroll_run_items_updated_at'
      and not tgisinternal
  ),
  'payroll item updated-at trigger moved with the table'
);

select * from finish();

rollback;
