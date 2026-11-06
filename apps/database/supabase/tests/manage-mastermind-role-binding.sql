-- manage_mastermind role binding: private.grant_mastermind_access uses only
-- the root role it created and recorded by id, never a role chosen by name,
-- and refuses a role with another member or another permission. Product rule:
-- apps/docs/platform/features/mobile-mastermind.mdx#access-rule
begin;

select plan(28);

-- Fixtures: grantee (target), a root role manager who is not the creator
-- (attacker), a second root member and a root guest.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('4d410000-0000-4000-8000-000000000001', 'mmb-target@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('4d410000-0000-4000-8000-000000000002', 'mmb-manager@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('4d410000-0000-4000-8000-000000000003', 'mmb-member@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('4d410000-0000-4000-8000-000000000004', 'mmb-guest@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('4d410000-0000-4000-8000-000000000005', 'mmb-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values ('00000000-0000-0000-0000-000000000000', 'Root fixture', false, '4d410000-0000-4000-8000-000000000005')
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-000000000001', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-000000000002', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-000000000003', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-000000000004', 'GUEST')
on conflict (ws_id, user_id) do update set type = excluded.type;

-- The manager's own role, renamed to squat the name and backdated (case 1).
insert into public.workspace_roles (id, ws_id, name)
values ('4d410000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'MMB managers');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-0000000000b1', 'admin', true),
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-0000000000b1', 'manage_workspace_roles', true);
insert into public.workspace_role_members (role_id, user_id)
values ('4d410000-0000-4000-8000-0000000000b1', '4d410000-0000-4000-8000-000000000002');
update public.workspace_roles
set name = 'Mastermind', created_at = '2000-01-01'
where id = '4d410000-0000-4000-8000-0000000000b1';

-- Staged role: pre-created by the manager with extra members and permissions.
insert into public.workspace_roles (id, ws_id, name, created_at)
values ('4d410000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'Mastermind', '1999-01-01');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-0000000000b2', 'admin', true),
  ('00000000-0000-0000-0000-000000000000', '4d410000-0000-4000-8000-0000000000b2', 'manage_mastermind', false);
insert into public.workspace_role_members (role_id, user_id)
values
  ('4d410000-0000-4000-8000-0000000000b2', '4d410000-0000-4000-8000-000000000001'),
  ('4d410000-0000-4000-8000-0000000000b2', '4d410000-0000-4000-8000-000000000002'),
  ('4d410000-0000-4000-8000-0000000000b2', '4d410000-0000-4000-8000-000000000003');

-- An outside-root namesake with extra permissions and a member is also ignored.
insert into public.workspaces (id, name, personal, creator_id)
values ('4d410000-0000-4000-8000-0000000000c0', 'Outside root', false, '4d410000-0000-4000-8000-000000000002');
insert into public.workspace_roles (id, ws_id, name)
values ('4d410000-0000-4000-8000-0000000000c1', '4d410000-0000-4000-8000-0000000000c0', 'Mastermind');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values ('4d410000-0000-4000-8000-0000000000c0', '4d410000-0000-4000-8000-0000000000c1', 'admin', true);
insert into public.workspace_role_members (role_id, user_id)
values ('4d410000-0000-4000-8000-0000000000c1', '4d410000-0000-4000-8000-000000000002');

-- Guests are refused.
select throws_ok(
  $$select private.grant_mastermind_access('4d410000-0000-4000-8000-000000000004', 'pgTAP guest')$$,
  'P0001',
  'grant_mastermind_access: user is not a root workspace member',
  'the RPC refuses a root guest'
);

-- Legitimate first grant.
create temp table mmb_role (role_id uuid);
insert into mmb_role
select private.grant_mastermind_access('4d410000-0000-4000-8000-000000000001', 'pgTAP first grant');

select is(
  (select role_id from mmb_role),
  (select role_id from private.mastermind_access_role),
  'the grant records and returns its own role id'
);

select ok(
  (select role_id from mmb_role) not in (
    '4d410000-0000-4000-8000-0000000000b1',
    '4d410000-0000-4000-8000-0000000000b2',
    '4d410000-0000-4000-8000-0000000000c1'
  ),
  'neither the renamed nor the staged Mastermind-named role is selected'
);

select is(
  (select ws_id from public.workspace_roles where id = (select role_id from mmb_role)),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'the recorded role belongs to the root workspace'
);

select is(
  (select array_agg(permission::text) from public.workspace_role_permissions
   where role_id = (select role_id from mmb_role) and enabled),
  array['manage_mastermind'],
  'the recorded role holds only manage_mastermind'
);

select ok(
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '4d410000-0000-4000-8000-000000000001',
    'manage_mastermind'
  ),
  'the grantee holds manage_mastermind'
);

-- Case 1, rename before the first grant: never used.
select ok(
  not public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '4d410000-0000-4000-8000-000000000002',
    'manage_mastermind'
  ),
  'a role manager who renamed their role to Mastermind does not obtain manage_mastermind'
);

