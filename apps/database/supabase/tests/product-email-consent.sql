-- Regression coverage for 20261123031000_product_email_consent.sql.
-- Product-update email is a separate, explicit, default-off opt-in recorded
-- with who, when, source surface and policy version. Decision and rules:
-- apps/docs/platform/data-protection-standard.mdx.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000009871'),
  ('00000000-0000-4000-8000-000000009872'),
  ('00000000-0000-4000-8000-000000009873');
insert into public.users(id) values
  ('00000000-0000-4000-8000-000000009871'),
  ('00000000-0000-4000-8000-000000009872'),
  ('00000000-0000-4000-8000-000000009873')
on conflict do nothing;

-- Structure: private relations, RLS on, caller-bound definers, pinned paths.
select ok(to_regclass('private.user_product_email_consent') is not null
  and to_regclass('private.user_product_email_consent_events') is not null
  and to_regclass('private.product_email_recipients') is not null,
  'consent state, audit and recipient view live in private');
select ok(to_regclass('public.user_product_email_consent') is null
  and to_regclass('public.user_product_email_consent_events') is null,
  'no consent relation is exposed in public');
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('private.user_product_email_consent'::regclass,
    'private.user_product_email_consent_events'::regclass)),
  'RLS is enabled on both tables');
select is((select pg_get_expr(d.adbin, d.adrelid)
  from pg_attrdef d join pg_attribute a
    on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'private.user_product_email_consent'::regclass
    and a.attname = 'granted'), 'false',
  'the granted column defaults to false');
select ok((select bool_and(p.prosecdef
    and p.proconfig @> array['search_path=pg_catalog, pg_temp'])
  from pg_proc p
  where p.oid in (
    'public.set_product_email_consent(boolean,text,text)'::regprocedure,
    'public.get_product_email_consent()'::regprocedure,
    'public.list_product_email_consent_events(integer)'::regprocedure)),
  'all three RPCs are SECURITY DEFINER with an explicit search_path');
select ok((select c.reloptions @> array['security_invoker=true']
  from pg_class c where c.oid = 'private.product_email_recipients'::regclass),
  'the recipient view runs with the caller privileges');

