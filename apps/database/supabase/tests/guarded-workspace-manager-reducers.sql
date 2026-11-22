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
  ('private.update_workspace_role_guarded(uuid,uuid,uuid,text,jsonb,text)'),
  ('private.update_workspace_default_permissions_guarded(uuid,uuid,text,public.workspace_member_type,jsonb)'),
  ('private.account_deletion_blocking_workspaces(uuid)')
) f(signature)
left join pg_proc p on p.oid = to_regprocedure(f.signature);

select gen_random_uuid() as ws, gen_random_uuid() as foreign_ws,
  gen_random_uuid() as empty_ws, gen_random_uuid() as solo_ws,
  gen_random_uuid() as owner, gen_random_uuid() as manager, gen_random_uuid() as plain,
  gen_random_uuid() as guest, gen_random_uuid() as role_actor, gen_random_uuid() as cms_actor,
  gen_random_uuid() as root_actor, gen_random_uuid() as outsider, gen_random_uuid() as missing,
  gen_random_uuid() as floor_role, gen_random_uuid() as local_role,
  gen_random_uuid() as root_role, gen_random_uuid() as foreign_role, gen_random_uuid() as editor_role,
  gen_random_uuid() as protected_role, gen_random_uuid() as empty_role,
  '[{"id":"manage_workspace_members","enabled":false},{"id":"manage_workspace_roles","enabled":true}]' as reduce_grants,
  '[{"id":"manage_subscription","enabled":true},{"id":"manage_mastermind","enabled":true},{"id":"operate_mira_channels","enabled":true}]' as protected_grants,
  '00000000-0000-0000-0000-000000000000'::uuid as root_ws
\gset

insert into auth.users (id, email)
select id, id || '@example.test'
from unnest(array[:'owner', :'manager', :'plain', :'guest', :'role_actor',
  :'cms_actor', :'root_actor', :'outsider']::uuid[]) f(id);

insert into public.workspaces (id, name, creator_id, personal) values
  (:'ws', 'Shared floor', :'owner', false),
  (:'foreign_ws', 'Other workspace', :'outsider', false),
  (:'empty_ws', 'Guest workspace', :'owner', false),
  (:'solo_ws', 'One full member', :'owner', false);

delete from public.workspace_members
where ws_id in (:'ws', :'empty_ws', :'solo_ws') and user_id = :'owner';

insert into public.workspace_members (ws_id, user_id, type) values
  (:'ws', :'manager', 'MEMBER'), (:'ws', :'plain', 'MEMBER'),
  (:'ws', :'role_actor', 'MEMBER'), (:'ws', :'cms_actor', 'MEMBER'),
  (:'ws', :'guest', 'GUEST'), (:'empty_ws', :'guest', 'GUEST'),
  (:'solo_ws', :'manager', 'MEMBER'), (:'solo_ws', :'guest', 'GUEST'),
  (:'root_ws', :'root_actor', 'MEMBER');

insert into public.workspace_roles (id, ws_id, name) values
  (:'floor_role', :'ws', 'Floor role'), (:'local_role', :'ws', 'CMS editor role'),
  (:'editor_role', :'ws', 'Role-only editor'),
  (:'foreign_role', :'foreign_ws', 'Foreign role'), (:'empty_role', :'empty_ws', 'Empty role'),
  (:'root_role', :'root_ws', 'CMS operator'), (:'protected_role', :'root_ws', 'Protected role');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  (:'ws', :'floor_role', 'manage_workspace_members', true),
  (:'ws', :'floor_role', 'manage_subscription', false),
  (:'ws', :'local_role', 'manage_workspace_roles', true),
  (:'ws', :'local_role', 'edit_external_projects', true),
  (:'ws', :'editor_role', 'manage_workspace_roles', true),
  (:'foreign_ws', :'foreign_role', 'admin', true),
  (:'root_ws', :'root_role', 'manage_external_projects', true);

insert into public.workspace_role_members (role_id, user_id) values
  (:'floor_role', :'manager'), (:'local_role', :'cms_actor'), (:'editor_role', :'role_actor'),
  (:'foreign_role', :'outsider'), (:'root_role', :'root_actor');

insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled) values
  (:'ws', 'GUEST', 'manage_workspace_roles', true),
  (:'solo_ws', 'MEMBER', 'manage_workspace_members', true);

create temp table editor_actors (label text, actor uuid, ws_allowed boolean, cms_allowed boolean);
insert into editor_actors values
  ('creator outside membership', :'owner', true, true),
  ('roles-only editor', :'role_actor', true, false),
  ('local CMS editor', :'cms_actor', true, true),
  ('root CMS editor without a target membership', :'root_actor', false, true),
  ('guest with target role permission', :'guest', true, false),
  ('member manager without role permission', :'manager', false, false),
  ('plain full member', :'plain', false, false),
  ('foreign workspace admin', :'outsider', false, false),
  ('null actor', null, false, false);

select is(private.update_workspace_role_guarded(:'ws', :'local_role', actor, mode, '[]'),
  case when allowed then 'updated' else 'forbidden' end, coalesce(mode, '<null>') || ' role editor / ' || label)
