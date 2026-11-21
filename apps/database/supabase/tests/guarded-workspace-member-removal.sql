begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local request.jwt.claims = '{"role":"service_role"}';

select plan(43);

select
  'dc216900-0000-4000-8000-000000000001'::uuid as creator,
  'dc216900-0000-4000-8000-000000000002'::uuid as manager_a,
  'dc216900-0000-4000-8000-000000000003'::uuid as manager_b,
  'dc216900-0000-4000-8000-000000000004'::uuid as guest,
  'dc216900-0000-4000-8000-000000000005'::uuid as outsider,
  'dc216900-0000-4000-8000-000000000010'::uuid as ws,
  'dc216900-0000-4000-8000-000000000011'::uuid as other_ws,
  'dc216900-0000-4000-8000-000000000012'::uuid as missing_ws,
  'dc216900-0000-4000-8000-000000000020'::uuid as manager_role,
  'dc216900-0000-4000-8000-000000000021'::uuid as foreign_role,
  'dc216900-0000-4000-8000-000000000022'::uuid as root_role,
  '00000000-0000-0000-0000-000000000000'::uuid as root_ws
\gset

insert into auth.users (id, email) values
  (:'creator', 'guarded-creator@example.test'),
  (:'manager_a', 'guarded-manager-a@example.test'),
  (:'manager_b', 'guarded-manager-b@example.test'),
  (:'guest', 'guarded-guest@example.test'),
  (:'outsider', 'guarded-outsider@example.test');

insert into public.workspaces (id, name, creator_id, personal) values
  (:'ws', 'Guarded membership test', :'creator', false),
  (:'other_ws', 'Foreign role workspace', :'creator', false);

-- Isolate explicit root role grants from the root seed defaults.
update public.workspace_default_permissions
set enabled = false
where ws_id = :'root_ws'
  and permission in ('admin', 'manage_external_projects', 'manage_workspace_roles');

insert into public.workspace_members (ws_id, user_id, type) values
  (:'ws', :'manager_a', 'MEMBER'),
  (:'ws', :'manager_b', 'MEMBER'),
  (:'ws', :'guest', 'GUEST'),
  (:'root_ws', :'outsider', 'MEMBER');

insert into public.workspace_roles (id, ws_id, name) values
  (:'manager_role', :'ws', 'Guarded manager'),
  (:'foreign_role', :'other_ws', 'Foreign role'),
  (:'root_role', :'root_ws', 'Guarded root operator');

insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled) values
  (:'manager_role', :'ws', 'manage_workspace_members', true);

insert into public.workspace_role_members (role_id, user_id) values
  (:'manager_role', :'manager_a'),
  (:'manager_role', :'manager_b'),
  (:'foreign_role', :'creator'),
  (:'root_role', :'outsider');

