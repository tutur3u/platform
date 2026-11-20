begin;
select plan(47);
select set_config('request.jwt.claims', '{}', true);

select ok(not has_table_privilege('authenticated', 'private.qa_test_users', 'select'), 'clients cannot read the QA ledger');
select ok(not has_table_privilege('service_role', 'private.qa_test_users', 'select'), 'service role reaches the ledger only through RPCs');
select ok(not has_function_privilege('authenticated', 'private.qa_test_begin_delete(uuid,text,uuid)', 'execute'), 'clients cannot delete QA accounts');
select ok(has_function_privilege('service_role', 'private.qa_test_reserve_users(uuid,text,text,integer,integer,boolean,text,boolean)', 'execute'), 'provisioner can reserve');
select ok(not has_function_privilege('anon', 'private.staff_identity_verified(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.staff_identity_verified(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.staff_identity_verified(uuid)', 'execute'),
  'the staff identity verifier stays definer-only');
select is((select proconfig from pg_proc where oid = 'private.staff_identity_verified(uuid)'::regprocedure),
  array['search_path=pg_catalog, pg_temp'], 'the staff identity verifier pins its search_path');

insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('7a000000-0000-4000-8000-000000000001', 'operator@tuturuuu.com', 'authenticated', now(), '{}', '{}'),
       ('7a000000-0000-4000-8000-000000000002', 'real-person@example.test', 'authenticated', now(), '{}', '{}');

insert into private.workspace_subscription_products (id, name, tier, pricing_model, archived, price)
values ('7a000000-0000-4000-8000-0000000000a1', 'Plus', 'PLUS', 'fixed', false, 1), ('7a000000-0000-4000-8000-0000000000a2', 'Pro', 'PRO', 'fixed', false, 2)
on conflict (id) do nothing;

select throws_ok($sql$
  insert into auth.users (id, email, role) values ('7a000000-0000-4000-8000-000000000009', 'qa+abcdefgh-1@tutur3u.com', 'authenticated')
$sql$, '42501', 'QA test address is reserved', 'signup cannot claim a reserved QA address');
select throws_ok($sql$
  update auth.users set raw_app_meta_data = '{"qa_test":true}' where id = '7a000000-0000-4000-8000-000000000002'
$sql$, '42501', 'QA test marker is reserved', 'an ordinary account cannot gain the QA marker');
select throws_ok($sql$
  select private.qa_test_reserve_users('7a000000-0000-4000-8000-000000000001', null, 'meet-rehearsal', 60, 1, false, 'FREE', false)
$sql$, '22023', 'Invalid QA test user request', 'TTL below 15 minutes is refused');
select throws_ok($sql$
  select private.qa_test_reserve_users('7a000000-0000-4000-8000-000000000001', null, 'meet-rehearsal', 3600, 51, false, 'FREE', false)
$sql$, '22023', 'Invalid QA test user request', 'more than 50 accounts per call is refused');