from editor_actors
cross join lateral (values ('workspace', ws_allowed), ('cms', cms_allowed),
  ('external_app', false), ('unknown', false), (null, false)) modes(mode, allowed);

select is(private.update_workspace_default_permissions_guarded(:'ws', actor, mode, 'GUEST', '[]'),
  case when allowed then 'updated' else 'forbidden' end, coalesce(mode, '<null>') || ' defaults editor / ' || label)
from editor_actors
cross join lateral (values ('workspace', ws_allowed), ('cms', cms_allowed),
  ('external_app', false), ('unknown', false), (null, false)) modes(mode, allowed);

select is(private.update_workspace_role_guarded(:'ws', :'foreign_role', :'root_actor', 'cms', '[]'),
  'not_found', 'root CMS authority cannot edit a role belonging to another workspace');
select is(private.update_workspace_default_permissions_guarded(:'missing', :'root_actor', 'cms', 'MEMBER', '[]'),
  'not_found', 'root CMS authority cannot edit defaults for a missing workspace');

select is(private.update_workspace_role_guarded(:'ws', :'floor_role', :'cms_actor', 'workspace', '[]', 'Rename'),
  'creator_protected', 'a role editor cannot rename a role holding a disabled subscription grant');
select is(private.update_workspace_role_guarded(:'ws', :'floor_role', :'owner', 'workspace', :'reduce_grants', 'Must roll back'),
  'last_manager', 'workspace role edit cannot remove the last manager');
select is(private.update_workspace_role_guarded(:'ws', :'floor_role', :'root_actor', 'cms', :'reduce_grants'),
  'last_manager', 'CMS role edit cannot remove the last manager');
select is((select name from workspace_roles where id = :'floor_role'), 'Floor role',
  'the refused edit restores the role name');
select ok((select enabled from workspace_role_permissions
    where role_id = :'floor_role' and permission = 'manage_workspace_members')
  and not exists (select 1 from workspace_role_permissions
    where role_id = :'floor_role' and permission = 'manage_workspace_roles'),
  'the refused edit restores the old grant and removes the newly inserted grant');

select is(private.update_workspace_role_guarded(:'ws', :'floor_role', :'cms_actor', 'workspace', :'protected_grants'),
  'updated', 'filtered protected permissions allow the same no-op save as the editor');
select ok(not exists (select 1 from workspace_role_permissions where role_id = :'floor_role'
    and permission in ('manage_subscription', 'manage_mastermind', 'operate_mira_channels') and enabled),
  'a noncreator cannot change the subscription grant or explicit grants');
select is(private.update_workspace_role_guarded(:'ws', :'floor_role', :'owner', 'workspace', :'protected_grants', 'Creator rename'),
  'updated', 'creator can rename the role and edit its subscription grant');
select ok((select enabled from workspace_role_permissions
    where role_id = :'floor_role' and permission = 'manage_subscription')
  and not exists (select 1 from workspace_role_permissions where role_id = :'floor_role'
    and permission in ('manage_mastermind', 'operate_mira_channels')),
  'a creator save applies the subscription grant and preserves explicit grants');

delete from private.mastermind_access_role;
insert into private.mastermind_access_role (role_id) values (:'protected_role');
select is(private.update_workspace_role_guarded(:'root_ws', :'protected_role', :'root_actor', 'cms', '[]', 'Rename'),
  'role_protected', 'the recorded Mastermind role cannot be renamed');

select is(private.update_workspace_default_permissions_guarded(:'ws', :'guest', 'workspace', 'GUEST', :'protected_grants'),
  'updated', 'guest role authority can save filtered default permissions');
select ok(not exists (select 1 from workspace_default_permissions where ws_id = :'ws'
    and member_type = 'GUEST' and permission in ('manage_subscription', 'manage_mastermind', 'operate_mira_channels')),
  'a guest actor cannot write creator-only or explicit default grants');

insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
values (:'ws', 'MEMBER', 'manage_workspace_members', true);
select is(private.update_workspace_role_guarded(:'ws', :'floor_role', :'owner', 'workspace', :'reduce_grants', 'Allowed'),
  'updated', 'role reduction is allowed while default managers remain');
select is((select name from workspace_roles where id = :'floor_role'), 'Allowed',
  'successful edit commits the role name alongside the grants');
select is(private.update_workspace_default_permissions_guarded(:'ws', :'guest', 'workspace', 'MEMBER', :'reduce_grants'),
  'last_manager', 'workspace defaults cannot eliminate the last manager');
select is(private.update_workspace_default_permissions_guarded(:'ws', :'root_actor', 'cms', 'MEMBER', :'reduce_grants'),
  'last_manager', 'CMS defaults cannot eliminate the last manager');
select ok((select enabled from workspace_default_permissions
    where ws_id = :'ws' and member_type = 'MEMBER' and permission = 'manage_workspace_members')
  and not exists (select 1 from workspace_default_permissions
    where ws_id = :'ws' and member_type = 'MEMBER' and permission = 'manage_workspace_roles'),
  'both the old and newly inserted default grants roll back after refusal');

