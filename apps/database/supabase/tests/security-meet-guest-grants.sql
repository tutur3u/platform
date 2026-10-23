begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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

select * from finish();

rollback;
