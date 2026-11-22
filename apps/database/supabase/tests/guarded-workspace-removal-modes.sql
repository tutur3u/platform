begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local request.jwt.claims = '{"role":"service_role"}';
select no_plan();

select ok(
  p.prosecdef
    and p.proconfig = array['search_path=pg_catalog, pg_temp']
    and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('authenticated', p.oid, 'execute')
    and has_function_privilege('service_role', p.oid, 'execute'),
  signature || ' is a service-only definer with pinned search path'
)
from (values
  ('public.remove_workspace_member_guarded_in_mode(uuid,uuid,uuid,text,boolean)'),
  ('public.remove_workspace_role_member_guarded_in_mode(uuid,uuid,uuid,uuid,text,boolean)'),
  ('public.delete_workspace_role_guarded(uuid,uuid,uuid,text)'),
  ('public.reduce_external_app_workspace_admin_guarded(uuid,uuid,boolean,uuid)')
) f(signature)
left join pg_proc p on p.oid = to_regprocedure(f.signature);

select
  gen_random_uuid() as ws, gen_random_uuid() as other_ws, gen_random_uuid() as solo_ws,
  gen_random_uuid() as creator, gen_random_uuid() as admin, gen_random_uuid() as members_only,
  gen_random_uuid() as roles_only, gen_random_uuid() as plain, gen_random_uuid() as local_cms,
  gen_random_uuid() as root_cms, gen_random_uuid() as guest, gen_random_uuid() as guest_ungranted,
  gen_random_uuid() as foreign_actor, gen_random_uuid() as missing,
  gen_random_uuid() as admin_role, gen_random_uuid() as members_role, gen_random_uuid() as roles_role,
  gen_random_uuid() as cms_role, gen_random_uuid() as root_role, gen_random_uuid() as empty_role,
  gen_random_uuid() as other_role, gen_random_uuid() as solo_role, '00000000-0000-0000-0000-000000000000'::uuid as root_ws
\gset

insert into auth.users (id, email)
select id, id || '@example.test'
from unnest(array[:'creator', :'admin', :'members_only', :'roles_only', :'plain', :'local_cms',
  :'root_cms', :'guest', :'guest_ungranted', :'foreign_actor']::uuid[]) as f(id);

insert into public.workspaces (id, name, creator_id, personal) values
  (:'ws', 'Removal mode target', :'creator', false),
  (:'other_ws', 'Removal mode foreign target', :'foreign_actor', false),
  (:'solo_ws', 'Removal mode guest-only result', :'creator', false);

delete from public.workspace_members where ws_id in (:'ws', :'solo_ws') and user_id = :'creator';

insert into public.workspace_members (ws_id, user_id, type)
select :'ws', id, 'MEMBER' from unnest(array[:'admin', :'members_only', :'roles_only', :'plain', :'local_cms']::uuid[]) as f(id);

insert into public.workspace_members (ws_id, user_id, type) values
  (:'root_ws', :'root_cms', 'MEMBER'),
  (:'ws', :'guest', 'GUEST'), (:'other_ws', :'guest_ungranted', 'GUEST'),
  (:'solo_ws', :'guest', 'GUEST'), (:'solo_ws', :'plain', 'MEMBER');

insert into public.workspace_roles (id, ws_id, name) values
  (:'admin_role', :'ws', 'Removal broad admin'), (:'members_role', :'ws', 'Removal member manager'),
  (:'roles_role', :'ws', 'Removal role manager'), (:'cms_role', :'ws', 'Removal CMS manager'),
  (:'root_role', :'root_ws', 'Removal CMS root admin'), (:'empty_role', :'ws', 'Removal empty role'),
  (:'other_role', :'other_ws', 'Removal other workspace role'), (:'solo_role', :'solo_ws', 'Removal last full member');

insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled) values
  (:'admin_role', :'ws', 'admin', true),
  (:'members_role', :'ws', 'manage_workspace_members', true),
  (:'roles_role', :'ws', 'manage_workspace_roles', true),
  (:'cms_role', :'ws', 'manage_workspace_members', true),
  (:'cms_role', :'ws', 'manage_workspace_roles', true),
  (:'cms_role', :'ws', 'edit_external_projects', true),
  (:'root_role', :'root_ws', 'manage_external_projects', true),
  (:'other_role', :'other_ws', 'admin', true);

