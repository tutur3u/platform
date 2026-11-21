begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local request.jwt.claims = '{"role":"service_role"}';
select plan(7);

select
  'dc216901-0000-4000-8000-000000000001'::uuid as creator,
  'dc216901-0000-4000-8000-000000000002'::uuid as role_admin,
  'dc216901-0000-4000-8000-000000000003'::uuid as role_explicit,
  'dc216901-0000-4000-8000-000000000004'::uuid as disabled,
  'dc216901-0000-4000-8000-000000000005'::uuid as guest,
  'dc216901-0000-4000-8000-000000000010'::uuid as ws,
  'dc216901-0000-4000-8000-000000000020'::uuid as admin_role,
  'dc216901-0000-4000-8000-000000000021'::uuid as explicit_role,
  'dc216901-0000-4000-8000-000000000022'::uuid as disabled_role
\gset

insert into auth.users (id, email) values
  (:'creator', 'parity-creator@example.test'),
  (:'role_admin', 'parity-admin@example.test'),
  (:'role_explicit', 'parity-manager@example.test'),
  (:'disabled', 'parity-disabled@example.test'),
  (:'guest', 'parity-guest@example.test');

insert into public.workspaces (id, name, creator_id, personal)
values (:'ws', 'Guarded removal parity', :'creator', false);

insert into public.workspace_members (ws_id, user_id, type) values
  (:'ws', :'role_admin', 'MEMBER'),
  (:'ws', :'role_explicit', 'MEMBER'),
  (:'ws', :'disabled', 'MEMBER'),
  (:'ws', :'guest', 'GUEST');

insert into public.workspace_roles (id, ws_id, name) values
  (:'admin_role', :'ws', 'Parity admin'),
  (:'explicit_role', :'ws', 'Parity member manager'),
  (:'disabled_role', :'ws', 'Parity disabled');

insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled) values
  (:'admin_role', :'ws', 'admin', true),
  (:'explicit_role', :'ws', 'manage_workspace_members', true),
  (:'disabled_role', :'ws', 'admin', false),
  (:'disabled_role', :'ws', 'manage_workspace_members', false);

insert into public.workspace_role_members (role_id, user_id) values
  (:'admin_role', :'role_admin'),
  (:'explicit_role', :'role_explicit'),
  (:'disabled_role', :'disabled');

-- Seed a stale guest assignment to verify the predicate independently of the write guard.
alter table public.workspace_role_members disable trigger guard_role_member_requires_membership;
insert into public.workspace_role_members (role_id, user_id) values (:'admin_role', :'guest');
alter table public.workspace_role_members enable trigger guard_role_member_requires_membership;

insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
values (:'ws', 'admin', 'GUEST', true);

select is(
  private.workspace_has_member_manager(:'ws', :'guest'),
  false,
  'an enabled GUEST admin default does not count toward the member invariant'
);
select is(
  public.has_workspace_permission(:'ws', :'guest', 'manage_workspace_members'),
  false,
  'an enabled GUEST admin default does not grant the member-only permission'
);

select is(
  array_agg(private.workspace_has_member_manager(ws_id, user_id) order by user_id),
  array[true, true, true, false, false],
  'the creator, role admin and explicit role qualify while disabled grants and the stale guest role do not'
) from public.workspace_members where ws_id = :'ws';

create temp view manager_parity as
select
  private.workspace_has_member_manager(ws_id, user_id) as set_based,
  public.has_workspace_permission(ws_id, user_id, 'manage_workspace_members') as permission_check
from public.workspace_members
where ws_id = :'ws';

select is(count(*) filter (where set_based is distinct from permission_check), 0::bigint,
  'the predicate matches the permission evaluator for each member and guest')
from manager_parity;

insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled) values
  (:'ws', 'admin', 'MEMBER', true),
  (:'ws', 'manage_workspace_members', 'MEMBER', false);

select is(count(*) filter (where set_based is distinct from permission_check), 0::bigint,
  'MEMBER admin defaults match the permission evaluator for every row')
from manager_parity;

update public.workspace_default_permissions
set enabled = permission = 'manage_workspace_members'
where ws_id = :'ws' and member_type = 'MEMBER' and permission in ('admin', 'manage_workspace_members');

select is(count(*) filter (where set_based is distinct from permission_check), 0::bigint,
  'explicit MEMBER defaults match the permission evaluator for every row')
from manager_parity;

delete from public.workspace_members where ws_id = :'ws' and user_id = :'creator';

select ok(
  public.has_workspace_permission(:'ws', :'creator', 'manage_workspace_members')
    and not private.workspace_has_member_manager(:'ws', :'creator'),
  'a recorded creator without a membership has permission but cannot satisfy the member invariant'
);

select * from finish();
rollback;
