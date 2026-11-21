begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select relforcerowsecurity from pg_class where oid = 'private.qa_test_user_events'::regclass),
  'the existing QA audit uses forced RLS');
select ok(not has_table_privilege(role, 'private.qa_test_user_events', privilege),
  role || ' cannot ' || privilege || ' the audit table')
from unnest(array['anon','authenticated','service_role']) role
cross join unnest(array['INSERT','SELECT','UPDATE','DELETE','TRUNCATE']) privilege;
select is(has_function_privilege(role, 'private.accounts_purge(integer)', 'EXECUTE'),
  role = 'service_role', role || ' purge execute privilege')
from unnest(array['anon','authenticated','service_role']) role;
select ok(not has_function_privilege(role, 'private.accounts_finish_locked(private.accounts_operations,text,uuid)', 'EXECUTE'),
  role || ' cannot call the unchecked internal finish helper')
from unnest(array['anon','authenticated','service_role']) role;

select is((select count(*) from pg_trigger
  where tgrelid = 'private.qa_test_user_events'::regclass and tgname like 'accounts_audit_%' and tgenabled = 'A'),
  3::bigint, 'audit controls apply in replica mode');
select ok(not exists (select from private.qa_test_user_events where actor_kind is null or actor_user_id is null),
  'every migrated event has attributed actor fields');
select throws_ok($$insert into private.qa_test_user_events (actor, action, run_id)
values ('operator', 'session', 'unattributed')$$, '42501', 'QA audit requires an explicit actor',
  'a new operator event cannot use a historical fallback');

insert into private.accounts_operations (id, actor_kind, actor_id, action, state, created_at, target_id)
values ('90000000-0000-4000-8000-000000000001', 'human', '90000000-0000-4000-8000-000000000002',
    'test-delete', 'unknown', statement_timestamp() - interval '400 days', '90000000-0000-4000-8000-000000000099'),
  ('90000000-0000-4000-8000-000000000003', 'human', '90000000-0000-4000-8000-000000000002',
    'test-delete', 'success', statement_timestamp() - interval '400 days', null),
  ('90000000-0000-4000-8000-000000000004', 'human', '90000000-0000-4000-8000-000000000002',
    'test-create', 'intent', statement_timestamp() - interval '400 days', null),
  ('90000000-0000-4000-8000-000000000005', 'human', '90000000-0000-4000-8000-000000000002',
    'disable', 'intent', statement_timestamp() - interval '400 days', '90000000-0000-4000-8000-000000000099');

insert into private.qa_test_user_events (action, actor, actor_kind, actor_user_id, phase, occurred_at, operation_id)
select 'test-delete', 'operator', 'human', '90000000-0000-4000-8000-000000000002', phase, ts, op
from (values
  ('intent', statement_timestamp() - interval '400 days', '90000000-0000-4000-8000-000000000001'::uuid),
  ('success', statement_timestamp() - interval '400 days', '90000000-0000-4000-8000-000000000003'::uuid),
  ('denied', statement_timestamp() - interval '92 days', '90000000-0000-4000-8000-000000000001'::uuid),
  ('denied', statement_timestamp() - interval '89 days', '90000000-0000-4000-8000-000000000001'::uuid)
) as fixture(phase, ts, op);
select throws_ok($$update private.qa_test_user_events set phase = 'failure'
  where operation_id = '90000000-0000-4000-8000-000000000001'$$,
  '42501', 'Account audit is append-only', 'UPDATE is refused even to the owner');
select throws_ok($$truncate private.qa_test_user_events$$,
  '42501', 'Account audit is append-only', 'TRUNCATE is refused even to the owner');
select throws_ok($$delete from private.qa_test_user_events
  where operation_id = '90000000-0000-4000-8000-000000000001' and phase = 'intent'$$,
  '42501', 'Account audit retention boundary', 'unresolved intent has no age override');
select throws_ok($$delete from private.qa_test_user_events
  where operation_id = '90000000-0000-4000-8000-000000000001' and phase = 'denied'
    and occurred_at > statement_timestamp() - interval '90 days'$$,
  '42501', 'Account audit retention boundary', 'a denial under 90 days stays');
select throws_ok($$select private.accounts_purge(501)$$,
  '22023', 'Invalid account purge limit', 'purge refuses batches larger than 500');

select ok(not private.accounts_finish(id, actor_id, null, 'success', target_id), action || ' requires domain evidence')
from private.accounts_operations where state in ('intent', 'unknown');
select is(private.accounts_reconcile(500), 0, 'reconciliation also requires domain evidence');

update private.accounts_control set purge_enabled = false;
select is(private.accounts_purge(500) ->> 'fenced', 'true', 'database control fences purge');
update private.accounts_control set purge_enabled = true;
select is(private.accounts_purge(1) ->> 'deleted', '1', 'row budget caps the first purge');
select is(private.accounts_purge(1) ->> 'deleted', '1', 'a later batch advances');
select ok(not exists (select from private.qa_test_user_events
  where operation_id = '90000000-0000-4000-8000-000000000003'), 'expired terminal event is purged');
