begin;
select plan(31);
select set_config('request.jwt.claims', '{}', true);

select ok(not has_table_privilege('authenticated', 'private.fleet_smoke_operations', 'select'), 'client cannot read the provisioning ledger');
select ok(not has_function_privilege('authenticated', 'private.fleet_smoke_transition(uuid,text,uuid)', 'execute'), 'client cannot change provisioning state');
select ok(has_function_privilege('service_role', 'private.fleet_smoke_transition(uuid,text,uuid)', 'execute'), 'provisioner can change state');

select throws_ok($sql$
  insert into auth.users (id, email, role)
  values ('66611941-0e5a-44f2-a32b-000000000001', 'qa-automation+66611941-0e5a-44f2-a32b-000000000001@smoke.tuturuuu.com', 'authenticated')
$sql$, '42501', 'Fleet smoke address is reserved', 'public signup cannot claim the reserved domain');

select is(private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000001', 'reserve')->>'state', 'pending', 'operation is reserved');
select is(private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000001', 'reserve'), null::jsonb, 'replay cannot create twice');
select is(private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000002', 'reserve'), null::jsonb, 'second in-flight operation is denied');

insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('66611941-0e5a-44f2-a32b-000000000001', 'qa-automation+66611941-0e5a-44f2-a32b-000000000001@smoke.tuturuuu.com', 'authenticated', now(),
   '{"tuturuuu_fleet_smoke":true,"tuturuuu_required_mfa":{"required":true,"verifiedAfter":0,"recoveryInProgress":true}}', '{}'),
  ('66611941-0e5a-44f2-a32b-000000000003', 'fleet-human-control@example.test', 'authenticated', now(), '{}', '{}');

select is(private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000001', 'activate'), null::jsonb, 'cannot activate without verified TOTP');
select throws_ok($sql$
  update auth.users set raw_app_meta_data = '{}' where id = '66611941-0e5a-44f2-a32b-000000000001'
$sql$, '42501', 'Fleet smoke Auth scope cannot change', 'ordinary account settings cannot clear the synthetic marker and MFA');
select throws_ok($sql$
  update auth.users set email = 'staff@tuturuuu.com' where id = '66611941-0e5a-44f2-a32b-000000000001'
$sql$, '42501', 'Fleet smoke Auth scope cannot change', 'synthetic identity cannot assume a staff address');

insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values ('66611941-0e5a-44f2-a32b-000000000011', '66611941-0e5a-44f2-a32b-000000000001', 'totp', 'verified', now(), now());
select is(private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000001', 'activate', '66611941-0e5a-44f2-a32b-000000000011')->>'state', 'active', 'verified fixture can activate');
select is((select count(*) from public.workspace_members where user_id = '66611941-0e5a-44f2-a32b-000000000001'), 1::bigint, 'fixture has only one membership');
select ok(public.has_workspace_permission(
  (select workspace_id from private.fleet_smoke_operations where id = '66611941-0e5a-44f2-a32b-000000000001'),
  '66611941-0e5a-44f2-a32b-000000000001', 'manage_calendar'), 'fixture can manage its own calendar');
select ok(not public.has_workspace_permission(
  (select id from public.workspaces where creator_id = '66611941-0e5a-44f2-a32b-000000000003'),
  '66611941-0e5a-44f2-a32b-000000000001', 'manage_calendar'), 'fixture cannot manage another workspace');
select throws_ok($sql$
  insert into public.workspace_members (ws_id, user_id) values
  ((select id from public.workspaces where creator_id = '66611941-0e5a-44f2-a32b-000000000003'), '66611941-0e5a-44f2-a32b-000000000001')
$sql$, '42501', 'Fleet smoke workspace membership cannot cross the fixture boundary', 'even a privileged invitation cannot join the fixture to a real workspace');
select throws_ok($sql$
  insert into public.workspaces (name, personal, creator_id) values
  ('Escaped fixture', false, '66611941-0e5a-44f2-a32b-000000000001')
$sql$, '42501', 'Fleet smoke identity is confined to its personal workspace', 'fixture cannot acquire another workspace');
select throws_ok($sql$
  update public.workspaces set personal = false where creator_id = '66611941-0e5a-44f2-a32b-000000000001'
$sql$, '42501', 'Fleet smoke workspace scope cannot change', 'fixture cannot become a shared workspace');

select set_config('request.jwt.claims', '{"sub":"66611941-0e5a-44f2-a32b-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select ok(not public.account_required_mfa_satisfied(), 'password-only fixture is denied by existing MFA enforcement');
reset role;
select set_config('request.jwt.claims', '{}', true);

select is(private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000002', 'reserve')->>'state', 'pending', 'active fixture admits a pending replacement');
insert into auth.users (id, email, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('66611941-0e5a-44f2-a32b-000000000002', 'qa-automation+66611941-0e5a-44f2-a32b-000000000002@smoke.tuturuuu.com', 'authenticated', now(),
   '{"tuturuuu_fleet_smoke":true,"tuturuuu_required_mfa":{"required":true,"verifiedAfter":0,"recoveryInProgress":true}}', '{}');
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values ('66611941-0e5a-44f2-a32b-000000000012', '66611941-0e5a-44f2-a32b-000000000002', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, factor_id, aal, created_at)
values ('66611941-0e5a-44f2-a32b-000000000021', '66611941-0e5a-44f2-a32b-000000000001', '66611941-0e5a-44f2-a32b-000000000011', 'aal2', now());
insert into auth.refresh_tokens (token, user_id, session_id)
values ('retired-fixture-test-token', '66611941-0e5a-44f2-a32b-000000000001', '66611941-0e5a-44f2-a32b-000000000021');
select private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000002', 'activate', '66611941-0e5a-44f2-a32b-000000000012') as rotation \gset
select is(:'rotation'::jsonb->>'state', 'active', 'rotation activates the replacement');
select is(:'rotation'::jsonb->>'previousId', '66611941-0e5a-44f2-a32b-000000000001', 'rotation reports the retired identity');
select ok((select banned_until > now() from auth.users where id = '66611941-0e5a-44f2-a32b-000000000001'), 'rotated identity is banned');
select is((select count(*) from auth.sessions where user_id = '66611941-0e5a-44f2-a32b-000000000001'), 0::bigint, 'rotation deletes prior sessions');
select is((select count(*) from auth.refresh_tokens where user_id::text = '66611941-0e5a-44f2-a32b-000000000001'), 0::bigint, 'rotation deletes prior refresh tokens');
select is((select count(*) from auth.mfa_factors where user_id = '66611941-0e5a-44f2-a32b-000000000001'), 0::bigint, 'rotation deletes the prior TOTP factor');
select is((select raw_app_meta_data #>> '{tuturuuu_required_mfa,recoveryInProgress}' from auth.users where id = '66611941-0e5a-44f2-a32b-000000000001'), 'true', 'rotation disables the previous account');
select private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000002', 'retire') as retirement \gset
select is(:'retirement'::jsonb->>'state', 'retired', 'retirement closes the active operation');
select is(:'retirement'::jsonb->>'previousId', '66611941-0e5a-44f2-a32b-000000000002', 'explicit retirement reports its retired identity');
select ok((select banned_until > now() from auth.users where id = '66611941-0e5a-44f2-a32b-000000000002'), 'explicitly retired identity is banned');
select is((select count(*) from auth.mfa_factors where user_id = '66611941-0e5a-44f2-a32b-000000000002'), 0::bigint, 'explicit retirement deletes TOTP');
select is((select raw_app_meta_data #>> '{tuturuuu_required_mfa,recoveryInProgress}' from auth.users where id = '66611941-0e5a-44f2-a32b-000000000002'), 'true', 'retirement denies the active account');
select * from finish();
rollback;
