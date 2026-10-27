begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(31);

-- Two users; A has a current and an older session, B has one session.
insert into auth.users (id)
values
  ('00000000-0000-4000-8000-00000000a501'),
  ('00000000-0000-4000-8000-00000000a502');

insert into auth.sessions (id, user_id, created_at, updated_at, user_agent, ip)
values
  ('00000000-0000-4000-8000-00000000a511', '00000000-0000-4000-8000-00000000a501',
    now() - interval '2 hours', now(), 'ua-a-current', '10.0.0.1'),
  ('00000000-0000-4000-8000-00000000a512', '00000000-0000-4000-8000-00000000a501',
    now() - interval '3 days', now() - interval '2 days', 'ua-a-old', '10.0.0.2'),
  ('00000000-0000-4000-8000-00000000a513', '00000000-0000-4000-8000-00000000a501',
    now() - interval '4 days', now() - interval '3 days', 'ua-a-older', '10.0.0.3'),
  ('00000000-0000-4000-8000-00000000a521', '00000000-0000-4000-8000-00000000a502',
    now() - interval '1 day', now(), 'ua-b', '10.0.0.4'),
  ('00000000-0000-4000-8000-00000000a522', '00000000-0000-4000-8000-00000000a502',
    now() - interval '1 day', now(), 'ua-b-2', '10.0.0.5');

create temp table session_fns (signature regprocedure) on commit drop;
insert into session_fns
values
  ('public.get_user_sessions(uuid)'),
  ('public.revoke_user_session(uuid,text)'),
  ('public.revoke_all_other_sessions(uuid)'),
  ('public.get_user_session_stats(uuid)');

-- Privileges and definer settings.
select is(
  (select count(*)::integer from session_fns f
    where has_function_privilege('anon', f.signature, 'execute')),
  0,
  'anon cannot execute any session function'
);
select is(
  (select count(*)::integer from session_fns f
    join pg_proc p on p.oid = f.signature
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0),
  0,
  'PUBLIC has no grant on any session function'
);
select is(
  (select count(*)::integer from session_fns f
    where has_function_privilege('authenticated', f.signature, 'execute')),
  4,
  'authenticated can execute every session function'
);
select is(
  (select count(*)::integer from session_fns f
    where has_function_privilege('service_role', f.signature, 'execute')),
  4,
  'service_role can execute every session function'
);
select is(
  (select count(*)::integer from session_fns f
    join pg_proc p on p.oid = f.signature
    where p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, pg_temp']),
  4,
  'every session function is a definer with a pinned catalog-only search_path'
);

-- Anonymous callers are denied at the privilege layer.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.get_user_sessions('00000000-0000-4000-8000-00000000a502')$$,
  '42501', null::text, 'anon cannot list sessions'
);
select throws_ok(
  $$select public.revoke_user_session('00000000-0000-4000-8000-00000000a502', '00000000-0000-4000-8000-00000000a521')$$,
  '42501', null::text, 'anon cannot revoke a session'
);
select throws_ok(
  $$select public.revoke_all_other_sessions('00000000-0000-4000-8000-00000000a502')$$,
  '42501', null::text, 'anon cannot revoke all sessions'
);
select throws_ok(
  $$select * from public.get_user_session_stats('00000000-0000-4000-8000-00000000a502')$$,
  '42501', null::text, 'anon cannot read session stats'
);
reset role;

-- A caller without a subject is denied by the guard itself.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select * from public.get_user_sessions('00000000-0000-4000-8000-00000000a502')$$,
  '42501', 'Unauthorized access to sessions', 'missing subject cannot list sessions'
);
select throws_ok(
  $$select public.revoke_user_session('00000000-0000-4000-8000-00000000a502', '00000000-0000-4000-8000-00000000a521')$$,
  '42501', 'Unauthorized access to sessions', 'missing subject cannot revoke a session'
);
select throws_ok(
  $$select public.revoke_all_other_sessions('00000000-0000-4000-8000-00000000a502')$$,
  '42501', 'Unauthorized access to sessions', 'missing subject cannot revoke all sessions'
);
select throws_ok(
  $$select * from public.get_user_session_stats('00000000-0000-4000-8000-00000000a502')$$,
  '42501', 'Unauthorized access to session stats', 'missing subject cannot read session stats'
);
reset role;

-- An authenticated user cannot act on another user's sessions.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-4000-8000-00000000a501',
  'role', 'authenticated',
  'session_id', '00000000-0000-4000-8000-00000000a511')::text, true);
