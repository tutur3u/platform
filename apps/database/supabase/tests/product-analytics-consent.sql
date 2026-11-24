-- Regression coverage for 20261124095000_product_analytics_consent.sql.
-- The cookie banner's Analytics choice is stored per user through caller-bound
-- RPCs, and the daily product analytics rollup counts a person only under the
-- active basis: 'consent' (default, affirmative grants only) or 'opt_out'
-- (everyone except withdrawals). Decision: apps/docs/platform/
-- data-protection-standard.mdx, "Product analytics consent". Synthetic rows.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';
select no_plan();

insert into auth.users(id, created_at) values
  ('00000000-0000-4000-8000-000000009a01', now()),
  ('00000000-0000-4000-8000-000000009a02', now()),
  ('00000000-0000-4000-8000-000000009a03', now()),
  ('00000000-0000-4000-8000-000000009a04', now());
insert into public.users(id) values
  ('00000000-0000-4000-8000-000000009a01'),
  ('00000000-0000-4000-8000-000000009a02'),
  ('00000000-0000-4000-8000-000000009a03'),
  ('00000000-0000-4000-8000-000000009a04')
on conflict do nothing;

-- Structure and privileges.
select ok(to_regclass('private.user_product_analytics_consent') is not null
  and to_regclass('private.user_product_analytics_consent_events') is not null
  and to_regclass('private.product_analytics_consent_control') is not null,
  'consent state, audit and control live in private');
select is((select basis from private.product_analytics_consent_control where id),
  'consent', 'the basis starts at affirmative consent');
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('private.user_product_analytics_consent'::regclass,
    'private.user_product_analytics_consent_events'::regclass,
    'private.product_analytics_consent_control'::regclass)),
  'RLS is enabled on every table');
select ok((select bool_and(p.prosecdef
    and p.proconfig @> array['search_path=pg_catalog, pg_temp'])
  from pg_proc p
  where p.oid in (
    'public.set_product_analytics_consent(boolean,text,text)'::regprocedure,
    'public.get_product_analytics_consent()'::regprocedure)),
  'both RPCs are SECURITY DEFINER with an explicit search_path');
select ok(not has_function_privilege('anon',
    'public.set_product_analytics_consent(boolean,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_product_analytics_consent()', 'EXECUTE')
  and not has_function_privilege('public', 'public.set_product_analytics_consent(boolean,text,text)', 'EXECUTE'),
  'anon and PUBLIC cannot execute the RPCs');
select ok(not has_function_privilege('public', 'public.get_product_analytics_consent()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.set_product_analytics_consent(boolean,text,text)', 'EXECUTE'),
  'PUBLIC cannot read and the service role cannot use the caller-bound write');