create temporary table host_run on commit drop as
select private.qa_test_reserve_users('7a000000-0000-4000-8000-000000000001', null, 'meet-rehearsal', 86400, 1, true, 'PRO', true) as result;
create temporary table host on commit drop as
select (result #>> '{users,0,userId}')::uuid as id, result #>> '{users,0,email}' as email, result ->> 'runId' as run_id from host_run;
select ok((select email ~ '^qa\+[a-z0-9]{8}-1@tuturuuu\.com$' from host), 'staff host uses the reserved staff address');

select throws_ok($sql$
  select private.qa_test_reserve_users('7a000000-0000-4000-8000-000000000002', (select run_id from host), null, null, 1, false, 'FREE', false)
$sql$, '42501', 'QA test run is unavailable', 'another operator cannot append to the run');
select throws_ok($sql$
  select private.qa_test_reserve_users('7a000000-0000-4000-8000-000000000001', (select run_id from host), null, null, 5, true, 'FREE', false)
$sql$, '54000', 'QA test run limit reached', 'staff accounts are capped per run');

create temporary table guests_run on commit drop as
select private.qa_test_reserve_users('7a000000-0000-4000-8000-000000000001', (select run_id from host), null, null, 2, false, 'FREE', false) as result;
create temporary table guest on commit drop as
select (value ->> 'userId')::uuid as id, value ->> 'email' as email, (value ->> 'ordinal')::int as ordinal
from guests_run, jsonb_array_elements(result -> 'users');
select is((select min(ordinal) from guest), 2, 'appended accounts continue the run ordinals');
select ok((select bool_and(email like '%@tutur3u.com') from guest), 'participants use the non-staff QA domain');

select throws_ok(format($sql$
  insert into auth.users (id, email, role, raw_app_meta_data) values (%L, %L, 'authenticated', '{"qa_test":true,"qa_run":"zzzzzzzz"}')
$sql$, (select id from host), (select email from host)), '42501', 'QA test account does not match its reservation', 'Auth creation refuses a foreign marker');
select is(private.qa_test_activate_user((select id from host), '7a000000-0000-4000-8000-000000000001'), null::jsonb, 'activation needs the Auth account');

select throws_ok(format($sql$
  insert into auth.users (id, email, role, raw_app_meta_data) values (%L, %L, 'authenticated', %L)
$sql$, g.id, g.email, jsonb_build_object('qa_test', true, 'qa_run', h.run_id, 'qa_staff', true, 'qa_expires_at', r.expires_at)),
  '42501', 'QA test account does not match its reservation', 'a participant cannot be created as a staff host')
from guest g, host h, private.qa_test_runs r where r.id = h.run_id and g.ordinal = 2;
select throws_ok(format($sql$
  insert into auth.users (id, email, role, raw_app_meta_data) values (%L, %L, 'authenticated', %L)
$sql$, h.id, h.email, jsonb_build_object('qa_test', true, 'qa_run', h.run_id, 'qa_staff', true, 'qa_expires_at', '2099-01-01T00:00:00Z')),
  '42501', 'QA test account does not match its reservation', 'the marker expiry must match the run')
from host h;

-- Auth inserts the row first and writes app_metadata in a later update.
insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, email, 'authenticated', now(), '{"provider":"email","providers":["email"]}', '{}' from host;
select is(private.qa_test_activate_user((select id from host), '7a000000-0000-4000-8000-000000000001'), null::jsonb, 'activation needs the marker');
insert into auth.identities (provider_id, user_id, identity_data, provider)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email' from host;
select ok(not private.is_verified_tuturuuu_staff((select id from host)), 'an unmarked reserved account never verifies as staff');
select throws_ok(format($sql$ update auth.users set raw_app_meta_data = raw_app_meta_data || '{"qa_test":true,"qa_run":"zzzzzzzz"}' where id = %L $sql$, (select id from host)),
  '42501', 'QA test account scope cannot change', 'a reserved account cannot gain a foreign marker');
update auth.users u set raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('qa_test', true, 'qa_run', h.run_id,
  'qa_purpose', 'meet-rehearsal', 'qa_staff', true, 'qa_expires_at', r.expires_at)
from host h join private.qa_test_runs r on r.id = h.run_id where u.id = h.id;
select ok((select raw_app_meta_data -> 'qa_test' = 'true'::jsonb from auth.users where id = (select id from host)), 'a pending account gains its matching marker');
insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select g.id, g.email, 'authenticated', now(), jsonb_build_object('qa_test', true, 'qa_run', h.run_id,
  'qa_staff', false, 'qa_expires_at', r.expires_at), '{}' from guest g, host h join private.qa_test_runs r on r.id = h.run_id;

select ok(private.qa_test_activate_user((select id from host), '7a000000-0000-4000-8000-000000000001') ->> 'runWorkspaceId' is not null, 'host activation creates the run workspace');
select ok((select bool_and(private.qa_test_activate_user(id, '7a000000-0000-4000-8000-000000000001') is not null) from guest), 'participants activate');
select is(public._resolve_workspace_tier((select workspace_id from private.qa_test_runs where id = (select run_id from host))), 'PRO'::public.workspace_product_tier, 'run workspace has the test tier');
select is(public._resolve_workspace_tier((select id from public.workspaces where creator_id = (select id from host) and personal)), 'PRO'::public.workspace_product_tier, 'host personal workspace has the test tier');
select ok((select bool_and(polar_subscription_id like 'qa\_test\_%') from public.workspace_subscriptions s join private.qa_test_subscriptions q on q.subscription_id = s.id), 'test subscriptions carry the reserved provider prefix');
select is((select count(*) from public.workspace_members where ws_id = (select workspace_id from private.qa_test_runs where id = (select run_id from host))), 3::bigint, 'run workspace holds the host and participants');
select is((select count(*) from private.qa_test_user_events where action = 'create' and run_id = (select run_id from host)), 3::bigint, 'each create is audited');

select throws_ok(format($sql$ update auth.users set raw_app_meta_data = raw_app_meta_data - 'qa_test' where id = %L $sql$, (select id from host)),
  '42501', 'QA test account scope cannot change', 'the marker is immutable');
select throws_ok(format($sql$ update auth.users set email = 'someone@tuturuuu.com' where id = %L $sql$, (select id from host)),
  '42501', 'QA test account scope cannot change', 'the address is immutable');
select throws_ok(format($sql$ insert into public.workspace_members (ws_id, user_id) values ('00000000-0000-0000-0000-000000000000', %L) $sql$, (select id from host)),
  '42501', 'QA test accounts cannot join the root workspace', 'staff host never joins the root workspace');
select throws_ok(format($sql$ update public.platform_user_roles set enabled = true where user_id = %L $sql$, (select id from host)),
  '42501', 'QA test accounts cannot hold platform roles', 'QA accounts never hold platform roles');
select throws_ok(format($sql$ update public.platform_user_roles set allow_workspace_creation = true, allow_discord_integrations = true where user_id = %L $sql$, (select id from host)),
  '42501', 'QA test accounts cannot hold platform roles', 'QA accounts never gain platform allowances');
select throws_ok(format($sql$ update auth.users set role = 'service_role' where id = %L $sql$, (select id from host)),
  '42501', 'QA test account scope cannot change', 'the Auth role is pinned');

insert into auth.identities (provider_id, user_id, identity_data, provider)
select '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001',
  '{"sub":"7a000000-0000-4000-8000-000000000001","email":"operator@tuturuuu.com"}', 'email';
select ok(private.is_verified_tuturuuu_staff('7a000000-0000-4000-8000-000000000001'), 'a real staff account still verifies');
select ok(not private.is_verified_tuturuuu_staff((select id from host)), 'a staff-domain QA host never verifies as staff');

select is(private.qa_test_begin_delete('7a000000-0000-4000-8000-000000000002', 'operator', null) ->> 'state', 'not_found', 'unregistered accounts are refused');
select ok(private.qa_test_record_session((select id from host), '7a000000-0000-4000-8000-000000000001') is not null, 'session mint is recorded for a live account');

select is((select private.qa_test_begin_delete(id, 'operator', null) ->> 'runWorkspaceId' from guest where ordinal = 2), null, 'run workspace stays while accounts remain');
select is((select private.qa_test_begin_delete(id, 'operator', null) ->> 'state' from guest where ordinal = 2), 'busy', 'a leased deletion is not repeated');
select is((select private.qa_test_finish_delete(id, 'operator', null) ->> 'state' from guest where ordinal = 2), 'present', 'deletion settles only after Auth removal');
delete from auth.users where id = (select id from guest where ordinal = 2);
select is((select private.qa_test_finish_delete(id, 'operator', null) ->> 'state' from guest where ordinal = 2), 'deleted', 'deletion settles after Auth removal');

update private.qa_test_runs set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours' where id = (select run_id from host);
select is(jsonb_array_length(private.qa_test_list_expired(25) -> 'userIds'), 2, 'expired live accounts are listed for cleanup');
update private.qa_test_user_control set cleanup_enabled = false;
select is(private.qa_test_list_expired(25) ->> 'mode', 'fenced', 'the stop fence halts cleanup');
update private.qa_test_user_control set cleanup_enabled = true;

select is((select status::text from public.workspace_subscriptions where ws_id = (select id from public.workspaces where creator_id = (select id from host) and personal) order by created_at desc limit 1), 'active', 'host subscription stays until its deletion');
select * from finish();
rollback;