select throws_ok(
  $$select * from public.get_user_sessions('00000000-0000-4000-8000-00000000a502')$$,
  '42501', 'Unauthorized access to sessions', 'other user cannot list sessions'
);
select throws_ok(
  $$select public.revoke_user_session('00000000-0000-4000-8000-00000000a502', '00000000-0000-4000-8000-00000000a521')$$,
  '42501', 'Unauthorized access to sessions', 'other user cannot revoke a session'
);
select throws_ok(
  $$select public.revoke_all_other_sessions('00000000-0000-4000-8000-00000000a502')$$,
  '42501', 'Unauthorized access to sessions', 'other user cannot revoke all sessions'
);
select throws_ok(
  $$select * from public.get_user_session_stats('00000000-0000-4000-8000-00000000a502')$$,
  '42501', 'Unauthorized access to session stats', 'other user cannot read session stats'
);
-- Passing one's own id cannot reach another user's session.
select throws_ok(
  $$select public.revoke_user_session('00000000-0000-4000-8000-00000000a501', '00000000-0000-4000-8000-00000000a521')$$,
  'P0001', 'Session not found or unauthorized', 'self id cannot revoke a foreign session'
);
reset role;

select is(
  (select count(*)::integer from auth.sessions
    where user_id in ('00000000-0000-4000-8000-00000000a501',
      '00000000-0000-4000-8000-00000000a502')),
  5,
  'denied calls leave every session intact'
);

-- The authenticated user can manage their own sessions.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-4000-8000-00000000a501',
  'role', 'authenticated',
  'session_id', '00000000-0000-4000-8000-00000000a511')::text, true);
select is(
  (select count(*)::integer from public.get_user_sessions('00000000-0000-4000-8000-00000000a501')),
  3,
  'self lists own sessions'
);
select results_eq(
  $$select session_id, user_agent, ip, is_current
    from public.get_user_sessions('00000000-0000-4000-8000-00000000a501')$$,
  $$values
    ('00000000-0000-4000-8000-00000000a511'::text, 'ua-a-current'::text, '10.0.0.1/32'::text, true),
    ('00000000-0000-4000-8000-00000000a512', 'ua-a-old', '10.0.0.2/32', false),
    ('00000000-0000-4000-8000-00000000a513', 'ua-a-older', '10.0.0.3/32', false)$$,
  'self session rows keep their shape, order and current marker'
);
select results_eq(
  $$select total_sessions, active_sessions, current_session_age > interval '1 hour'
    from public.get_user_session_stats('00000000-0000-4000-8000-00000000a501')$$,
  $$values (3, 1, true)$$,
  'self reads own session stats'
);
select is(
  public.revoke_user_session('00000000-0000-4000-8000-00000000a501', '00000000-0000-4000-8000-00000000a513'),
  true,
  'self revokes one own session'
);
select is(
  public.revoke_all_other_sessions('00000000-0000-4000-8000-00000000a501'),
  1,
  'self revokes all other own sessions'
);
select results_eq(
  $$select session_id, is_current
    from public.get_user_sessions('00000000-0000-4000-8000-00000000a501')$$,
  $$values ('00000000-0000-4000-8000-00000000a511'::text, true)$$,
  'the current session survives revoke-all-other'
);
reset role;

select is(
  (select count(*)::integer from auth.sessions
    where user_id = '00000000-0000-4000-8000-00000000a502'),
  2,
  'self revokes never touch another user'
);

-- The service role keeps its administrative access.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select count(*)::integer from public.get_user_sessions('00000000-0000-4000-8000-00000000a502')),
  2,
  'service_role lists a user''s sessions'
);
select results_eq(
  $$select total_sessions, active_sessions
    from public.get_user_session_stats('00000000-0000-4000-8000-00000000a502')$$,
  $$values (2, 2)$$,
  'service_role reads a user''s session stats'
);
select is(
  public.revoke_user_session('00000000-0000-4000-8000-00000000a502', '00000000-0000-4000-8000-00000000a522'),
  true,
  'service_role revokes a user''s session'
);
select is(
  public.revoke_all_other_sessions('00000000-0000-4000-8000-00000000a502'),
  1,
  'service_role revokes all of a user''s sessions'
);
reset role;

select is(
  (select count(*)::integer from auth.sessions
    where user_id = '00000000-0000-4000-8000-00000000a502'),
  0,
  'service_role revocations applied'
);

select * from finish();
rollback;
