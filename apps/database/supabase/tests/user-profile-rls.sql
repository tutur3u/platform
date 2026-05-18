begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(21);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Enable read access for authenticated users'
      and cmd = 'SELECT'
  ),
  'public.users no longer has a broad authenticated select policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Enable read access for current user and workspace members'
      and cmd = 'SELECT'
  ),
  'public.users has a scoped authenticated select policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_private_details'
      and policyname = 'Enable read access for current user and workspace users'
      and cmd = 'SELECT'
  ),
  'public.user_private_details has a scoped authenticated select policy'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'services'
  ),
  'public.users no longer exposes services'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'timezone'
  ),
  'public.users no longer exposes timezone'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'first_day_of_week'
  ),
  'public.users no longer exposes first_day_of_week'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'time_format'
  ),
  'public.users no longer exposes time_format'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'deleted'
  ),
  'public.users no longer exposes deleted'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_private_details'
      and column_name = 'services'
  ),
  'public.user_private_details stores services'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_private_details'
      and column_name = 'timezone'
  ),
  'public.user_private_details stores timezone'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_private_details'
      and column_name = 'first_day_of_week'
  ),
  'public.user_private_details stores first_day_of_week'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_private_details'
      and column_name = 'time_format'
  ),
  'public.user_private_details stores time_format'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_private_details'
      and column_name = 'deleted'
  ),
  'public.user_private_details stores deleted'
);

set local session_replication_role = replica;

insert into public.users (id, display_name)
values
  ('00000000-0000-0000-0000-00000000f101', 'RLS Viewer'),
  ('00000000-0000-0000-0000-00000000f102', 'RLS Teammate'),
  ('00000000-0000-0000-0000-00000000f103', 'RLS Stranger')
on conflict (id) do update
set display_name = excluded.display_name;

insert into public.user_private_details (
  user_id,
  services,
  timezone,
  first_day_of_week,
  time_format,
  deleted
)
values
  (
    '00000000-0000-0000-0000-00000000f101',
    '{TUTURUUU}'::public.platform_service[],
    'Asia/Ho_Chi_Minh',
    'monday',
    '24h',
    false
  ),
  (
    '00000000-0000-0000-0000-00000000f102',
    '{TUTURUUU}'::public.platform_service[],
    'UTC',
    'sunday',
    '12h',
    false
  ),
  (
    '00000000-0000-0000-0000-00000000f103',
    '{TUTURUUU}'::public.platform_service[],
    'UTC',
    'saturday',
    'auto',
    false
  )
on conflict (user_id) do update
set
  services = excluded.services,
  timezone = excluded.timezone,
  first_day_of_week = excluded.first_day_of_week,
  time_format = excluded.time_format,
  deleted = excluded.deleted;

set local session_replication_role = origin;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-00000000f101',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  (
    select count(*)::integer
    from public.users
    where id in (
      '00000000-0000-0000-0000-00000000f101',
      '00000000-0000-0000-0000-00000000f102',
      '00000000-0000-0000-0000-00000000f103'
    )
  ),
  1,
  'authenticated users cannot enumerate unrelated public user rows'
);

select is(
  (
    select count(*)::integer
    from public.users
    where id = '00000000-0000-0000-0000-00000000f101'
  ),
  1,
  'authenticated users can read their own public user row'
);

select is(
  (
    select count(*)::integer
    from public.users
    where id = '00000000-0000-0000-0000-00000000f102'
  ),
  0,
  'authenticated users cannot read unrelated public user rows'
);

select is(
  (
    select count(*)::integer
    from public.users
    where id = '00000000-0000-0000-0000-00000000f103'
  ),
  0,
  'authenticated users cannot read unrelated public user rows'
);

select is(
  (
    select count(*)::integer
    from public.user_private_details
    where user_id in (
      '00000000-0000-0000-0000-00000000f101',
      '00000000-0000-0000-0000-00000000f102',
      '00000000-0000-0000-0000-00000000f103'
    )
  ),
  1,
  'authenticated users cannot enumerate unrelated user private details'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-00000000f103',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  (
    select count(*)::integer
    from public.users
    where id in (
      '00000000-0000-0000-0000-00000000f101',
      '00000000-0000-0000-0000-00000000f102',
      '00000000-0000-0000-0000-00000000f103'
    )
  ),
  1,
  'unrelated authenticated users cannot enumerate fixture users'
);

select is(
  (
    select count(*)::integer
    from public.user_private_details
    where user_id in (
      '00000000-0000-0000-0000-00000000f101',
      '00000000-0000-0000-0000-00000000f102',
      '00000000-0000-0000-0000-00000000f103'
    )
  ),
  1,
  'unrelated authenticated users cannot enumerate fixture user private details'
);

with updated as (
  update public.users
  set display_name = 'Blocked update'
  where id = '00000000-0000-0000-0000-00000000f101'
  returning 1
)
select is(
  (select count(*)::integer from updated),
  0,
  'shared read access does not allow updates to other user rows'
);

select * from finish();

rollback;