select ok(has_function_privilege('service_role',
    'private.record_product_analytics_consent(uuid,boolean,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'private.record_product_analytics_consent(uuid,boolean,text,text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'private.record_product_analytics_consent(uuid,boolean,text,text)', 'EXECUTE'),
  'only the service role records a decision for a verified user id');
select ok((select p.prosecdef and p.proconfig @> array['search_path=pg_catalog, pg_temp']
  from pg_proc p
  where p.oid = 'private.record_product_analytics_consent(uuid,boolean,text,text)'::regprocedure),
  'the service write is SECURITY DEFINER with an explicit search_path');
select ok(has_function_privilege('authenticated',
    'public.set_product_analytics_consent(boolean,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_product_analytics_consent()', 'EXECUTE'),
  'authenticated executes both RPCs');
select ok(not has_table_privilege('authenticated', 'private.user_product_analytics_consent', 'select')
  and not has_table_privilege('authenticated', 'private.user_product_analytics_consent', 'insert')
  and not has_table_privilege('service_role', 'private.user_product_analytics_consent', 'update')
  and not has_table_privilege('service_role', 'private.product_analytics_consent_control', 'update')
  and not has_function_privilege('authenticated', 'private.product_analytics_counted(uuid,boolean)', 'EXECUTE'),
  'clients and the service role cannot write consent or the basis directly');

-- The pure filter.
select ok(not private.product_analytics_counted('00000000-0000-4000-8000-000000009a01', false),
  'no decision is not counted under the consent basis');
select ok(private.product_analytics_counted('00000000-0000-4000-8000-000000009a01', true),
  'no decision is counted under the opt_out basis');
select ok(not private.product_analytics_counted(null, false)
  and private.product_analytics_counted(null, true),
  'an unknown person counts only under opt_out');

-- Anonymous callers are refused.
set local role anon;
select throws_ok($$select * from public.set_product_analytics_consent(true, 'web_banner', '2026-11-24')$$,
  '42501', null, 'anon cannot write a decision');
reset role;

-- User 1 grants; user 2 withdraws; user 3 never decides.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000009a01"}', true);
select is((select granted from public.get_product_analytics_consent()), false,
  'no row reads as not granted');
select is((select granted from public.set_product_analytics_consent(true, 'web_banner', '2026-11-24')),
  true, 'a grant is stored');
select lives_ok($$select * from public.set_product_analytics_consent(true, 'web_banner', '2026-11-24')$$,
  'a repeated identical grant succeeds');
select throws_ok($$select * from public.set_product_analytics_consent(true, 'nowhere', '2026-11-24')$$,
  '22023', null, 'an unknown source is refused');
select throws_ok($$select * from public.set_product_analytics_consent(true, 'web_banner', ' bad version')$$,
  '22023', null, 'an invalid policy version is refused');
select throws_ok($$select * from public.set_product_analytics_consent(null, 'web_banner', '2026-11-24')$$,
  '22023', null, 'a null decision is refused');
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000009a02"}', true);
select * from public.set_product_analytics_consent(true, 'workspace_banner', '2026-11-24');
select is((select granted from public.set_product_analytics_consent(false, 'web_settings', '2026-11-24')),
  false, 'a withdrawal is stored');
select is((select count(*) from public.get_product_analytics_consent()), 1::bigint,
  'a user reads only their own decision');
reset role;

select is((select count(*) from private.user_product_analytics_consent_events
  where user_id = '00000000-0000-4000-8000-000000009a01'), 1::bigint,
  'an identical repeat adds no evidence');
select is((select count(*) from private.user_product_analytics_consent_events
  where user_id = '00000000-0000-4000-8000-000000009a02'), 2::bigint,
  'grant and withdrawal are both recorded');
select ok((select withdrawn_at is not null and granted_at is not null
  from private.user_product_analytics_consent
  where user_id = '00000000-0000-4000-8000-000000009a02'),
  'the withdrawal keeps the grant time');
select throws_ok($$update private.user_product_analytics_consent_events set granted = true$$,
  '55000', null, 'evidence cannot be rewritten');
select throws_ok($$delete from private.user_product_analytics_consent_events$$,
  '55000', null, 'evidence cannot be deleted directly');
select throws_ok($$truncate private.user_product_analytics_consent_events$$,
  '55000', null, 'evidence cannot be truncated');

-- The service path (Web API route, including satellite app sessions) writes
-- for the verified user id and shares the validation and audit.
select is((select granted from private.record_product_analytics_consent(
    '00000000-0000-4000-8000-000000009a03', false, 'workspace_banner', '2026-11-24')),
  false, 'the service path records a withdrawal for a user with no prior decision');
select throws_ok($$select * from private.record_product_analytics_consent(null, true, 'web_banner', '2026-11-24')$$,
  '22023', null, 'the service path requires a user id');
select throws_ok($$select * from private.record_product_analytics_consent(
    '00000000-0000-4000-8000-000000009a03', true, 'elsewhere', '2026-11-24')$$,
  '22023', null, 'the service path validates the source');

select ok(private.product_analytics_counted('00000000-0000-4000-8000-000000009a01', false)
  and not private.product_analytics_counted('00000000-0000-4000-8000-000000009a02', false)
  and not private.product_analytics_counted('00000000-0000-4000-8000-000000009a03', false),
  'consent basis: only the granted user counts');
select ok(private.product_analytics_counted('00000000-0000-4000-8000-000000009a01', true)
  and not private.product_analytics_counted('00000000-0000-4000-8000-000000009a02', true)
  and not private.product_analytics_counted('00000000-0000-4000-8000-000000009a03', true)
  and private.product_analytics_counted('00000000-0000-4000-8000-000000009a04', true),
  'opt_out basis: everyone except withdrawn users counts');

-- The rollup applies the filter. Signups are a count of accounts created
-- today; 10 granted accounts keep the cell above the suppression threshold.
insert into auth.users(id, created_at)
select ('00000000-0000-4000-8000-0000000091' || lpad(g::text, 2, '0'))::uuid, now()
  from generate_series(0, 9) g;
insert into public.users(id)
select ('00000000-0000-4000-8000-0000000091' || lpad(g::text, 2, '0'))::uuid
  from generate_series(0, 9) g
on conflict do nothing;
insert into private.user_product_analytics_consent (user_id, granted, source, policy_version, granted_at)
select ('00000000-0000-4000-8000-0000000091' || lpad(g::text, 2, '0'))::uuid, true,
       'web_banner', '2026-11-24', now()
  from generate_series(0, 9) g;

create temporary table expected_signups as
select count(*) filter (where private.product_analytics_counted(u.id, false)) as consented,
       count(*) filter (where private.product_analytics_counted(u.id, true)) as opted_out
  from auth.users u
 where u.created_at >= ((now() at time zone 'utc')::date)::timestamp at time zone 'utc';

select lives_ok($$select private.rollup_product_analytics_daily(1000)$$,
  'the rollup runs under the consent basis');
select is((select value from private.product_analytics_daily
  where day = (now() at time zone 'utc')::date and app = 'platform'
    and metric = 'signups' and dimension = ''),
  (select consented::double precision from expected_signups),
  'consent basis: signups count only granted accounts');

update private.product_analytics_consent_control set basis = 'opt_out' where id;
select lives_ok($$select private.rollup_product_analytics_daily(1000)$$,
  'the rollup runs under the opt_out basis');
select is((select value from private.product_analytics_daily
  where day = (now() at time zone 'utc')::date and app = 'platform'
    and metric = 'signups' and dimension = ''),
  (select opted_out::double precision from expected_signups),
  'opt_out basis: signups exclude only withdrawn accounts');
select ok((select consented < opted_out from expected_signups),
  'the two bases differ on the fixture');

-- Account erasure removes the decision and its evidence.
select set_config('request.jwt.claims', '{}', true);
delete from auth.users where id = '00000000-0000-4000-8000-000000009a02';
delete from public.workspaces where personal and creator_id = '00000000-0000-4000-8000-000000009a02';
select lives_ok($$delete from public.users where id = '00000000-0000-4000-8000-000000009a02'$$,
  'erasing the account succeeds');
select is((select count(*) from private.user_product_analytics_consent_events
  where user_id = '00000000-0000-4000-8000-000000009a02'), 0::bigint,
  'erasure cascades through the evidence');

select * from finish();
rollback;
