begin isolation level read committed;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local request.jwt.claims = '{"role":"service_role"}';
select no_plan();

select lives_ok('select private.require_read_committed()',
  'the isolation guard accepts READ COMMITTED');
select ok(
  not p.prosecdef and p.proconfig = array['search_path=pg_catalog, pg_temp']
    and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('service_role', p.oid, 'execute'),
  'the isolation check is an internal-only invoker with a pinned search path'
) from pg_proc p where p.oid = 'private.require_read_committed()'::regprocedure;

select ok(
  p.prosecdef
    and p.proconfig = array['search_path=pg_catalog, pg_temp']
    and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('authenticated', p.oid, 'execute')
    and has_function_privilege('service_role', p.oid, 'execute'),
  signature || ' retains its service-only grant and pinned search path'
)
from (values
  ('public.remove_workspace_member_guarded_in_mode(uuid,uuid,uuid,text,boolean)'),
  ('public.remove_workspace_member_guarded(uuid,uuid,uuid)'),
  ('public.remove_workspace_role_member_guarded(uuid,uuid,uuid,uuid)'),
  ('public.remove_workspace_role_member_guarded_in_mode(uuid,uuid,uuid,uuid,text,boolean)'),
  ('public.delete_workspace_role_guarded(uuid,uuid,uuid,text)'),
  ('public.reduce_external_app_workspace_admin_guarded(uuid,uuid,boolean,uuid)'),
  ('private.update_workspace_role_guarded(uuid,uuid,uuid,text,jsonb,text)'),
  ('private.update_workspace_default_permissions_guarded(uuid,uuid,text,public.workspace_member_type,jsonb)')
) f(signature)
left join pg_proc p on p.oid = to_regprocedure(f.signature);

select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'service_role']) as callers(role_name)
  where has_function_privilege(role_name, 'private.workspace_lost_member_manager(uuid,boolean)', 'execute')
), 'the postcondition helper retains its internal-only ACL');

select matches(
  obj_description('private.account_deletion_blocking_workspaces(uuid)'::regprocedure, 'pg_proc'),
  'Best-effort preflight using a snapshot read.*separate transaction.*race window.*Platform-operator deletion does not call this function',
  'the account preflight documents the Auth race and the operator exception'
);

select gen_random_uuid() as ws, gen_random_uuid() as default_ws,
  gen_random_uuid() as solo_ws, gen_random_uuid() as healthy_solo_ws,
  gen_random_uuid() as creator, gen_random_uuid() as member, gen_random_uuid() as cms_member,
  gen_random_uuid() as guest, gen_random_uuid() as local_role, gen_random_uuid() as root_role,
  gen_random_uuid() as solo_role,
  '00000000-0000-0000-0000-000000000000'::uuid as root_ws,
  '[{"id":"manage_workspace_members","enabled":true}]' as manager_grant,
  '[{"id":"manage_workspace_roles","enabled":true}]' as other_grant
\gset

insert into auth.users (id, email)
select id, id || '@example.test'
from unnest(array[:'creator', :'member', :'cms_member', :'guest']::uuid[]) f(id);

insert into public.workspaces (id, name, creator_id, personal) values
  (:'ws', 'Manager postcondition', :'creator', false),
  (:'default_ws', 'Manager repair by default', :'creator', false),
  (:'solo_ws', 'Orphan with one full member', :'creator', false),
  (:'healthy_solo_ws', 'Legacy CMS manager floor', :'creator', false);

delete from public.workspace_members
where ws_id in (:'ws', :'default_ws', :'solo_ws', :'healthy_solo_ws') and user_id = :'creator';

insert into public.workspace_members (ws_id, user_id, type) values
  (:'ws', :'member', 'MEMBER'), (:'ws', :'cms_member', 'MEMBER'),
  (:'ws', :'guest', 'GUEST'), (:'default_ws', :'member', 'MEMBER'),
  (:'default_ws', :'cms_member', 'MEMBER'), (:'solo_ws', :'member', 'MEMBER'),
  (:'solo_ws', :'guest', 'GUEST'), (:'healthy_solo_ws', :'cms_member', 'MEMBER'),
  (:'root_ws', :'cms_member', 'MEMBER');

insert into public.workspace_roles (id, ws_id, name) values
  (:'local_role', :'ws', 'Repairable role'), (:'root_role', :'root_ws', 'CMS operator'),
  (:'solo_role', :'healthy_solo_ws', 'Legacy manager role');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  (:'root_ws', :'root_role', 'manage_external_projects', true),
  (:'healthy_solo_ws', :'solo_role', 'manage_workspace_members', true);

insert into public.workspace_role_members (role_id, user_id) values
  (:'local_role', :'member'), (:'root_role', :'cms_member'), (:'solo_role', :'cms_member');

select ok(not private.workspace_has_member_manager(:'ws'), 'the fixture starts without a manager');
select is(private.workspace_lost_member_manager(:'ws', flag), true,
  'the postcondition ignores the compatibility flag ' || coalesce(flag::text, 'null'))
from (values (false), (true), (null::boolean)) flags(flag);

select is(public.remove_workspace_member_guarded_in_mode(:'ws', :'member', :'creator', 'workspace'),
  'last_manager', 'a workspace actor cannot remove someone else while full members would remain without a manager');
select is(public.remove_workspace_member_guarded(:'ws', :'member', :'cms_member'),
  'last_manager', 'a legacy CMS actor cannot remove someone else from an already-managerless workspace');
select is((select count(*) from public.workspace_members where ws_id = :'ws' and type = 'MEMBER'), 2::bigint,
  'refused member removals retain both full memberships');

