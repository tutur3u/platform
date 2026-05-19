begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(12);

select ok(
  to_regclass('public.timezones') is null,
  'timezones is no longer in the public schema'
);

select ok(
  to_regclass('private.timezones') is not null,
  'timezones exists in the private schema'
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
  not has_table_privilege('anon', 'private.timezones', 'select'),
  'anon cannot select private timezones'
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
    where has_table_privilege(
      'authenticated',
      'private.timezones',
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private timezones'
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
      'private.timezones',
      privilege_name
    )
  ),
  'service role can select and mutate private timezones'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.timezones'::regclass),
  'private timezones have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'timezones'
      and policyname = 'Service role can manage private timezones'
  ),
  'private timezones have service-role RLS policy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'timezones_pkey'
      and conrelid = 'private.timezones'::regclass
  ),
  'private timezones retain primary key'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'timezones_value_key'
      and conrelid = 'private.timezones'::regclass
  ),
  'private timezones retain value uniqueness'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'timezones_text_key'
      and conrelid = 'private.timezones'::regclass
  ),
  'private timezones retain text uniqueness'
);

select * from finish();

rollback;
