begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(19);

select ok(
  not exists (
    select 1
    from (
      values
        ('currencies'),
        ('field_types'),
        ('team_members')
    ) as tables(table_name)
    where to_regclass(format('public.%I', table_name)) is not null
  ),
  'reference tables are no longer in the public schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('currencies'),
        ('field_types'),
        ('team_members')
    ) as tables(table_name)
    where to_regclass(format('private.%I', table_name)) is null
  ),
  'reference tables exist in the private schema'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('currencies'),
        ('field_types'),
        ('team_members')
    ) as tables(table_name)
    where has_table_privilege('anon', format('private.%I', table_name), 'select')
  ),
  'anon cannot select private reference tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('currencies'),
        ('field_types'),
        ('team_members')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private reference tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('currencies'),
        ('field_types'),
        ('team_members')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'service role can select and mutate private reference tables'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'currency_exchange_rates_base_currency_fkey'
      and conrelid = 'public.currency_exchange_rates'::regclass
      and confrelid = 'private.currencies'::regclass
  ),
  'currency exchange rate base currency still references private currencies'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'currency_exchange_rates_target_currency_fkey'
      and conrelid = 'public.currency_exchange_rates'::regclass
      and confrelid = 'private.currencies'::regclass
  ),
  'currency exchange rate target currency still references private currencies'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_wallets_currency_fkey'
      and conrelid = 'public.workspace_wallets'::regclass
      and confrelid = 'private.currencies'::regclass
  ),
  'workspace wallets still reference private currencies'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'public_workspace_user_fields_type_fkey'
      and conrelid = 'public.workspace_user_fields'::regclass
      and confrelid = 'private.field_types'::regclass
  ),
  'workspace user fields still reference private field types'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'project_members_user_id_fkey'
      and conrelid = 'private.team_members'::regclass
      and confrelid = 'public.users'::regclass
  ),
  'legacy team members still reference public users'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'project_members_project_id_fkey'
      and conrelid = 'private.team_members'::regclass
      and confrelid = 'public.workspace_teams'::regclass
  ),
  'legacy team members still reference workspace teams'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'currencies'
      and policyname = 'Service role can manage private currencies'
  ),
  'private currencies have service-role RLS policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'field_types'
      and policyname = 'Service role can manage private field types'
  ),
  'private field types have service-role RLS policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'team_members'
      and policyname = 'Service role can manage legacy team members'
  ),
  'private legacy team members have service-role RLS policy'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.currencies'::regclass),
  'private currencies have RLS enabled'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.field_types'::regclass),
  'private field types have RLS enabled'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.team_members'::regclass),
  'private legacy team members have RLS enabled'
);

select * from finish();

rollback;