-- Privileges: anon and PUBLIC never execute; only authenticated does.
select ok(not has_function_privilege('anon',
    'public.set_product_email_consent(boolean,text,text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.get_product_email_consent()', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.list_product_email_consent_events(integer)', 'EXECUTE'),
  'anon cannot execute any consent RPC');
select ok(not exists (
  select 1 from pg_proc p,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('set_product_email_consent', 'get_product_email_consent',
      'list_product_email_consent_events')
    and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'PUBLIC has no EXECUTE on any consent RPC');
select ok(has_function_privilege('authenticated',
    'public.set_product_email_consent(boolean,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.get_product_email_consent()', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.list_product_email_consent_events(integer)', 'EXECUTE'),
  'authenticated can execute every consent RPC');
select ok(not has_function_privilege('service_role',
    'public.set_product_email_consent(boolean,text,text)', 'EXECUTE'),
  'service_role cannot execute the write RPC');
select ok(not exists (
  select 1 from unnest(array['anon', 'authenticated']) r(role_name)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p(priv)
  cross join unnest(array['private.user_product_email_consent',
    'private.user_product_email_consent_events',
    'private.product_email_recipients']) t(rel)
  where has_table_privilege(r.role_name, t.rel, p.priv)),
  'client roles have no direct table or view privilege');
select ok(not exists (
  select 1 from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p(priv)
  cross join unnest(array['private.user_product_email_consent',
    'private.user_product_email_consent_events']) t(rel)
  where has_table_privilege('service_role', t.rel, p.priv))
  and has_table_privilege('service_role',
    'private.user_product_email_consent', 'SELECT')
  and has_table_privilege('service_role',
    'private.product_email_recipients', 'SELECT'),
  'service_role may only read consent state, never write it directly');

-- Anonymous callers are refused at the privilege layer.
set local role anon;
select throws_ok(
  $$select * from public.set_product_email_consent(true, 'web_onboarding', 'v1')$$,
  '42501', null, 'anon cannot grant consent');
select throws_ok($$select * from public.get_product_email_consent()$$,
  '42501', null, 'anon cannot read consent');
reset role;

-- A signed-in role without a user identity is rejected inside the RPC.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select * from public.set_product_email_consent(true, 'web_onboarding', 'v1')$$,
  '42501', 'authentication required', 'no auth.uid() is rejected');
reset role;

-- User A: default off.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009871","role":"authenticated"}', true);
select is((select granted from public.get_product_email_consent()), false,
  'a user who never decided is reported as not consenting');
select is((select source from public.get_product_email_consent()), null::text,
  'a never-decided user has no source');
reset role;
select is((select count(*)::integer from private.user_product_email_consent
  where user_id = '00000000-0000-4000-8000-000000009871'), 0,
  'reading consent does not create a row');
select is((select count(*)::integer from private.product_email_recipients
  where user_id = '00000000-0000-4000-8000-000000009871'), 0,
  'a user without a decision is excluded from product email');
-- Live send rule: marketing email needs the audited consent. Missing row = off.
select is(public.should_send_notification('00000000-0000-4000-8000-000000009871', 'marketing_communications', 'email', 'user', null), false,
  'a missing consent row blocks marketing email');

-- Validation: bad source, version or decision never writes anything.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009871","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.set_product_email_consent(true, 'email_link', 'v1')$$,
  '22023', 'invalid consent source', 'an unknown source is rejected');
select throws_ok(
  $$select * from public.set_product_email_consent(true, null, 'v1')$$,
  '22023', 'invalid consent source', 'a null source is rejected');
select throws_ok(
  $$select * from public.set_product_email_consent(true, 'web_onboarding', '')$$,
  '22023', 'invalid policy version', 'an empty policy version is rejected');
select throws_ok(
  $$select * from public.set_product_email_consent(true, 'web_onboarding', 'v 1; drop')$$,
  '22023', 'invalid policy version', 'a malformed policy version is rejected');
select throws_ok(
  $$select * from public.set_product_email_consent(true, 'web_onboarding', repeat('a', 65))$$,
  '22023', 'invalid policy version', 'an over-long policy version is rejected');
select throws_ok(
  $$select * from public.set_product_email_consent(true, 'web_onboarding', null)$$,
  '22023', 'invalid policy version', 'a null policy version is rejected');
select throws_ok(
  $$select * from public.set_product_email_consent(null, 'web_onboarding', 'v1')$$,
  '22023', 'consent decision is required', 'a null decision is rejected');
reset role;
select is((select count(*)::integer from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009871'), 0,
  'rejected calls append no audit row');

-- Grant: state, audit and recipient list agree.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009871","role":"authenticated"}', true);
select is((select granted from public.set_product_email_consent(
  true, 'web_onboarding', '2026-11-23')), true, 'the user can grant consent');
reset role;
select is((select count(*)::integer from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009871'), 1,
  'the grant appends exactly one audit row');
select is((select source || '/' || policy_version || '/' || granted::text
  from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009871'),
  'web_onboarding/2026-11-23/true', 'the audit row records source, version and decision');
select ok((select actor_id is null and created_at is not null
  from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009871'),
  'a self action leaves actor_id null and is timestamped');
select ok((select granted and granted_at is not null and withdrawn_at is null
  from private.user_product_email_consent
  where user_id = '00000000-0000-4000-8000-000000009871'),
  'the state row shows an active grant');
select is((select count(*)::integer from private.product_email_recipients
  where user_id = '00000000-0000-4000-8000-000000009871'), 1,
  'a granted user is eligible for product email');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009871', 'marketing_communications', 'email', 'user', null), true,
  'a granted consent allows marketing email');

-- A repeated identical decision adds no evidence; a new version does.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009871","role":"authenticated"}', true);
select is((select granted from public.set_product_email_consent(
  true, 'web_settings', '2026-11-23')), true, 'an identical repeat is accepted');
reset role;
select is((select count(*)::integer from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009871'), 1,
  'an identical repeat appends no audit row');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009871","role":"authenticated"}', true);
select is((select policy_version from public.set_product_email_consent(
  true, 'web_settings', '2026-12-01')), '2026-12-01',
  're-affirming under a new policy version is accepted');
reset role;
select is((select count(*)::integer from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009871'), 2,
  'a new policy version appends an audit row');

-- Withdraw from settings: excluded again, grant evidence retained.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009871","role":"authenticated"}', true);
select is((select granted from public.set_product_email_consent(
  false, 'mobile_settings', '2026-12-01')), false, 'the user can withdraw consent');
reset role;
select is((select count(*)::integer from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009871'), 3,
  'the withdrawal appends an audit row');
select ok((select not granted and granted_at is not null and withdrawn_at is not null
    and source = 'mobile_settings'
  from private.user_product_email_consent
  where user_id = '00000000-0000-4000-8000-000000009871'),
  'the state row shows the withdrawal and keeps the earlier grant time');
select is((select count(*)::integer from private.product_email_recipients
  where user_id = '00000000-0000-4000-8000-000000009871'), 0,
  'a withdrawn user is excluded from product email');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009871', 'marketing_communications', 'email', 'user', null), false,
  'a withdrawn consent blocks marketing email');

-- Re-grant, then the user reads their own history newest first.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009871","role":"authenticated"}', true);
select is((select granted from public.set_product_email_consent(
  true, 'mobile_onboarding', '2026-12-01')), true, 'the user can grant again');
select is((select count(*)::integer from public.list_product_email_consent_events()), 4,
  'the user reads all four of their own audit rows');
select is((select source from public.list_product_email_consent_events(1)),
  'mobile_onboarding', 'the audit list is newest first and honours the limit');
select is((select count(*)::integer from public.list_product_email_consent_events(0)), 1,
  'a non-positive limit is clamped to one row');
reset role;
select is((select count(*)::integer from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009871'), 4,
  'four decisions, four audit rows');

-- User B cannot read or change user A.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009872","role":"authenticated"}', true);
select is((select granted from public.get_product_email_consent()), false,
  'another user reads only their own default, not A''s grant');
select is((select count(*)::integer from public.list_product_email_consent_events()), 0,
  'another user sees none of A''s audit rows');
select is((select granted from public.set_product_email_consent(
  false, 'web_settings', '2026-12-01')), false, 'B records their own decision');
reset role;
select ok((select granted from private.user_product_email_consent
  where user_id = '00000000-0000-4000-8000-000000009871'),
  'B''s decision leaves A''s consent untouched');
select is((select count(*)::integer from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009872'), 1,
  'B''s decision writes B''s own audit row');

-- should_send_notification: only marketing email changed.
select is(public.should_send_notification('00000000-0000-4000-8000-000000009871', 'marketing_communications', 'email', 'user', null), true,
  're-granted consent allows marketing email again');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009872', 'marketing_communications', 'email', 'user', null), false,
  'a user who declined stays blocked');
select ok(public.should_send_notification('00000000-0000-4000-8000-000000009871', 'marketing_communications', 'email', 'workspace',
  '00000000-0000-4000-8000-000000009899') and not public.should_send_notification('00000000-0000-4000-8000-000000009872',
  'marketing_communications', 'email', 'workspace', '00000000-0000-4000-8000-000000009899'),
  'the workspace scope cannot bypass or replace the consent');
insert into public.notification_preferences (user_id, event_type, channel, enabled, scope)
values ('00000000-0000-4000-8000-000000009872', 'marketing_communications', 'email', true, 'user'),
  ('00000000-0000-4000-8000-000000009871', 'marketing_communications', 'email', false, 'user'),
  ('00000000-0000-4000-8000-000000009871', 'task_assigned', 'email', false, 'user');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009872', 'marketing_communications', 'email', 'user', null), false,
  'an old enabled preference cannot turn marketing email on');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009871', 'marketing_communications', 'email', 'user', null), true,
  'the consent, not an old preference row, decides marketing email');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009871', 'task_assigned', 'email', 'user', null), false,
  'other types still honour an explicit email opt-out');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009872', 'task_assigned', 'email', 'user', null), true,
  'other types still default to enabled for email');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009872', 'workspace_activity', 'email', 'user', null), true,
  'other event types are unchanged on email');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009872', 'marketing_communications', 'web', 'user', null), true,
  'marketing_communications on the web channel is unchanged');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009872', 'marketing_communications', 'push', 'user', null), true,
  'marketing_communications on the push channel is unchanged');