insert into public.workspace_role_members (role_id, user_id) values
  (:'admin_role', :'admin'), (:'members_role', :'members_only'), (:'roles_role', :'roles_only'),
  (:'cms_role', :'local_cms'), (:'root_role', :'root_cms'), (:'other_role', :'foreign_actor'),
  (:'solo_role', :'plain');

insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled) values
  (:'ws', 'manage_workspace_members', 'GUEST', true), (:'ws', 'manage_workspace_roles', 'GUEST', true),
  (:'other_ws', 'manage_workspace_members', 'GUEST', false), (:'other_ws', 'manage_workspace_roles', 'GUEST', false),
  (:'solo_ws', 'manage_workspace_members', 'MEMBER', true);

create temp table removal_actors (label text, actor uuid, ws uuid, workspace_member boolean,
  workspace_role boolean, external_member boolean, external_roles boolean, cms boolean);
insert into removal_actors values
  ('creator outside membership', :'creator', :'ws', true, true, false, false, true),
  ('broad role admin', :'admin', :'ws', true, true, true, true, true),
  ('member management only', :'members_only', :'ws', true, false, true, false, false),
  ('role management only', :'roles_only', :'ws', false, true, false, false, false),
  ('plain full member', :'plain', :'ws', false, false, false, false, false),
  ('local CMS manager', :'local_cms', :'ws', true, true, true, true, true),
  ('root CMS administrator without target membership', :'root_cms', :'ws', false, false, false, false, true),
  ('guest with enabled defaults', :'guest', :'ws', true, true, false, false, false),
  ('guest with disabled defaults', :'guest_ungranted', :'other_ws', false, false, false, false, false),
  ('permission in another workspace only', :'foreign_actor', :'ws', false, false, false, false, false),
  ('null actor', null, :'ws', false, false, false, false, false);

-- The target does not exist. not_found shows authorization reached the lookup.
select is(remove_workspace_member_guarded_in_mode(ws, :'missing', actor, mode),
  case when allowed then 'not_found' else 'forbidden' end, mode || ' member removal / ' || label)
from removal_actors
cross join lateral (values ('workspace', workspace_member), ('external_app', external_member), ('cms', cms)) m(mode, allowed);

select is(remove_workspace_role_member_guarded_in_mode(ws, :'missing', :'missing', actor, mode),
  case when allowed then 'not_found' else 'forbidden' end, mode || ' role membership removal / ' || label)
from removal_actors
cross join lateral (values ('workspace', workspace_role), ('external_app', false), ('cms', cms)) m(mode, allowed);

select is(delete_workspace_role_guarded(ws, :'missing', actor, mode),
  case when allowed then 'not_found' else 'forbidden' end, mode || ' role delete / ' || label)
from removal_actors
cross join lateral (values ('workspace', workspace_role), ('external_app', false), ('cms', cms)) m(mode, allowed);

select is(reduce_external_app_workspace_admin_guarded(ws, actor, false, :'missing'),
  case when external_roles then 'not_found' else 'forbidden' end, 'external_app demotion / ' || label)
from removal_actors;

select is(remove_workspace_member_guarded_in_mode(:'ws', :'plain', :'creator', 'unknown'),
  'forbidden', 'unknown member mode is refused');
select is(remove_workspace_role_member_guarded_in_mode(:'ws', :'admin_role', :'admin', :'creator', null),
  'forbidden', 'null role member mode is refused');
select is(delete_workspace_role_guarded(:'ws', :'empty_role', :'creator', 'unknown'),
  'forbidden', 'unknown role delete mode is refused');
select is(remove_workspace_member_guarded_in_mode(:'missing', :'plain', :'creator', 'workspace'),
  'not_found', 'missing workspace does not remove anything');
select is(remove_workspace_member_guarded_in_mode(:'missing', :'plain', :'creator', 'unknown'),
  'forbidden', 'unknown member mode is refused even if the workspace is missing');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'creator', :'admin', 'external_app'),
  'creator_protected', 'external member removal protects the creator without a membership');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'admin', :'admin', 'external_app', true),
  'self_protected', 'external member removal prohibits self-removal');
