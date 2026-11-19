begin;
select plan(57);
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

-- Exercise the writes used by the server invite acceptance and link join paths.
insert into public.workspaces (id, name, personal, creator_id)
values ('66611941-0e5a-44f2-a32b-000000000031', 'Non-fleet team control', false, '66611941-0e5a-44f2-a32b-000000000003');
select throws_ok($sql$
  insert into public.workspace_invites (ws_id, user_id) values
  ('66611941-0e5a-44f2-a32b-000000000031', '66611941-0e5a-44f2-a32b-000000000001')
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'real users cannot invite a synthetic identity');
select throws_ok($sql$
  insert into public.workspace_email_invites (ws_id, invited_by, email) values
  ('66611941-0e5a-44f2-a32b-000000000031', '66611941-0e5a-44f2-a32b-000000000003',
   'qa-automation+66611941-0e5a-44f2-a32b-000000000001@smoke.tuturuuu.com')
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'the no-mail domain cannot be invited');
select throws_ok($sql$
  select private.finalize_workspace_invitation_membership_v2(
    '66611941-0e5a-44f2-a32b-000000000031', '66611941-0e5a-44f2-a32b-000000000001', 'MEMBER'
  )
$sql$, '42501', 'Fleet smoke workspace membership cannot cross the fixture boundary', 'a real invitation cannot admit the synthetic fixture');

insert into public.workspace_invite_links (ws_id, creator_id, code, type)
values ('66611941-0e5a-44f2-a32b-000000000031', '66611941-0e5a-44f2-a32b-000000000003', 'fleet-smoke-link-fixture', 'GUEST');
select throws_ok($sql$
  insert into public.workspace_members (ws_id, user_id, type)
  select ws_id, '66611941-0e5a-44f2-a32b-000000000001', type
  from public.workspace_invite_links where code = 'fleet-smoke-link-fixture'
$sql$, '42501', 'Fleet smoke workspace membership cannot cross the fixture boundary', 'an invite-link join cannot admit the fixture as a guest');

select throws_ok($sql$
  insert into public.workspace_email_invites (ws_id, invited_by, email)
  select workspace_id, id, 'other@example.test' from private.fleet_smoke_operations
  where id = '66611941-0e5a-44f2-a32b-000000000001'
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'the fixture cannot send an email invitation');
select throws_ok($sql$
  insert into public.workspace_invite_links (ws_id, creator_id, code)
  select workspace_id, id, 'fleet-smoke-outbound-link' from private.fleet_smoke_operations
  where id = '66611941-0e5a-44f2-a32b-000000000001'
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'the fixture cannot create an invite link');
select throws_ok($sql$
  insert into public.workspace_invites (ws_id, user_id)
  select workspace_id, '66611941-0e5a-44f2-a32b-000000000003' from private.fleet_smoke_operations
  where id = '66611941-0e5a-44f2-a32b-000000000001'
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'the fixture workspace cannot invite an existing account');

insert into public.task_plans (id, owner_id, personal_ws_id, title, period_type, period_start, period_end)
select '66611941-0e5a-44f2-a32b-000000000041', creator_id, id, 'Real share control', 'week', current_date, current_date + 6
from public.workspaces where creator_id = '66611941-0e5a-44f2-a32b-000000000003' and personal;
select throws_ok($sql$
  insert into public.task_plan_shares (plan_id, shared_with_user_id, shared_by_user_id)
  values ('66611941-0e5a-44f2-a32b-000000000041', '66611941-0e5a-44f2-a32b-000000000001', '66611941-0e5a-44f2-a32b-000000000003')
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'task plans cannot be shared directly to the fixture');

select ok((select workspace_id is not null from private.fleet_smoke_operations
  where id = '66611941-0e5a-44f2-a32b-000000000001'), 'the fixture workspace is recorded');

insert into public.workspace_boards (id, ws_id, creator_id, name)
values ('66611941-0e5a-44f2-a32b-000000000061', '66611941-0e5a-44f2-a32b-000000000031',
  '66611941-0e5a-44f2-a32b-000000000003', 'Real sharing controls');
insert into public.tasks (id, name, board_id, creator_id) values
('66611941-0e5a-44f2-a32b-000000000062', 'Sharing control task', '66611941-0e5a-44f2-a32b-000000000061', '66611941-0e5a-44f2-a32b-000000000003');
insert into public.board_templates (id, ws_id, created_by, name, content) values
('66611941-0e5a-44f2-a32b-000000000063', '66611941-0e5a-44f2-a32b-000000000031', '66611941-0e5a-44f2-a32b-000000000003', 'Sharing template control', '{}');

select throws_ok($sql$
  insert into public.task_shares (task_id, shared_with_user_id, shared_by_user_id) values
  ('66611941-0e5a-44f2-a32b-000000000062', '66611941-0e5a-44f2-a32b-000000000001', '66611941-0e5a-44f2-a32b-000000000003')
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'a real task cannot be shared to the fixture');
select throws_ok($sql$
  insert into public.task_board_shares (board_id, shared_with_email, shared_by_user_id) values
  ('66611941-0e5a-44f2-a32b-000000000061', 'qa-automation@example.test', '66611941-0e5a-44f2-a32b-000000000001')
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'the fixture cannot share a board');
select throws_ok($sql$
  insert into public.board_template_shares (template_id, user_id, created_by) values
  ('66611941-0e5a-44f2-a32b-000000000063', '66611941-0e5a-44f2-a32b-000000000001', '66611941-0e5a-44f2-a32b-000000000003')
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'a real board template cannot be shared to the fixture');
select throws_ok($sql$
  insert into public.task_share_links (task_id, code, created_by_user_id, requires_invite, public_access) values
  ('66611941-0e5a-44f2-a32b-000000000062', 'fleet-smoke-share-fixture', '66611941-0e5a-44f2-a32b-000000000001', false, 'view')
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'the fixture cannot create public task links');

