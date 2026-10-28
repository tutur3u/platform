begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(22);

-- Fixtures: a creator-owned workspace, an admin member, two invitees, a
-- billing role holding manage_subscription and an ordinary staff role.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('5ac00000-0000-4000-8000-000000000001', 'sis-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5ac00000-0000-4000-8000-000000000002', 'sis-admin@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5ac00000-0000-4000-8000-000000000003', 'sis-invitee@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5ac00000-0000-4000-8000-000000000004', 'sis-direct@example.com', now(), '{}'::jsonb, '{}'::jsonb);

insert into public.users (id)
values
  ('5ac00000-0000-4000-8000-000000000001'),
  ('5ac00000-0000-4000-8000-000000000002'),
  ('5ac00000-0000-4000-8000-000000000003'),
  ('5ac00000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '5ac00000-0000-4000-8000-0000000000a1',
  'Subscription invite scope',
  false,
  '5ac00000-0000-4000-8000-000000000001'
);

insert into public.workspace_members (ws_id, user_id, type)
values
  ('5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000001', 'MEMBER'),
  ('5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000002', 'MEMBER')
on conflict (ws_id, user_id) do nothing;

insert into public.workspace_roles (id, ws_id, name)
values
  ('5ac00000-0000-4000-8000-0000000000b1', '5ac00000-0000-4000-8000-0000000000a1', 'Admins'),
  ('5ac00000-0000-4000-8000-0000000000b2', '5ac00000-0000-4000-8000-0000000000a1', 'Billing'),
  ('5ac00000-0000-4000-8000-0000000000b3', '5ac00000-0000-4000-8000-0000000000a1', 'Staff');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  ('5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-0000000000b1', 'admin', true),
  ('5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-0000000000b2', 'manage_subscription', true),
  ('5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-0000000000b3', 'manage_workspace_members', true);

insert into public.workspace_role_members (role_id, user_id)
values ('5ac00000-0000-4000-8000-0000000000b1', '5ac00000-0000-4000-8000-000000000002');

select has_column('public', 'workspace_invite_roles', 'assigned_by',
  'direct invitation roles record who assigned them');
select has_column('public', 'workspace_email_invite_roles', 'assigned_by',
  'email invitation roles record who assigned them');

-- 1. Creating an invitation.
select throws_ok(
  $$ select private.create_workspace_email_invitation_with_roles(
    '5ac00000-0000-4000-8000-0000000000a1', 'sis-blocked@example.com',
    '5ac00000-0000-4000-8000-000000000002', 'MEMBER',
    array['5ac00000-0000-4000-8000-0000000000b2'::uuid]) $$,
  '42501', null,
  'an admin cannot invite with a role holding manage_subscription'
);
select is(
  (select count(*)::integer from public.workspace_email_invites
   where email = 'sis-blocked@example.com'),
  0,
  'the rejected invitation is not stored'
);
select lives_ok(
  $$ select private.create_workspace_email_invitation_with_roles(
    '5ac00000-0000-4000-8000-0000000000a1', 'sis-invitee@example.com',
    '5ac00000-0000-4000-8000-000000000002', 'MEMBER',
    array['5ac00000-0000-4000-8000-0000000000b3'::uuid]) $$,
  'an admin can invite with an ordinary role'
);
select is(
  (select assigned_by from public.workspace_email_invite_roles
   where email = 'sis-invitee@example.com'
     and role_id = '5ac00000-0000-4000-8000-0000000000b3'),
  '5ac00000-0000-4000-8000-000000000002'::uuid,
  'the inviter is recorded as the role assigner'
);