select is(public.should_send_notification('00000000-0000-4000-8000-000000009872', 'topic_due_soon', 'email', 'user', null), false,
  'the deadline notice types still never use email');
select ok((select p.prosecdef and p.proconfig @> array['search_path=pg_catalog, pg_temp']
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  from pg_proc p where p.oid = 'public.should_send_notification(uuid,text,text,public.notification_scope,uuid)'::regprocedure),
  'should_send_notification keeps security definer, a pinned path and service-only EXECUTE');

-- No direct table access for any signed-in client.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009871","role":"authenticated"}', true);
select throws_ok($$select * from private.user_product_email_consent$$,
  '42501', null, 'authenticated cannot read the state table directly');
select throws_ok($$select * from private.user_product_email_consent_events$$,
  '42501', null, 'authenticated cannot read the audit table directly');
select throws_ok($$insert into private.user_product_email_consent
  (user_id, granted, source, policy_version, granted_at)
  values ('00000000-0000-4000-8000-000000009871', true, 'web_settings', 'v1', now())$$,
  '42501', null, 'authenticated cannot insert state directly');
select throws_ok($$update private.user_product_email_consent set granted = true$$,
  '42501', null, 'authenticated cannot update state directly');
select throws_ok($$delete from private.user_product_email_consent_events$$,
  '42501', null, 'authenticated cannot delete audit rows');
