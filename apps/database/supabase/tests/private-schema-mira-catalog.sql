begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(24);

select ok(
  to_regclass('public.mira_accessories') is null,
  'Mira accessories are no longer in the public schema'
);

select ok(
  to_regclass('public.mira_achievements') is null,
  'Mira achievements are no longer in the public schema'
);

select ok(
  to_regclass('private.mira_accessories') is not null,
  'Mira accessories exist in the private schema'
);

select ok(
  to_regclass('private.mira_achievements') is not null,
  'Mira achievements exist in the private schema'
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
        ('private.mira_accessories'::regclass),
        ('private.mira_achievements'::regclass)
    ) as tables(table_oid)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege('anon', tables.table_oid, privilege_name)
  ),
  'anon cannot select or mutate private Mira catalogs'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('private.mira_accessories'::regclass),
        ('private.mira_achievements'::regclass)
    ) as tables(table_oid)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      tables.table_oid,
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private Mira catalogs'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('private.mira_accessories'::regclass),
        ('private.mira_achievements'::regclass)
    ) as tables(table_oid)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      tables.table_oid,
      privilege_name
    )
  ),
  'service role can select and mutate private Mira catalogs'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.mira_accessories'::regclass
  ),
  'private Mira accessories have RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.mira_achievements'::regclass
  ),
  'private Mira achievements have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'mira_accessories'
      and policyname = 'Service role can manage private Mira accessories'
  ),
  'private Mira accessories have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'mira_achievements'
      and policyname = 'Service role can manage private Mira achievements'
  ),
  'private Mira achievements have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'mira_accessories'
      and policyname = 'mira_accessories_select'
  ),
  'old Mira accessories authenticated select policy was removed'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'mira_achievements'
      and policyname = 'mira_achievements_select'
  ),
  'old Mira achievements authenticated select policy was removed'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'mira_user_accessories_accessory_id_fkey'
      and conrelid = 'public.mira_user_accessories'::regclass
      and confrelid = 'private.mira_accessories'::regclass
  ),
  'user accessories still reference private Mira accessories'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'mira_user_achievements_achievement_id_fkey'
      and conrelid = 'public.mira_user_achievements'::regclass
      and confrelid = 'private.mira_achievements'::regclass
  ),
  'user achievements still reference private Mira achievements'
);

select ok(
  to_regclass('private.idx_mira_accessories_category') is not null,
  'Mira accessory category index moved with the private table'
);

select ok(
  to_regclass('private.idx_mira_achievements_category') is not null,
  'Mira achievement category index moved with the private table'
);

select ok(
  to_regclass('private.idx_mira_achievements_code') is not null,
  'Mira achievement code index moved with the private table'
);

select lives_ok(
  $$
  set local role service_role;

  select count(*) from private.mira_accessories;
  select count(*) from private.mira_achievements;

  reset role;
  $$,
  'service role can read private Mira catalogs'
);

select results_eq(
  $$
    select count(*)
    from pg_class cls
    join pg_namespace namespace on namespace.oid = cls.relnamespace
    where namespace.nspname = 'public'
      and cls.relkind in ('r', 'p')
      and cls.relname in ('mira_accessories', 'mira_achievements')
  $$,
  array[0::bigint],
  'no migrated Mira catalog tables remain public'
);

select results_eq(
  $$
    select count(*)
    from pg_class cls
    join pg_namespace namespace on namespace.oid = cls.relnamespace
    where namespace.nspname = 'private'
      and cls.relkind in ('r', 'p')
      and cls.relname in ('mira_accessories', 'mira_achievements')
  $$,
  array[2::bigint],
  'both Mira catalog tables are private'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'mira_achievements'
      and column_name = 'category'
      and udt_schema = 'public'
      and udt_name = 'mira_achievement_category'
  ),
  'private Mira achievements preserve public enum column type'
);

select * from finish();

rollback;
