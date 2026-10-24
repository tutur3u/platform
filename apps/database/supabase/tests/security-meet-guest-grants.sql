begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.meet_together_guests'::regclass
  ),
  'meet guests keep row level security enabled'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'meet_together_guests'
      and roles && array['anon', 'authenticated', 'public']::name[]
  ),
  0,
  'meet guests have no client-role policies'
);

select ok(
  not has_table_privilege('anon', 'public.meet_together_guests', 'select'),
  'anon cannot select meet guests'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.meet_together_guests',
    'select'
  ),
  'authenticated cannot select meet guests'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.meet_together_guests',
    'insert, update, delete, truncate'
  ),
  'anon cannot write or truncate meet guests'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.meet_together_guests',
    'insert, update, delete, truncate'
  ),
  'authenticated cannot write or truncate meet guests'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.meet_together_guests',
    'select, insert, update'
  ),
  'service role keeps server access to meet guests'
);

select ok(
  not has_table_privilege('anon', 'public.meet_together_users', 'select'),
  'anon cannot select the meet participant view'
);

select ok(
  not has_table_privilege('authenticated', 'public.meet_together_users', 'select'),
  'authenticated cannot select the meet participant view'
);

set local role anon;
select throws_ok(
  'select * from public.meet_together_users',
  '42501',
  'permission denied for view meet_together_users',
  'anon participant reads are denied at runtime'
);
reset role;

set local role authenticated;
select throws_ok(
  'select * from public.meet_together_users',
  '42501',
  'permission denied for view meet_together_users',
  'authenticated participant reads are denied at runtime'
);
reset role;

select ok(
  has_table_privilege('service_role', 'public.meet_together_users', 'select'),
  'service role keeps server access to the participant view'
);

select * from finish();

rollback;
