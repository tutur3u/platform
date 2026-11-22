create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local request.jwt.claims = '{"role":"service_role"}';
select no_plan();

select gen_random_uuid() as ws, gen_random_uuid() as creator,
  gen_random_uuid() as first_manager, gen_random_uuid() as second_manager,
  gen_random_uuid() as manager_role,
  '[{"id":"manage_workspace_roles","enabled":true}]' as new_grant,
  current_setting('transaction_isolation') as isolation
\gset

-- Seed the fixture directly because provisioning triggers require READ COMMITTED.
set local session_replication_role = replica;
insert into auth.users (id, email)
select id, id || '@example.test'
from unnest(array[:'creator', :'first_manager', :'second_manager']::uuid[]) users(id);
insert into public.users (id)
values (:'creator'), (:'first_manager'), (:'second_manager');
insert into public.workspaces (id, name, creator_id, personal)
values (:'ws', 'Isolation guard workspace', :'creator', false);

insert into public.workspace_members (ws_id, user_id, type) values
  (:'ws', :'creator', 'MEMBER'), (:'ws', :'first_manager', 'MEMBER'),
  (:'ws', :'second_manager', 'MEMBER');
insert into public.workspace_roles (id, ws_id, name) values
  (:'manager_role', :'ws', 'Isolation guard role');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  (:'ws', :'manager_role', 'admin', true);
insert into public.workspace_role_members (role_id, user_id) values
  (:'manager_role', :'first_manager'), (:'manager_role', :'second_manager');
set local session_replication_role = origin;

select throws_ok(
  call_sql,
  '25000',
  format('Guarded workspace operations require READ COMMITTED (found %s)', :'isolation'),
  name || ' rejects ' || upper(:'isolation')
)
from (values
  ('remove_workspace_member_guarded_in_mode', format(
    'select public.remove_workspace_member_guarded_in_mode(%L, %L, %L, %L)', :'ws', :'second_manager', :'creator', 'workspace')),
  ('remove_workspace_role_member_guarded_in_mode', format(
    'select public.remove_workspace_role_member_guarded_in_mode(%L, %L, %L, %L, %L)', :'ws', :'manager_role', :'second_manager', :'creator', 'workspace')),
  ('remove_workspace_member_guarded', format(
    'select public.remove_workspace_member_guarded(%L, %L, %L)', :'ws', :'second_manager', :'creator')),
  ('remove_workspace_role_member_guarded', format(
    'select public.remove_workspace_role_member_guarded(%L, %L, %L, %L)', :'ws', :'manager_role', :'second_manager', :'creator')),
  ('delete_workspace_role_guarded', format(
    'select public.delete_workspace_role_guarded(%L, %L, %L, %L)', :'ws', :'manager_role', :'creator', 'workspace')),
  ('reduce_external_app_workspace_admin_guarded', format(
    'select public.reduce_external_app_workspace_admin_guarded(%L, %L, true, %L)', :'ws', :'first_manager', :'second_manager')),
  ('update_workspace_role_guarded', format(
    'select private.update_workspace_role_guarded(%L, %L, %L, %L, %L, %L)', :'ws', :'manager_role', :'creator', 'workspace', :'new_grant', 'Renamed')),
  ('update_workspace_default_permissions_guarded', format(
    'select private.update_workspace_default_permissions_guarded(%L, %L, %L, %L, %L)', :'ws', :'creator', 'workspace', 'MEMBER', :'new_grant'))
) calls(name, call_sql);

select is((select count(*) from public.workspace_members where ws_id = :'ws' and type = 'MEMBER'),
  3::bigint, 'all full memberships remain');
select is((select count(*) from public.workspace_role_members where role_id = :'manager_role'),
  2::bigint, 'both role assignments remain');
select is((select name from public.workspace_roles where id = :'manager_role'),
  'Isolation guard role', 'role metadata remains unchanged');
select results_eq(format(
  'select permission::text, enabled from public.workspace_role_permissions where role_id = %L', :'manager_role'),
  $$values ('admin'::text, true)$$, 'role permissions remain unchanged');
select is((select count(*) from public.workspace_default_permissions where ws_id = :'ws'
    and permission in ('manage_workspace_members', 'manage_workspace_roles')), 0::bigint,
  'the refused operations insert no default permissions');