select is(
  (select count(*) from public.workspace_role_permissions
   where role_id in ('4d410000-0000-4000-8000-0000000000b1', '4d410000-0000-4000-8000-0000000000b2')
     and permission::text = 'manage_mastermind' and enabled),
  0::bigint,
  'the grant never enables manage_mastermind on the renamed or staged role'
);

-- Staged role: its members never obtain it, and it cannot be enabled there.
select ok(
  not public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '4d410000-0000-4000-8000-000000000003',
    'manage_mastermind'
  ),
  'a member of the staged role does not obtain manage_mastermind'
);

do $$ begin perform set_config('tuturuuu.mastermind_grant', 'audited', true); end $$;
select throws_ok(
  $$update public.workspace_role_permissions set enabled = true
    where role_id = '4d410000-0000-4000-8000-0000000000b2'
      and permission::text = 'manage_mastermind'$$,
  '42501',
  null,
  'manage_mastermind cannot be enabled on a staged role, even with the grant flag'
);
do $$ begin perform set_config('tuturuuu.mastermind_grant', '', true); end $$;

-- Case 2, create an older Mastermind role after the grant: re-grant ignores it.
insert into public.workspace_roles (id, ws_id, name, created_at)
values ('4d410000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'Mastermind', '1990-01-01');
insert into public.workspace_role_members (role_id, user_id)
values ('4d410000-0000-4000-8000-0000000000b3', '4d410000-0000-4000-8000-000000000002');

select is(
  private.grant_mastermind_access('4d410000-0000-4000-8000-000000000001', 'pgTAP re-grant'),
  (select role_id from mmb_role),
  'a re-grant reuses the recorded role, not an older Mastermind-named one'
);

select ok(
  not public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '4d410000-0000-4000-8000-000000000002',
    'manage_mastermind'
  ),
  'a role manager who created an older Mastermind role does not obtain manage_mastermind'
);

select is(
  (select count(*) from public.workspace_role_permissions
   where permission::text = 'manage_mastermind' and enabled),
  1::bigint,
  'exactly one role holds manage_mastermind'
);

-- The recorded role is protected outside the RPC.
select throws_ok(
  $$update public.workspace_roles set name = 'Renamed'
    where id = (select role_id from mmb_role)$$,
  '42501',
  null,
  'the recorded role cannot be renamed outside the RPC'
);

select throws_ok(
  $$update public.workspace_roles set created_at = '1980-01-01'
    where id = (select role_id from mmb_role)$$,
  '42501',
  null,
  'the recorded role cannot be re-dated outside the RPC'
);

select throws_ok(
  $$delete from public.workspace_roles where id = (select role_id from mmb_role)$$,
  '42501',
  null,
  'the recorded role cannot be deleted'
);

do $$ begin perform set_config('tuturuuu.mastermind_grant', 'audited', true); end $$;
select throws_ok(
  $$insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
    select '00000000-0000-0000-0000-000000000000', role_id, 'admin', true from mmb_role$$,
  '42501',
  null,
  'no other permission can be added to the recorded role, even with the grant flag'
);
do $$ begin perform set_config('tuturuuu.mastermind_grant', '', true); end $$;