select is(remove_workspace_role_member_guarded_in_mode(:'ws', :'admin_role', :'plain', :'admin', 'workspace'),
  'not_found', 'a missing role membership is distinguished from an actual removal');
select is(delete_workspace_role_guarded(:'ws', :'other_role', :'creator', 'workspace'),
  'not_found', 'a role from a different workspace is invisible to the delete');
select ok(exists (select 1 from workspace_roles where id = :'other_role'), 'foreign role is untouched');

select is(remove_workspace_member_guarded_in_mode(:'ws', :'foreign_actor', :'local_cms', 'cms'),
  'not_found', 'a CMS member removal is workspace scoped');
select is(remove_workspace_role_member_guarded_in_mode(:'ws', :'members_role', :'members_only', :'local_cms', 'cms'),
  'removed', 'a CMS member manager with role authority can remove a backed-up role grant');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'local_cms', :'admin', 'external_app'),
  'removed', 'external member removal retains another external admin');
select is(delete_workspace_role_guarded(:'ws', :'empty_role', :'root_cms', 'cms'),
  'removed', 'CMS root admin can delete a role nobody depends on');
select ok(not exists (select 1 from workspace_roles where id = :'empty_role'), 'unused role disappears');

select is(delete_workspace_role_guarded(:'ws', :'admin_role', :'root_cms', 'cms'), 'last_manager',
  'role deletion rolls back when the role carries the last member-manager grants');
select ok(exists (select 1 from workspace_roles where id = :'admin_role')
  and exists (select 1 from workspace_role_members where role_id = :'admin_role' and user_id = :'admin')
  and exists (select 1 from workspace_role_permissions where role_id = :'admin_role' and permission = 'admin'),
  'role, membership and permission are retained after a refusal');
select is(remove_workspace_role_member_guarded_in_mode(:'ws', :'admin_role', :'admin', :'roles_only', 'workspace'),
  'last_manager', 'workspace role manager cannot remove the last member-manager role membership');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'admin', :'guest', 'workspace'),
  'last_manager', 'an authorized guest cannot remove the last full member manager while members remain');
select ok(exists (select 1 from workspace_members where ws_id = :'ws' and user_id = :'admin')
  and exists (select 1 from workspace_role_members where role_id = :'admin_role' and user_id = :'admin'),
  'refused member removal restores its cascading role memberships');

select is(remove_workspace_member_guarded_in_mode(:'ws', :'admin', :'admin', 'workspace', true),
  'last_manager', 'the manager floor guards a manager leaving');
select is(remove_workspace_role_member_guarded_in_mode(:'ws', :'admin_role', :'admin', :'admin', 'workspace', true),
  'last_manager', 'the manager floor guards self-removal from a role');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'admin', :'admin', 'cms'),
  'last_manager', 'CMS guards a manager leaving');
select is(remove_workspace_role_member_guarded_in_mode(:'ws', :'admin_role', :'admin', :'admin', 'cms', false),
  'last_manager', 'CMS guards self-removal from an access level');

select is(remove_workspace_member_guarded_in_mode(:'solo_ws', :'plain', :'plain', 'workspace'),
  'removed', 'the last full member can leave a workspace with guests');
select is((select count(*) from workspace_members where ws_id = :'solo_ws' and type = 'MEMBER'), 0::bigint,
  'only guest rows remain after removal of the last full member');
select is((select count(*) from workspace_role_members wrm join workspace_roles wr on wr.id = wrm.role_id
  where wr.ws_id = :'solo_ws'), 0::bigint, 'no role memberships are stranded');

select is(reduce_external_app_workspace_admin_guarded(:'ws', :'admin', false, :'creator'),
  'creator_protected', 'external demotion protects the creator');
select is(reduce_external_app_workspace_admin_guarded(:'ws', :'admin', false, :'admin'),
  'self_protected', 'external demotion prohibits self-demotion');