select is(
  has_function_privilege('anon', 'public.remove_workspace_member_guarded(uuid,uuid,uuid)', 'EXECUTE'),
  false,
  'anon cannot execute guarded member removal'
);
select is(
  has_function_privilege('authenticated', 'public.remove_workspace_member_guarded(uuid,uuid,uuid)', 'EXECUTE'),
  false,
  'authenticated cannot execute guarded member removal'
);
select is(
  has_function_privilege('service_role', 'public.remove_workspace_member_guarded(uuid,uuid,uuid)', 'EXECUTE'),
  true,
  'service_role can execute guarded member removal'
);
select is(
  has_function_privilege('anon', 'public.remove_workspace_role_member_guarded(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  false,
  'anon cannot execute guarded role member removal'
);
select is(
  has_function_privilege('authenticated', 'public.remove_workspace_role_member_guarded(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  false,
  'authenticated cannot execute guarded role member removal'
);
select is(
  has_function_privilege('service_role', 'public.remove_workspace_role_member_guarded(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  true,
  'service_role can execute guarded role member removal'
);

set local role service_role;

select is(
  public.remove_workspace_member_guarded(:'missing_ws', :'manager_a', null),
  'not_found',
  'member removal reports a missing workspace before authorization'
);
select is(
  public.remove_workspace_member_guarded(:'ws', :'manager_a', null),
  'forbidden',
  'member removal rejects a null actor'
);
select is(
  public.remove_workspace_member_guarded(:'ws', :'creator', :'outsider'),
  'forbidden',
  'member removal rejects an unrelated actor before checking the creator'
);
select is(
  public.remove_workspace_member_guarded(:'ws', :'creator', :'manager_a'),
  'forbidden',
  'a member with only manage_workspace_members cannot remove members'
);
reset role;
update public.workspace_role_permissions
set permission = 'manage_workspace_roles'
where role_id = :'manager_role';
set local role service_role;

select is(
  public.remove_workspace_role_member_guarded(:'ws', :'manager_role', :'manager_b', :'manager_a'),
  'forbidden',
  'a member with only manage_workspace_roles cannot remove role memberships'
);

reset role;
update public.workspace_role_permissions
set permission = 'edit_external_projects'
where role_id = :'manager_role';
set local role service_role;

select is(
  public.remove_workspace_member_guarded(:'ws', :'manager_b', :'manager_a'),
  'forbidden',
  'a member with studio read alone cannot remove members'
);
select is(
  public.remove_workspace_role_member_guarded(:'ws', :'manager_role', :'manager_b', :'manager_a'),
  'forbidden',
  'a member with studio read alone cannot remove role memberships'
);

reset role;
update public.workspace_role_permissions
set permission = 'manage_workspace_members'
where role_id = :'manager_role';
set local role service_role;
select is(
  public.remove_workspace_member_guarded(:'ws', :'creator', :'creator'),
  'creator_protected',
  'member removal protects the recorded creator'
);
select is(
  public.remove_workspace_member_guarded(:'ws', :'outsider', :'creator'),
  'not_found',
  'member removal reports no matching member'
);
select is(
  public.remove_workspace_member_guarded(:'ws', null, :'creator'),
  'not_found',
  'member removal reports no matching member for a null target'
);
select is(
  public.remove_workspace_role_member_guarded(:'missing_ws', :'manager_role', :'manager_a', null),
  'not_found',
  'role removal reports a missing workspace before authorization'
);
select is(
  public.remove_workspace_role_member_guarded(:'ws', :'manager_role', :'manager_a', null),
  'forbidden',
  'role removal rejects a null actor'
);
select is(
  public.remove_workspace_role_member_guarded(:'ws', :'manager_role', :'manager_a', :'outsider'),
  'forbidden',
  'role removal rejects an unrelated actor'
);
select is(
  public.remove_workspace_role_member_guarded(:'ws', :'foreign_role', :'creator', :'creator'),
  'not_found',
  'role removal rejects a role belonging to a different workspace'
);
select is(
  public.remove_workspace_role_member_guarded(:'ws', :'manager_role', :'outsider', :'creator'),
  'not_found',
  'role removal reports a missing role membership'
);
select is(
  public.remove_workspace_role_member_guarded(:'ws', null, :'manager_a', :'creator'),
  'not_found',
  'role removal reports a null role'
);

reset role;

-- An absent creator retains authorization but cannot satisfy the member invariant.
delete from public.workspace_members
where ws_id = :'ws' and user_id = :'creator';

insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled) values
  (:'ws', 'manage_workspace_members', 'GUEST', true),
  (:'ws', 'manage_workspace_roles', 'GUEST', true)
on conflict (ws_id, permission, member_type) do update set enabled = excluded.enabled;

insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
values (:'root_role', :'root_ws', 'manage_external_projects', true);

set local role service_role;

select is(
  public.remove_workspace_role_member_guarded(:'ws', :'manager_role', :'manager_b', :'guest'),
  'forbidden',
  'a guest with only management defaults cannot remove role memberships'
);
select is(
  public.remove_workspace_member_guarded(:'ws', :'manager_a', :'guest'),
  'forbidden',
  'a guest with only management defaults cannot remove members'
);

reset role;

insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
values (:'ws', 'publish_external_projects', 'GUEST', true);

select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', :'guest')::text, true);
set local role authenticated;
select count(*) as cookie_guest_rows from public.workspace_members
where ws_id = :'ws' and user_id = :'guest'
\gset
reset role;
set local request.jwt.claims = '{"role":"service_role"}';

select is(:'cookie_guest_rows'::bigint, 0::bigint, 'the cookie permission path cannot read a guest membership');
set local role service_role;

select is(
  public.remove_workspace_role_member_guarded(:'ws', :'manager_role', :'manager_b', :'guest'),
  'forbidden',
  'guest studio and management defaults cannot bypass the credential paths'
);
select is(
  public.remove_workspace_role_member_guarded(:'ws', :'manager_role', :'manager_b', :'outsider'),
  'removed',
  'a non-member root admin can remove the second-to-last manager role'
);

reset role;

delete from public.workspace_role_permissions where role_id = :'manager_role';
insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
values (:'manager_role', :'ws', 'admin', true);

set local role service_role;

select is(
  public.remove_workspace_role_member_guarded(:'ws', :'manager_role', :'manager_a', :'outsider'),
  'last_manager',
  'a non-member root admin cannot remove the sole manager whose role grants only admin'
);
select ok(
  exists (select 1 from public.workspace_role_members where role_id = :'manager_role' and user_id = :'manager_a'),
  'the refused role removal rolls back the role deletion'
);
select is(
  public.remove_workspace_member_guarded(:'ws', :'manager_a', :'outsider'),
  'last_manager',
  'root access cannot remove the final full member manager'
);
select ok(
  exists (select 1 from public.workspace_members where ws_id = :'ws' and user_id = :'manager_a'),
  'the refused member removal restores the member row'
);
select ok(
  exists (select 1 from public.workspace_role_members where role_id = :'manager_role' and user_id = :'manager_a'),
  'the refused member removal also restores the trigger-deleted role row'
);

reset role;

update public.workspace_role_permissions
set permission = 'manage_workspace_roles'
where role_id = :'root_role';

insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
values (:'ws', 'manage_workspace_members', 'MEMBER', true);

insert into public.workspace_members (ws_id, user_id, type)
values (:'root_ws', :'guest', 'GUEST');
insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
values (:'root_ws', 'manage_external_projects', 'GUEST', true)
on conflict (ws_id, permission, member_type) do update set enabled = excluded.enabled;

set local role service_role;

select is(
  public.remove_workspace_member_guarded(:'other_ws', :'creator', :'guest'),
  'creator_protected',
  'a root guest default authorizes the member bootstrap without target membership'
);
select is(
  public.remove_workspace_role_member_guarded(:'other_ws', :'foreign_role', :'creator', :'guest'),
  'forbidden',
  'a root guest default cannot authorize role removal without target membership'
);
reset role;
insert into public.workspace_members (ws_id, user_id, type)
values (:'other_ws', :'guest', 'MEMBER');
set local role service_role;

select is(
  public.remove_workspace_role_member_guarded(:'other_ws', :'foreign_role', :'creator', :'guest'),
  'removed',
  'a root guest default and target membership authorize role removal'
);
reset role;
savepoint root_guest_admin_default;

update public.workspace_default_permissions
set enabled = false
where ws_id = :'root_ws' and member_type = 'GUEST';
insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
values (:'root_ws', 'admin', 'GUEST', true)
on conflict (ws_id, permission, member_type) do update set enabled = excluded.enabled;
delete from public.workspace_members where ws_id = :'other_ws' and user_id = :'guest';
insert into public.workspace_members (ws_id, user_id, type)
values (:'other_ws', :'manager_b', 'MEMBER');
insert into public.workspace_role_members (role_id, user_id)
values (:'foreign_role', :'creator');

set local role service_role;

select is(
  public.remove_workspace_member_guarded(:'other_ws', :'manager_b', :'guest'),
  'removed',
  'root GUEST admin alone permits member removal without target membership'
);
select is(
  public.remove_workspace_role_member_guarded(:'other_ws', :'foreign_role', :'creator', :'guest'),
  'forbidden',
  'root GUEST admin alone cannot remove role memberships without target membership'
);

reset role;
insert into public.workspace_members (ws_id, user_id, type)
values (:'other_ws', :'guest', 'MEMBER');
set local role service_role;

select is(
  public.remove_workspace_role_member_guarded(:'other_ws', :'foreign_role', :'creator', :'guest'),
  'removed',
  'root GUEST admin alone permits role membership removal with target membership'
);

reset role;
rollback to savepoint root_guest_admin_default;
release savepoint root_guest_admin_default;
set local role service_role;

select is(
  public.remove_workspace_member_guarded(:'ws', :'manager_a', :'outsider'),
  'removed',
  'root role-management permission permits member removal with a remaining default manager'
);
select ok(
  not exists (select 1 from public.workspace_role_members where role_id = :'manager_role' and user_id = :'manager_a'),
  'successful member removal deletes the departed member role'
);
select is(
  public.remove_workspace_member_guarded(:'ws', :'manager_b', :'creator'),
  'last_manager',
  'the sole default manager is protected even without a role'
);

reset role;

delete from public.workspace_default_permissions
where ws_id = :'ws' and permission = 'manage_workspace_members' and member_type = 'MEMBER';

insert into public.workspace_roles (id, ws_id, name)
values ('dc216900-0000-4000-8000-000000000023', :'ws', 'Unprivileged role');

insert into public.workspace_role_members (role_id, user_id)
values ('dc216900-0000-4000-8000-000000000023', :'manager_b');

set local role service_role;

select is(
  public.remove_workspace_role_member_guarded(:'ws', 'dc216900-0000-4000-8000-000000000023', :'manager_b', :'creator'),
  'removed',
  'role removal is allowed in a workspace without a manager'
);
select is(
  public.remove_workspace_member_guarded(:'ws', :'manager_b', :'creator'),
  'removed',
  'member removal is allowed in a workspace without a manager'
);

reset role;
select * from finish();
rollback;