select is((select count(*) from private.qa_test_user_events
  where operation_id = '90000000-0000-4000-8000-000000000001'), 2::bigint,
  'unresolved intent and the recent denial survive');

insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('91000000-0000-4000-8000-000000000001', 'fixture@example.test',
  'authenticated', now(), '{}', '{}');
insert into private.devbox_runners (id, actor_id, name)
values ('91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'QA fixture'),
  ('91000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'Other QA fixture');
insert into private.devbox_runner_tokens (id, runner_id, token_hash)
values ('91000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000002', repeat('1',64)),
  ('91000000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000003', repeat('2',64));
select is(private.accounts_machine_credential(repeat('1',64)), null::jsonb,
  'a devbox runner credential alone does not authorize Accounts');
insert into private.accounts_machine_registry (runner_id, enabled, changed_by)
values ('91000000-0000-4000-8000-000000000002', true, '91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000003', true, '91000000-0000-4000-8000-000000000001');

set local role service_role;
select is(private.accounts_machine_credential(repeat('1',64)) ->> 'runnerId',
  '91000000-0000-4000-8000-000000000002', 'service can exchange an enrolled credential');
select throws_ok($$select private.accounts_begin('91000000-0000-4000-8000-000000000008',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004',
  'invite', null, 'scope@tuturuuu.com')$$,
  '42501', 'Machine action refused', 'machine cannot admit an invitation');
select lives_ok($$select private.accounts_begin('91000000-0000-4000-8000-000000000008',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004',
  'test-create', null, null)$$, 'machine can admit a test reservation');
reset role;

create temp table machine_reservation on commit drop as
select private.accounts_reserve_test('91000000-0000-4000-8000-000000000008',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004', 'a1') as result;
select ok((select result #>> '{users,0,email}' like '%@tutur3u.com'
  and result #>> '{users,0,staff}' = 'false' from machine_reservation),
  'machine registration yields only a non-staff account');

create temp table managed_test on commit drop as
select (result #>> '{users,0,userId}')::uuid as id, result #>> '{users,0,email}' as email,
  result ->> 'runId' as run_id, result ->> 'expiresAt' as expires_at
from machine_reservation;
select ok(not private.accounts_finish('91000000-0000-4000-8000-000000000008',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004',
  'success', (select id from managed_test)), 'a pending QA reservation is insufficient evidence');
insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, email, 'authenticated', now(), jsonb_build_object(
  'qa_test', true, 'qa_run', run_id, 'qa_staff', false, 'qa_expires_at', expires_at), '{}'
from managed_test;
select is(private.accounts_test_step('91000000-0000-4000-8000-000000000008',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004',
  'activate') ->> 'userId', (select id::text from managed_test), 'activation settles creation');
select is((select actor_kind::text from private.qa_test_user_events
  where user_id = (select id from managed_test) and action = 'create'), 'machine',
  'the legacy QA event retains machine provenance');
select throws_ok(format($sql$select private.accounts_begin('91000000-0000-4000-8000-000000000009',
  '91000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000005',
  'test-delete', %L, null)$sql$, (select id from managed_test)),
  'P0002', 'Account unavailable', 'another enrolled machine cannot delete this allocation');

select private.accounts_begin('91000000-0000-4000-8000-000000000009',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004',
  'test-delete', (select id from managed_test), null);
select is(private.accounts_test_step('91000000-0000-4000-8000-000000000009',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004',
  'begin') ->> 'state', 'deleting', 'own allocation enters a deletion lease');
select is(private.accounts_test_step('91000000-0000-4000-8000-000000000009',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004',
  'finish') ->> 'state', 'present', 'finish waits for Auth removal');
delete from auth.users where id = (select id from managed_test);
select is(private.accounts_test_step('91000000-0000-4000-8000-000000000009',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004',
  'finish') ->> 'state', 'deleted', 'fleet wrapper verifies deleted ledger state');
select is(private.accounts_operation_status('91000000-0000-4000-8000-000000000009',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004') ->> 'status',
  'completed', 'the actor can reconcile its operation ID');

update private.devbox_runner_tokens set revoked_at = now()
where id = '91000000-0000-4000-8000-000000000004';
select throws_ok($$select private.accounts_operation_status('91000000-0000-4000-8000-000000000009',
  '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000004')$$,
  '42501', 'Machine enrollment refused', 'revocation invalidates an issued Accounts machine token');


insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('92000000-0000-4000-8000-000000000001', 'accounts-manager-fixture@tuturuuu.com', 'authenticated', now(), '{}', '{}'),
  ('92000000-0000-4000-8000-000000000002', 'accounts-target-fixture@tuturuuu.com', 'authenticated', now(), '{}', '{}'),
  ('92000000-0000-4000-8000-000000000007', 'accounts-guest-fixture@tuturuuu.com', 'authenticated', now(), '{}', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email' from auth.users
where id in ('92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000007');
update public.workspaces set creator_id = '92000000-0000-4000-8000-000000000001'
where id = '00000000-0000-0000-0000-000000000000';
update public.platform_user_roles set enabled = true, allow_role_management = true
where user_id = '92000000-0000-4000-8000-000000000001';
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values ('92000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, factor_id, aal, created_at)
values ('92000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000003', 'aal2', now());
insert into auth.mfa_amr_claims (id, session_id, authentication_method, created_at, updated_at)
values ('92000000-0000-4000-8000-000000000005', '92000000-0000-4000-8000-000000000004', 'totp', now(), now());
select ok(private.accounts_human_allowed('92000000-0000-4000-8000-000000000001'), 'enabled staff manager has root authority');
select ok(not private.accounts_fresh_totp('92000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000004'), 'another staff account cannot borrow the manager step-up');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$select private.accounts_begin('92000000-0000-4000-8000-000000000006',
  '92000000-0000-4000-8000-000000000001', null, 'admin', '92000000-0000-4000-8000-000000000002', null)$$,
  'human Accounts admission succeeds for a staff target');
select throws_ok($$select private.accounts_apply_human('92000000-0000-4000-8000-000000000006',
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004', null, null, true)$$,
  '42501', 'Enabled platform role manager required', 'F1 rejects Accounts role writes without the bound header');
select set_config('request.headers', '{"x-ttr-audit-actor-id":"92000000-0000-4000-8000-000000000001"}', true);
select lives_ok($$select private.accounts_apply_human('92000000-0000-4000-8000-000000000006',
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004', null, null, true)$$,
  'bound F1 actor and fresh TOTP authorize the role update');
select is(private.accounts_operation_status('92000000-0000-4000-8000-000000000006',
  '92000000-0000-4000-8000-000000000001', null) ->> 'status', 'completed', 'role write and audit commit atomically');
select set_config('request.headers', '', true);
select set_config('request.jwt.claims', '{}', true);
reset role;
select ok((select enabled and allow_role_management from public.platform_user_roles
  where user_id = '92000000-0000-4000-8000-000000000002'), 'staff recipient has the intended manager flags');

update auth.mfa_amr_claims set updated_at = now() - interval '6 minutes'
where id = '92000000-0000-4000-8000-000000000005';
select ok(not private.accounts_fresh_totp('92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000004'), 'a stale TOTP proof fails closed');


insert into public.workspaces (id, name, personal, creator_id)
values ('92000000-0000-4000-8000-000000000010', 'Accounts roles fixture', false, '92000000-0000-4000-8000-000000000002');
insert into public.workspace_members (ws_id, user_id, type)
values ('92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000001', 'MEMBER'),
  ('92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000002', 'MEMBER')
on conflict do nothing;
insert into public.workspace_default_permissions (ws_id, permission, enabled, member_type)
values ('92000000-0000-4000-8000-000000000010', 'manage_workspace_roles', true, 'MEMBER')
on conflict (ws_id, permission, member_type) do update set enabled = true;
insert into public.workspace_roles (id, ws_id, name)
values ('92000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000010', 'Subscription');
insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
values ('92000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000010', 'manage_subscription', true);

select private.accounts_begin('92000000-0000-4000-8000-000000000012', '92000000-0000-4000-8000-000000000001',
  null, 'role', '92000000-0000-4000-8000-000000000002', null);
select throws_ok($$select private.accounts_apply_human('92000000-0000-4000-8000-000000000012',
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004',
  '92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000011', null)$$,
  'P0002', 'Account unavailable', 'non-creator role manager cannot delegate a creator-only grant');

update public.workspaces set creator_id = '92000000-0000-4000-8000-000000000001'
where id = '92000000-0000-4000-8000-000000000010';
select private.accounts_begin('92000000-0000-4000-8000-000000000013', '92000000-0000-4000-8000-000000000001',
  null, 'role', '92000000-0000-4000-8000-000000000002', null);
select lives_ok($$select private.accounts_apply_human('92000000-0000-4000-8000-000000000013',
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004',
  '92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000011', null)$$,
  'workspace creator can delegate the grant to a full member');
select ok(exists (select from public.workspace_role_members
  where role_id = '92000000-0000-4000-8000-000000000011' and user_id = '92000000-0000-4000-8000-000000000002'),
  'authorized role delegation created the expected membership');

insert into public.workspace_members (ws_id, user_id, type)
values ('92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000007', 'GUEST');
select private.accounts_begin('92000000-0000-4000-8000-000000000014', '92000000-0000-4000-8000-000000000001',
  null, 'role', '92000000-0000-4000-8000-000000000007', null);
select throws_ok($$select private.accounts_apply_human('92000000-0000-4000-8000-000000000014',
  '92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004',
  '92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000011', null)$$,
  'P0002', 'Account unavailable', 'creator cannot assign workspace roles to guests');

select * from finish();
rollback;