reset role;
set local role service_role;
select throws_ok($$insert into private.user_product_email_consent
  (user_id, granted, source, policy_version, granted_at)
  values ('00000000-0000-4000-8000-000000009873', true, 'web_settings', 'v1', now())$$,
  '42501', null, 'service_role cannot write state directly either');
select lives_ok($$select user_id from private.product_email_recipients$$,
  'service_role can read the recipient view');
reset role;

-- The audit is append-only for every role, including privileged ones.
select throws_ok($$update private.user_product_email_consent_events
  set granted = not granted$$, '55000', 'Product email consent evidence is append-only',
  'audit rows cannot be updated');
select throws_ok($$insert into private.user_product_email_consent
  (user_id, granted, source, policy_version)
  values ('00000000-0000-4000-8000-000000009873', true, 'web_settings', 'v1')$$,
  '23514', null, 'a grant without a grant time is rejected by CHECK');
select throws_ok($$insert into private.user_product_email_consent
  (user_id, source, policy_version)
  values ('00000000-0000-4000-8000-000000009873', 'newsletter_form', 'v1')$$,
  '23514', null, 'the source CHECK rejects an unknown surface');

-- Erasure removes both the state and the evidence.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009873","role":"authenticated"}', true);
select is((select granted from public.set_product_email_consent(
  true, 'web_onboarding', '2026-11-23')), true, 'user C grants consent');
reset role;
select set_config('request.jwt.claims', '{}', true);
delete from auth.users where id = '00000000-0000-4000-8000-000000009873';
delete from public.workspaces
  where personal and creator_id = '00000000-0000-4000-8000-000000009873';
delete from public.users where id = '00000000-0000-4000-8000-000000009873';
select is((select count(*)::integer from private.user_product_email_consent
  where user_id = '00000000-0000-4000-8000-000000009873')
  + (select count(*)::integer from private.user_product_email_consent_events
  where user_id = '00000000-0000-4000-8000-000000009873'), 0,
  'erasing the account removes its consent state and audit rows');

select * from finish();
rollback;