-- 2. Editing pending roles.
select throws_ok(
  $$ select private.set_workspace_invitation_roles(
    '5ac00000-0000-4000-8000-0000000000a1',
    array['5ac00000-0000-4000-8000-0000000000b2'::uuid, '5ac00000-0000-4000-8000-0000000000b3'::uuid],
    null, 'sis-invitee@example.com',
    '5ac00000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'an admin cannot add a role holding manage_subscription to an invitation'
);
select throws_ok(
  $$ select private.set_workspace_invitation_roles(
    '5ac00000-0000-4000-8000-0000000000a1',
    array['5ac00000-0000-4000-8000-0000000000b2'::uuid],
    null, 'sis-invitee@example.com', null) $$,
  '42501', null,
  'an unattributed edit cannot add a role holding manage_subscription'
);
select lives_ok(
  $$ select private.set_workspace_invitation_roles(
    '5ac00000-0000-4000-8000-0000000000a1',
    array['5ac00000-0000-4000-8000-0000000000b2'::uuid, '5ac00000-0000-4000-8000-0000000000b3'::uuid],
    null, 'sis-invitee@example.com',
    '5ac00000-0000-4000-8000-000000000001') $$,
  'the creator can add a role holding manage_subscription to an invitation'
);
select lives_ok(
  $$ select private.set_workspace_invitation_roles(
    '5ac00000-0000-4000-8000-0000000000a1',
    array['5ac00000-0000-4000-8000-0000000000b2'::uuid, '5ac00000-0000-4000-8000-0000000000b3'::uuid],
    null, 'sis-invitee@example.com',
    '5ac00000-0000-4000-8000-000000000002') $$,
  'an admin can re-save an invitation that keeps the creator-assigned role'
);
select results_eq(
  $$ select role_id, assigned_by from public.workspace_email_invite_roles
     where email = 'sis-invitee@example.com' order by role_id $$,
  $$ values
     ('5ac00000-0000-4000-8000-0000000000b2'::uuid, '5ac00000-0000-4000-8000-000000000001'::uuid),
     ('5ac00000-0000-4000-8000-0000000000b3'::uuid, '5ac00000-0000-4000-8000-000000000002'::uuid) $$,
  'kept roles keep their original assigner'
);

-- 3. Accepting an invitation.
select throws_ok(
  $$ select private.finalize_workspace_invitation_membership_v2(
    '5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000004',
    'MEMBER', array['5ac00000-0000-4000-8000-0000000000b2'::uuid]) $$,
  '42501', null,
  'a direct finalizer call cannot grant a role the creator did not assign'
);
select throws_ok(
  $$ select private.finalize_workspace_invitation_membership(
    '5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000004',
    'MEMBER', '5ac00000-0000-4000-8000-0000000000b2'::uuid) $$,
  '42501', null,
  'the single-role finalizer applies the same check'
);
select is(
  (select count(*)::integer from public.workspace_members
   where ws_id = '5ac00000-0000-4000-8000-0000000000a1'
     and user_id = '5ac00000-0000-4000-8000-000000000004'),
  0,
  'a rejected acceptance adds no membership'
);

-- A direct invitation whose billing role was stored without the creator.
insert into public.workspace_invites (ws_id, user_id, type)
values ('5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000004', 'MEMBER');
insert into public.workspace_invite_roles (ws_id, user_id, role_id, assigned_by)
values (
  '5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000004',
  '5ac00000-0000-4000-8000-0000000000b2', '5ac00000-0000-4000-8000-000000000002'
);
select throws_ok(
  $$ select private.finalize_workspace_invitation_membership_v2(
    '5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000004',
    'MEMBER', array['5ac00000-0000-4000-8000-0000000000b2'::uuid]) $$,
  '42501', null,
  'accepting a billing role assigned by an admin is rejected'
);
select lives_ok(
  $$ select private.finalize_workspace_invitation_membership_v2(
    '5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000004',
    'MEMBER', array['5ac00000-0000-4000-8000-0000000000b3'::uuid]) $$,
  'accepting ordinary roles still works'
);
delete from public.workspace_invite_roles
where user_id = '5ac00000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select private.set_workspace_invitation_roles(
    '5ac00000-0000-4000-8000-0000000000a1',
    array['5ac00000-0000-4000-8000-0000000000b2'::uuid, '5ac00000-0000-4000-8000-0000000000b3'::uuid],
    '5ac00000-0000-4000-8000-000000000004', null,
    '5ac00000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'an admin cannot add a billing role to a direct invitation'
);

select lives_ok(
  $$ select private.finalize_workspace_invitation_membership_v2(
    '5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000003',
    'MEMBER', array['5ac00000-0000-4000-8000-0000000000b2'::uuid, '5ac00000-0000-4000-8000-0000000000b3'::uuid]) $$,
  'accepting a creator-assigned billing role works'
);
select is(
  (select count(*)::integer from public.workspace_role_members
   where user_id = '5ac00000-0000-4000-8000-000000000003'
     and role_id in ('5ac00000-0000-4000-8000-0000000000b2', '5ac00000-0000-4000-8000-0000000000b3')),
  2,
  'the invitee receives every invited role'
);
select lives_ok(
  $$ select private.finalize_workspace_invitation_membership_v2(
    '5ac00000-0000-4000-8000-0000000000a1', '5ac00000-0000-4000-8000-000000000003',
    'MEMBER', array['5ac00000-0000-4000-8000-0000000000b2'::uuid]) $$,
  'repeating an acceptance for a role already held is a no-op'
);

-- 4. Stored provenance.
select is(
  (select count(*)::integer from public.workspace_email_invite_roles
   where assigned_by is null and email like 'sis-%'),
  0,
  'every stored invitation role in this workspace has an assigner'
);
select is(
  private.workspace_role_has_creator_grant('5ac00000-0000-4000-8000-0000000000b2'),
  true,
  'the billing role is detected as a creator-grant role'
);

select * from finish();
rollback;