-- Give the actor both capabilities through defaults while their durable role is
-- removed from the test setup. The target is the only role-based admin.
insert into public.workspace_role_members (role_id, user_id) values (:'admin_role', :'plain');
delete from public.workspace_role_members where role_id = :'admin_role' and user_id = :'admin';
insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled) values
  (:'ws', 'manage_workspace_members', 'MEMBER', true), (:'ws', 'manage_workspace_roles', 'MEMBER', true);

select is(reduce_external_app_workspace_admin_guarded(:'ws', :'admin', false, :'plain'),
  'default_admin_enabled', 'external demotion requires confirmation to disable default admin');
select is(reduce_external_app_workspace_admin_guarded(:'ws', :'admin', true, :'plain'),
  'last_manager', 'external demotion cannot remove a final role and default manager in one request');
select ok(exists (select 1 from workspace_role_members where role_id = :'admin_role' and user_id = :'plain')
  and 2 = (select count(*) from workspace_default_permissions
    where ws_id = :'ws' and member_type = 'MEMBER' and enabled
      and permission in ('manage_workspace_members', 'manage_workspace_roles')),
  'refused demotion rolls back both the role deletion and default permission changes');
select is(reduce_external_app_workspace_admin_guarded(:'ws', :'admin', true),
  'removed', 'external admin defaults can be disabled while a role admin remains');

-- A full member who only manages members satisfies the common manager floor
-- but is below the external app admin floor.
insert into public.workspace_role_members (role_id, user_id) values (:'members_role', :'members_only');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'plain', :'members_only', 'external_app'),
  'last_admin', 'external deletion cannot remove the last external admin even if a manager remains');
update public.workspace_default_permissions set enabled = true
where ws_id = :'ws' and member_type = 'MEMBER' and permission = 'manage_workspace_roles';
select is(reduce_external_app_workspace_admin_guarded(:'ws', :'members_only', false, :'plain'),
  'last_admin', 'external demotion preserves its distinct admin floor when a member manager remains');
select ok(exists (select 1 from workspace_role_members where role_id = :'admin_role' and user_id = :'plain'),
  'the external admin refusal leaves the admin role in place');
insert into public.workspace_role_members (role_id, user_id) values (:'roles_role', :'members_only');
select is(reduce_external_app_workspace_admin_guarded(:'ws', :'members_only', false, :'plain'),
  'removed', 'an external admin with split role grants can demote another admin atomically');
select is((select count(*) from workspace_role_members where role_id = :'admin_role'), 0::bigint,
  'successful external demotion removes the qualifying role membership');

select is(remove_workspace_role_member_guarded_in_mode(:'ws', :'members_role', :'members_only', :'members_only', 'workspace'),
  'last_manager', 'omitting the compatibility flag cannot bypass the role-membership floor');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'members_only', :'members_only', 'workspace'),
  'last_manager', 'omitting the compatibility flag cannot bypass the member floor');
select is(remove_workspace_role_member_guarded_in_mode(:'ws', :'members_role', :'members_only', :'members_only', 'workspace', flag),
  'last_manager', 'a sole manager cannot remove their own role with flag ' || coalesce(flag::text, 'null'))
from (values (false), (null::boolean)) flags(flag);
select is(remove_workspace_member_guarded_in_mode(:'ws', :'members_only', :'members_only', 'workspace', flag),
  'last_manager', 'a sole manager cannot leave with flag ' || coalesce(flag::text, 'null'))
from (values (false), (null::boolean)) flags(flag);

insert into public.workspace_role_members (role_id, user_id) values (:'members_role', :'roles_only');
select is(remove_workspace_role_member_guarded_in_mode(:'ws', :'members_role', :'members_only', :'members_only', 'workspace', false),
  'removed', 'a manager can drop their own grant after another member gains the permission');
insert into public.workspace_role_members (role_id, user_id) values (:'members_role', :'members_only');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'members_only', :'members_only', 'workspace'),
  'removed', 'a manager can leave after another member gains the permission');

delete from private.mastermind_access_role;
insert into private.mastermind_access_role (role_id) values (:'root_role');
select is(delete_workspace_role_guarded(:'root_ws', :'root_role', :'root_cms', 'cms'),
  'role_protected', 'the recorded Mastermind role cannot be deleted');

select * from finish();
rollback;