select is(private.update_workspace_role_guarded(:'empty_ws', :'empty_role', :'owner', 'workspace', :'reduce_grants'),
  'updated', 'a role save is allowed while no full member exists');
select is(private.update_workspace_default_permissions_guarded(:'empty_ws', :'owner', 'workspace', 'MEMBER', :'reduce_grants'),
  'updated', 'a default save is allowed while no full member exists');
select is(private.update_workspace_default_permissions_guarded(:'empty_ws', :'owner', 'workspace', 'GUEST', :'protected_grants'),
  'updated', 'the creator can edit default subscription permission');
select ok((select enabled from workspace_default_permissions
    where ws_id = :'empty_ws' and member_type = 'GUEST' and permission = 'manage_subscription')
  and not exists (select 1 from workspace_default_permissions where ws_id = :'empty_ws'
    and permission in ('manage_mastermind', 'operate_mira_channels')),
  'creator defaults apply subscription permission alone');

-- Move the workspace from default managers to one role manager.
update public.workspace_role_permissions set enabled = true
where role_id = :'floor_role' and permission = 'manage_workspace_members';
update public.workspace_default_permissions set enabled = false
where ws_id = :'ws' and member_type = 'MEMBER' and permission = 'manage_workspace_members';

select is(remove_workspace_member_guarded_in_mode(:'ws', :'plain', :'plain', 'cms', true),
  'forbidden', 'a plain member cannot use CMS to bypass its authority check');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'plain', :'plain', 'external_app', true),
  'forbidden', 'a plain member cannot use external-app mode to bypass its authority check');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'guest', :'plain', 'workspace', true),
  'forbidden', 'an ordinary member cannot remove someone else');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'outsider', :'outsider', 'workspace', true),
  'forbidden', 'an outsider cannot self-remove from a workspace they never joined');
select is(remove_workspace_member_guarded_in_mode(:'ws', :'plain', :'plain', 'workspace'),
  'removed', 'an ordinary full member can leave with the default switch');
select is(remove_workspace_member_guarded_in_mode(:'empty_ws', :'guest', :'guest', 'workspace', true),
  'removed', 'a guest without member-management permission can leave');

select is(remove_workspace_member_guarded_in_mode(:'ws', :'manager', :'manager', 'workspace', true),
  'last_manager', 'a sole manager cannot leave while other full members remain');
select is(remove_workspace_member_guarded_in_mode(:'solo_ws', :'manager', :'manager', 'workspace', true),
  'removed', 'the sole full member and manager can leave a workspace with guests');

-- A legacy personal workspace with two full members exercises the exclusion
-- independently of the single-member exception.
alter table public.workspace_members disable trigger trg_enforce_personal_workspace_single_member;
alter table public.workspace_members disable trigger trg_enforce_personal_ws_member_limit;
insert into public.workspace_members (ws_id, user_id, type)
select w.id, :'plain', 'MEMBER' from public.workspaces w
where w.creator_id = :'manager' and w.personal is true;
alter table public.workspace_members enable trigger trg_enforce_personal_workspace_single_member;
alter table public.workspace_members enable trigger trg_enforce_personal_ws_member_limit;
select ok(exists (select 1 from public.workspaces w join public.workspace_members wm on wm.ws_id = w.id
    where w.creator_id = :'manager' and w.personal is true and wm.user_id = :'plain'),
  'personal-workspace exclusion fixture includes another full member');

select results_eq(
  format('select ws_id, ws_name from private.account_deletion_blocking_workspaces(%L)', :'manager'),
  format('values (%L::uuid, %L::text)', :'ws', 'Shared floor'),
  'account preflight names only the shared workspace with no other manager');
select is((select count(*) from private.account_deletion_blocking_workspaces(:'guest')), 0::bigint,
  'a guest is not a blocking full member manager');
select is((select count(*) from private.account_deletion_blocking_workspaces(null)), 0::bigint,
  'a missing actor does not disclose workspace names');

insert into public.workspace_members (ws_id, user_id, type)
values (:'solo_ws', :'manager', 'MEMBER');
select is((select count(*) from private.account_deletion_blocking_workspaces(:'manager')
  where ws_id = :'solo_ws'), 0::bigint,
  'an account with no other full member can be deleted');
select is((select count(*) from private.account_deletion_blocking_workspaces(:'outsider')), 0::bigint,
  'a sole creator with no other full member can be deleted');

insert into public.workspace_members (ws_id, user_id, type)
values (:'foreign_ws', :'plain', 'MEMBER');
select results_eq(
  format('select ws_id, ws_name from private.account_deletion_blocking_workspaces(%L)', :'outsider'),
  format('values (%L::uuid, %L::text)', :'foreign_ws', 'Other workspace'),
  'the full-member creator counts as a manager');

update public.workspace_default_permissions set enabled = true
where ws_id = :'ws' and member_type = 'MEMBER' and permission = 'manage_workspace_members';
select is((select count(*) from private.account_deletion_blocking_workspaces(:'manager')), 0::bigint,
  'another manager via MEMBER defaults clears the account refusal');

select * from finish();
rollback;