select is(public.remove_workspace_role_member_guarded_in_mode(:'ws', :'local_role', :'member', :'creator', 'workspace'),
  'last_manager', 'role-member removal refuses an already-managerless workspace');
select is(public.remove_workspace_role_member_guarded(:'ws', :'local_role', :'member', :'cms_member'),
  'last_manager', 'legacy CMS role-member removal refuses an already-managerless workspace');
select is(public.delete_workspace_role_guarded(:'ws', :'local_role', :'creator', 'workspace'),
  'last_manager', 'role deletion refuses an already-managerless workspace');
select ok(exists (select 1 from public.workspace_roles where id = :'local_role')
  and exists (select 1 from public.workspace_role_members where role_id = :'local_role' and user_id = :'member'),
  'refused role reducers retain the role and its assignment');

select is(private.update_workspace_role_guarded(:'ws', :'local_role', :'creator', 'workspace', :'other_grant', 'Must roll back'),
  'last_manager', 'a role edit that does not restore a manager is refused');
select is((select name from public.workspace_roles where id = :'local_role'), 'Repairable role',
  'the refused role edit rolls back metadata');
select is((select count(*) from public.workspace_role_permissions where role_id = :'local_role'),
  0::bigint, 'the refused role edit rolls back grants');

select is(private.update_workspace_default_permissions_guarded(:'ws', :'creator', 'workspace', 'GUEST', :'manager_grant'),
  'last_manager', 'a guest-default grant cannot repair an already-managerless workspace');
select is((select count(*) from public.workspace_default_permissions where ws_id = :'ws'
    and member_type = 'GUEST' and permission = 'manage_workspace_members'), 0::bigint,
  'the refused default edit rolls back the new row');

select is(public.reduce_external_app_workspace_admin_guarded(:'ws', :'member', true, :'cms_member'),
  'forbidden', 'an external app cannot reduce access without a full member-manager actor');
select is((select count(*) from public.workspace_default_permissions where ws_id = :'ws'
    and permission in ('manage_workspace_members', 'manage_workspace_roles')), 0::bigint,
  'external-app refusal writes no default rows');

select is(public.remove_workspace_member_guarded_in_mode(:'ws', :'member', :'member', 'workspace'),
  'removed', 'workspace self-departure is allowed from an already-managerless workspace');
select ok(exists (select 1 from public.workspace_members
    where ws_id = :'ws' and user_id = :'cms_member' and type = 'MEMBER'),
  'workspace self-departure may leave another full member in an already-managerless workspace');

insert into public.workspace_members (ws_id, user_id, type) values (:'ws', :'member', 'MEMBER');
insert into public.workspace_role_members (role_id, user_id) values (:'local_role', :'member');

select is(public.remove_workspace_member_guarded(:'ws', :'cms_member', :'cms_member'),
  'removed', 'legacy CMS self-departure is allowed from an already-managerless workspace');
select ok(exists (select 1 from public.workspace_members
    where ws_id = :'ws' and user_id = :'member' and type = 'MEMBER'),
  'legacy CMS self-departure may leave another full member in an already-managerless workspace');

select is(public.remove_workspace_member_guarded_in_mode(:'ws', :'guest', :'guest', 'workspace'),
  'removed', 'a guest may leave an already-managerless workspace');

select is(public.remove_workspace_member_guarded_in_mode(:'solo_ws', :'member', :'creator', 'workspace'),
  'removed', 'an authorized removal can leave zero full members in an already-managerless workspace');
select is((select count(*) from public.workspace_members where ws_id = :'solo_ws' and type = 'MEMBER'),
  0::bigint, 'the remaining guest does not count as a full member');

select is(private.update_workspace_role_guarded(:'ws', :'local_role', :'creator', 'workspace', :'manager_grant'),
  'updated', 'granting member management to an assigned role repairs a workspace');
select ok(private.workspace_has_member_manager(:'ws', :'member'), 'the role edit restores a member manager');
insert into public.workspace_members (ws_id, user_id, type) values (:'ws', :'cms_member', 'MEMBER');
select is(public.remove_workspace_member_guarded_in_mode(:'ws', :'member', :'member', 'workspace'),
  'last_manager', 'the last member manager cannot leave while other full members remain');

delete from public.workspace_role_members where role_id = :'local_role' and user_id = :'member';
insert into public.workspace_role_members (role_id, user_id) values (:'local_role', :'cms_member');
select is(public.remove_workspace_member_guarded(:'ws', :'cms_member', :'cms_member'),
  'last_manager', 'legacy CMS refuses self-departure of the last member manager while other full members remain');
select is(public.remove_workspace_member_guarded(:'healthy_solo_ws', :'cms_member', :'cms_member'),
  'last_manager', 'legacy CMS retains its stricter rule for loss of a sole-member manager');
select is(public.remove_workspace_role_member_guarded(:'healthy_solo_ws', :'solo_role', :'cms_member', :'cms_member'),
  'last_manager', 'legacy CMS retains the role grant of a sole-member manager');
select is(public.remove_workspace_member_guarded_in_mode(:'healthy_solo_ws', :'cms_member', :'cms_member', 'workspace'),
  'removed', 'workspace mode allows the last full member and manager to self-depart');

select is(private.update_workspace_default_permissions_guarded(:'default_ws', :'creator', 'workspace', 'MEMBER', :'manager_grant'),
  'updated', 'enabling MEMBER defaults repairs an already-managerless workspace');
select ok(private.workspace_has_member_manager(:'default_ws'), 'the default edit restores member managers');

select * from finish();
rollback;