select throws_ok(
  $$insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
    select '00000000-0000-0000-0000-000000000000', role_id, 'manage_subscription', false from mmb_role$$,
  '42501',
  null,
  'not even a disabled row of another permission can be added to the recorded role'
);

select throws_ok(
  $$insert into public.workspace_role_members (role_id, user_id)
    select role_id, '4d410000-0000-4000-8000-000000000002' from mmb_role$$,
  '42501',
  null,
  'a member cannot be added to the recorded role outside the RPC'
);

select ok(
  (select count(*) from pg_trigger
   where tgname in ('guard_creator_grant_role_permission', 'guard_creator_grant_role_member')
     and tgenabled = 'O') = 2,
  'the creator-grant guards stay enabled alongside the Mastermind guards'
);

-- A second grantee is refused while the role has a member.
select throws_ok(
  $$select private.grant_mastermind_access('4d410000-0000-4000-8000-000000000003', 'pgTAP second grantee')$$,
  'P0001',
  'grant_mastermind_access: the Mastermind role has another member',
  'the RPC refuses a second grantee while the role has another member'
);

-- An extra member slipped in by an owner session is refused, not adopted.
do $$ begin perform set_config('tuturuuu.mastermind_grant', 'audited', true); end $$;
insert into public.workspace_role_members (role_id, user_id)
select role_id, '4d410000-0000-4000-8000-000000000002' from mmb_role;
do $$ begin perform set_config('tuturuuu.mastermind_grant', '', true); end $$;

select throws_ok(
  $$select private.grant_mastermind_access('4d410000-0000-4000-8000-000000000001', 'pgTAP extra member')$$,
  'P0001',
  'grant_mastermind_access: the Mastermind role has another member',
  'the RPC refuses when the recorded role has another member'
);

delete from public.workspace_role_members
where role_id = (select role_id from mmb_role)
  and user_id = '4d410000-0000-4000-8000-000000000002';

-- An extra permission row (only possible with the guard disabled) is refused.
alter table public.workspace_role_permissions disable trigger guard_mastermind_role_permission;
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
select '00000000-0000-0000-0000-000000000000', role_id, 'admin', false from mmb_role;
alter table public.workspace_role_permissions enable trigger guard_mastermind_role_permission;

select throws_ok(
  $$select private.grant_mastermind_access('4d410000-0000-4000-8000-000000000001', 'pgTAP extra permission')$$,
  'P0001',
  'grant_mastermind_access: the Mastermind role holds a permission other than manage_mastermind',
  'the RPC refuses when the recorded role has another permission row'
);

delete from public.workspace_role_permissions
where role_id = (select role_id from mmb_role) and permission::text = 'admin';

-- Revoke clears the recorded role; a new grantee then gets the same role.
select is(
  private.revoke_mastermind_access('4d410000-0000-4000-8000-000000000001', 'pgTAP revoke'),
  1,
  'revoke removes the grantee from the recorded role'
);

select is(
  private.grant_mastermind_access('4d410000-0000-4000-8000-000000000003', 'pgTAP new grantee'),
  (select role_id from mmb_role),
  'after revoke a new grantee is added to the same recorded role'
);

select is(
  (select array_agg(role_id is not null order by id) from private.mastermind_access_audit
   where reason in ('pgTAP revoke', 'pgTAP new grantee')),
  array[true, true],
  'grant and revoke audit rows record the role id'
);

select ok(
  not has_table_privilege('anon', 'private.mastermind_access_role', 'select')
  and not has_table_privilege('authenticated', 'private.mastermind_access_role', 'select,insert,update,delete')
  and not has_table_privilege('service_role', 'private.mastermind_access_role', 'select,insert,update,delete')
  and not has_function_privilege('authenticated', 'private.guard_mastermind_access_role()', 'execute'),
  'the role record and its guard are closed to API roles'
);

select ok(not exists (
  select 1 from public.workspace_role_permissions
  where role_id = '4d410000-0000-4000-8000-0000000000c1'
    and permission::text = 'manage_mastermind'
), 'outside-root namesake with another member and permission is untouched');
select * from finish();

rollback;
