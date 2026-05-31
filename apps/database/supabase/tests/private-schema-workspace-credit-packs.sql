begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(14);

select ok(
  to_regclass('public.workspace_credit_packs') is null,
  'workspace credit packs are absent from public'
);

select ok(
  to_regclass('private.workspace_credit_packs') is not null,
  'workspace credit packs exist in private'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_credit_packs'::regclass
  ),
  'private workspace credit packs have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_credit_packs'
      and policyname = 'Service role can manage private workspace credit packs'
      and roles = array['service_role'::name]
      and cmd = 'ALL'
  ),
  'private workspace credit packs have a service-role policy'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    where has_table_privilege(
      roles.role_name,
      'private.workspace_credit_packs',
      privileges.privilege_name
    )
  ),
  'anon and authenticated cannot select or mutate private workspace credit packs'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      'private.workspace_credit_packs',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private workspace credit packs'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'workspace_orders_credit_pack_id_fkey'
      and constraint_row.conrelid = 'public.workspace_orders'::regclass
      and constraint_row.confrelid = 'private.workspace_credit_packs'::regclass
  ),
  'workspace orders reference private credit packs'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'workspace_credit_pack_purchases_credit_pack_id_fkey'
      and constraint_row.conrelid = 'public.workspace_credit_pack_purchases'::regclass
      and constraint_row.confrelid = 'private.workspace_credit_packs'::regclass
  ),
  'workspace credit pack purchases reference private credit packs'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and tablename = 'workspace_credit_packs'
      and indexname = 'workspace_credit_packs_pkey'
  ),
  'private workspace credit packs retain their primary key index'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and tablename = 'workspace_credit_packs'
      and indexname = 'idx_workspace_credit_packs_archived'
  ),
  'private workspace credit packs retain their archived index'
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
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_credit_packs'
      and policyname in (
        'allow view for credit packs',
        'allow platform admin to insert credit packs',
        'allow platform admin to update credit packs'
      )
  ),
  'old public credit-pack policies were removed'
);

select ok(
  not exists (
    select 1
    from pg_class cls
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = 'workspace_credit_packs'
      and cls.relkind in ('r', 'p', 'v', 'm')
  ),
  'no public workspace credit pack relation remains'
);

select * from finish();

rollback;