insert into private.forms (id, ws_id, creator_id, title)
select '66611941-0e5a-44f2-a32b-000000000064', workspace_id, id, 'Synthetic form'
from private.fleet_smoke_operations where id = '66611941-0e5a-44f2-a32b-000000000001';
select throws_ok($sql$
  insert into private.form_share_links (form_id, code, created_by_user_id) values
  ('66611941-0e5a-44f2-a32b-000000000064', 'fleet-smoke-form-link', '66611941-0e5a-44f2-a32b-000000000003')
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'even a different actor cannot share a fixture-owned form');

insert into public.task_shares (id, task_id, shared_with_email, shared_by_user_id) values
('66611941-0e5a-44f2-a32b-000000000065', '66611941-0e5a-44f2-a32b-000000000062', 'other@example.test', '66611941-0e5a-44f2-a32b-000000000003');
select throws_ok($sql$
  update public.task_shares set shared_with_user_id = '66611941-0e5a-44f2-a32b-000000000001'
  where id = '66611941-0e5a-44f2-a32b-000000000065'
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'existing shares cannot be updated to target the fixture');

insert into public.task_board_shares (board_id, shared_with_email, shared_by_user_id)
values ('66611941-0e5a-44f2-a32b-000000000061', 'board-control@example.test', '66611941-0e5a-44f2-a32b-000000000003');
select throws_ok($sql$
  update public.task_board_shares set shared_with_email = 'test@smoke.tuturuuu.com'
  where shared_with_email = 'board-control@example.test'
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'a board share cannot be redirected to the fixture domain');
insert into public.board_template_shares (template_id, email, created_by)
values ('66611941-0e5a-44f2-a32b-000000000063', 'template-control@example.test', '66611941-0e5a-44f2-a32b-000000000003');
select throws_ok($sql$
  update public.board_template_shares set user_id = '66611941-0e5a-44f2-a32b-000000000001'
  where email = 'template-control@example.test'
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'a template share cannot be updated to target the fixture');
insert into public.task_share_links (task_id, code, created_by_user_id, requires_invite, public_access)
values ('66611941-0e5a-44f2-a32b-000000000062', 'fleet-smoke-task-link-control', '66611941-0e5a-44f2-a32b-000000000003', true, 'none');
select set_config('request.jwt.claims', '{"sub":"66611941-0e5a-44f2-a32b-000000000001","role":"authenticated"}', true);
select throws_ok($sql$
  update public.task_share_links set requires_invite = false, public_access = 'view' where code = 'fleet-smoke-task-link-control'
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'the fixture cannot make an existing task link public');
select set_config('request.jwt.claims', '{}', true);
insert into private.forms (id, ws_id, creator_id, title)
values ('66611941-0e5a-44f2-a32b-000000000066', '66611941-0e5a-44f2-a32b-000000000031', '66611941-0e5a-44f2-a32b-000000000003', 'Form link control');
insert into private.form_share_links (form_id, code, created_by_user_id)
values ('66611941-0e5a-44f2-a32b-000000000066', 'fleet-smoke-form-link-control', '66611941-0e5a-44f2-a32b-000000000003');
select throws_ok($sql$
  update private.form_share_links set form_id = '66611941-0e5a-44f2-a32b-000000000064'
  where code = 'fleet-smoke-form-link-control'
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'an existing link cannot be moved to a fixture-owned form');

insert into public.workspace_email_invites (ws_id, invited_by, email) values
('66611941-0e5a-44f2-a32b-000000000031', '66611941-0e5a-44f2-a32b-000000000003', 'ordinary@example.test');
select throws_ok($sql$
  update public.workspace_email_invites set email = 'test@smoke.tuturuuu.com' where email = 'ordinary@example.test'
$sql$, '42501', 'Fleet smoke identities cannot send invites or share resources', 'an invitation cannot be redirected to the fixture domain');

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
insert into private.fleet_smoke_operations (id, state)
select gen_random_uuid(), 'retired' from generate_series(1, 3);
select throws_ok($sql$
  select private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000051', 'reserve')
$sql$, '54000', 'Fleet smoke provision limit reached', 'a sixth reservation in 24 hours is denied');

update private.fleet_smoke_operations set reserved_at = now() - interval '2 days';
insert into private.fleet_smoke_operations (id, state, reserved_at)
select gen_random_uuid(), 'retired', now() - interval '2 days' from generate_series(1, 95);
select throws_ok($sql$
  select private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000051', 'reserve')
$sql$, '54000', 'Fleet smoke provision limit reached', 'no additional identity is added at the ledger cap');
select throws_ok($sql$
  update private.fleet_smoke_operations set purged_at = now() where id = '66611941-0e5a-44f2-a32b-000000000001'
$sql$, '42501', 'Fleet smoke purge requires hard deletion of the retired identity and its workspace', 'a retired Auth identity cannot be marked purged while it exists');
-- The reserved row below has no Auth user or fixture workspace.
select lives_ok($sql$
  update private.fleet_smoke_operations set purged_at = now()
  where id = (select id from private.fleet_smoke_operations where workspace_id is null and state = 'retired' limit 1)
$sql$, 'a deleted fixture can be tombstoned');
select is(private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000051', 'reserve')->>'state', 'pending', 'tombstoning frees a slot');
select is(private.fleet_smoke_transition('66611941-0e5a-44f2-a32b-000000000051', 'retire')->>'state', 'retired', 'retirement remains available at the cap');
select * from finish();
rollback;
