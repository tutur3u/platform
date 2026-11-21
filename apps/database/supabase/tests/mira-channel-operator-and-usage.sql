begin;
select plan(24);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('ad000000-0000-4000-8000-000000000001', 'mira-operator@example.com', now(), '{}', '{}'),
  ('ad000000-0000-4000-8000-000000000002', 'mira-other@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, personal, creator_id) values
  ('ad000000-0000-4000-8000-0000000000a1', 'Mira usage tenant', false, 'ad000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('00000000-0000-0000-0000-000000000000', 'Root', false, 'ad000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.workspace_roles (id, ws_id, name) values
  ('ad000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'Mira operators'),
  ('ad000000-0000-4000-8000-0000000000c2', 'ad000000-0000-4000-8000-0000000000a1', 'Tenant role'),
  ('ad000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'Root admins');
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-000000000001', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-000000000002', 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-0000000000c3', 'admin', true);
insert into public.workspace_role_members (role_id, user_id)
values ('ad000000-0000-4000-8000-0000000000c3', 'ad000000-0000-4000-8000-000000000002');

-- has_workspace_permission treats the operator permission as an explicit grant.
select ok(
  not public.has_workspace_permission('00000000-0000-0000-0000-000000000000',
    'ad000000-0000-4000-8000-000000000002', 'operate_mira_channels'),
  'a root admin does not inherit operate_mira_channels');
select ok(
  public.has_workspace_permission('00000000-0000-0000-0000-000000000000',
    'ad000000-0000-4000-8000-000000000002', 'view_infrastructure'),
  'admin still implies other root permissions');
select ok(
  not public.has_workspace_permission('00000000-0000-0000-0000-000000000000',
    (select creator_id from public.workspaces where id = '00000000-0000-0000-0000-000000000000'),
    'operate_mira_channels'),
  'the root creator does not inherit operate_mira_channels');

select is(
  (select count(*)::int from public.workspace_role_permissions
    where permission::text = 'operate_mira_channels' and enabled),
  0, 'no role holds operate_mira_channels after the migration');

-- Without the owner flag even a database-owner session cannot grant it.
select throws_ok(
  $$ insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
     values ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-0000000000c1',
       'operate_mira_channels', true) $$,
  '42501', null, 'a root role grant without the owner flag is refused');
select throws_ok(
  $$ insert into public.workspace_default_permissions (ws_id, permission, enabled)
     values ('00000000-0000-0000-0000-000000000000', 'operate_mira_channels', true) $$,
  '42501', null, 'operate_mira_channels cannot be a default permission');
select lives_ok(
  $$ insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
     values ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-0000000000c1',
       'operate_mira_channels', false) $$,
  'a disabled row (role editor upsert) is accepted');

set local tuturuuu.mira_operator_grant = 'owner';
select throws_ok(
  $$ insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
     values ('ad000000-0000-4000-8000-0000000000a1', 'ad000000-0000-4000-8000-0000000000c2',
       'operate_mira_channels', true) $$,
  '42501', null, 'operate_mira_channels is refused outside the root workspace');
select lives_ok(
  $$ update public.workspace_role_permissions set enabled = true
     where role_id = 'ad000000-0000-4000-8000-0000000000c1' and permission::text = 'operate_mira_channels' $$,
  'an owner session with the flag grants it in the root workspace');
select lives_ok(
  $$ insert into public.workspace_role_members (role_id, user_id)
     values ('ad000000-0000-4000-8000-0000000000c1', 'ad000000-0000-4000-8000-000000000001') $$,
  'an owner session with the flag adds the first member');
select lives_ok(
  $$ update public.workspace_role_permissions set enabled = true
     where role_id = 'ad000000-0000-4000-8000-0000000000c1' and permission::text = 'operate_mira_channels' $$,
  'setup re-save stays accepted');
select ok(
  public.has_workspace_permission('00000000-0000-0000-0000-000000000000',
    'ad000000-0000-4000-8000-000000000001', 'operate_mira_channels'),
  'a member of a role with the enabled grant holds operate_mira_channels');
set local tuturuuu.mira_operator_grant = '';

select lives_ok(
  $$ update public.workspace_role_permissions set enabled = true
     where role_id = 'ad000000-0000-4000-8000-0000000000c1' and permission::text = 'operate_mira_channels' $$,
  're-saving an unchanged grant is accepted without the flag');
select throws_ok(
  $$ insert into public.workspace_role_members (role_id, user_id)
     values ('ad000000-0000-4000-8000-0000000000c1', 'ad000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'adding a member to an operator role without the flag is refused');
select lives_ok(
  $$ update public.workspace_role_permissions set enabled = false
     where role_id = 'ad000000-0000-4000-8000-0000000000c1' and permission::text = 'operate_mira_channels' $$,
  'revoking stays open');
select ok(
  not public.has_workspace_permission('00000000-0000-0000-0000-000000000000',
    'ad000000-0000-4000-8000-000000000001', 'operate_mira_channels'),
  'a revoked grant no longer holds operate_mira_channels');

select ok(
  not has_function_privilege('service_role', 'private.mira_operator_grant_allowed()', 'execute')
  and not has_function_privilege('authenticated', 'private.mira_operator_grant_allowed()', 'execute'),
  'the grant check is not executable by API roles');
select ok(
  not has_function_privilege('authenticated', 'private.mira_list_usage(uuid, date, date)', 'execute')
  and has_function_privilege('service_role', 'private.mira_list_usage(uuid, date, date)', 'execute'),
  'usage reads are service-role only');

create temp table mira_usage_ids (id uuid);
grant select, insert on mira_usage_ids to service_role;
set local role service_role;
select private.mira_update_tenant_settings('ad000000-0000-4000-8000-0000000000a1',
  'ad000000-0000-4000-8000-000000000001', 'tenant_manager', null, '{}');
insert into mira_usage_ids values (private.mira_bind_channel('ad000000-0000-4000-8000-0000000000a1',
  'ad000000-0000-4000-8000-000000000001', 'discord', 'shared_bot', 'usage-guild-1', 'Guild'));
select private.mira_record_usage('ad000000-0000-4000-8000-0000000000e1',
  'ad000000-0000-4000-8000-0000000000a1', (select id from mira_usage_ids), 'claude-haiku-5-5',
  '2026-11-20', '{"replies": 3, "costMicroUsd": 1200}');

select is(
  (select sum(cost_micro_usd)::bigint from private.mira_list_usage(
    'ad000000-0000-4000-8000-0000000000a1', '2026-11-01', '2026-11-21')),
  1200::bigint, 'usage lists settled micro-USD in range');
select is(
  (select count(*)::int from private.mira_list_usage(
    '00000000-0000-0000-0000-000000000000', '2026-11-01', '2026-11-21')),
  0, 'another workspace sees no usage rows');
select throws_ok(
  $$ select * from private.mira_list_usage('ad000000-0000-4000-8000-0000000000a1', '2025-01-01', '2026-11-21') $$,
  '22023', null, 'ranges over 400 days are refused');
select throws_ok(
  $$ select * from private.mira_list_usage('ad000000-0000-4000-8000-0000000000a1', '2026-11-21', '2026-11-01') $$,
  '22023', null, 'inverted ranges are refused');

-- Unbinding cannot shed a tenant-level stop the tenant does not own.
select private.mira_set_stop_reason('ad000000-0000-4000-8000-0000000000a1', null, 'operator', true,
  'operator', 'ad000000-0000-4000-8000-000000000001', null, 'pgtap suspension');
select throws_ok(
  $$ select private.mira_unbind_channel('ad000000-0000-4000-8000-0000000000a1',
    (select id from mira_usage_ids), 'ad000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a tenant-level operator stop blocks unbinding');
select private.mira_set_stop_reason('ad000000-0000-4000-8000-0000000000a1', null, 'operator', false,
  'operator', 'ad000000-0000-4000-8000-000000000001', null, 'pgtap lift');
select ok(
  private.mira_unbind_channel('ad000000-0000-4000-8000-0000000000a1',
    (select id from mira_usage_ids), 'ad000000-0000-4000-8000-000000000001'),
  'unbinding succeeds once only tenant-owned stops remain');
reset role;

select * from finish();
rollback;
