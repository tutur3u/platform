begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(24);

-- Fixture
--   a101 owner: creator of workspaces A, B and the seat-limited workspace F
--   a102 invitee: confirmed email, GUEST email invite in A only
--   a103 plain member of A without manage_workspace_members
--   a104 pending invitee of A (MEMBER invite), member of nothing
--   a105 creator of an empty workspace E (bootstrap path)
--   a106 unconfirmed email, MEMBER email invite in A
--   a107 direct user-id invite in A (GUEST)
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-00000000a101', 'invite-owner@example.test', now()),
  ('00000000-0000-4000-8000-00000000a102', 'invite-target@example.test', now()),
  ('00000000-0000-4000-8000-00000000a103', 'invite-member@example.test', now()),
  ('00000000-0000-4000-8000-00000000a104', 'invite-pending@example.test', now()),
  ('00000000-0000-4000-8000-00000000a105', 'invite-creator@example.test', now()),
  ('00000000-0000-4000-8000-00000000a106', 'invite-unconfirmed@example.test', null),
  ('00000000-0000-4000-8000-00000000a107', 'invite-direct@example.test', now());

insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-00000000a101', 'Invite scope owner'),
  ('00000000-0000-4000-8000-00000000a102', 'Invite scope target'),
  ('00000000-0000-4000-8000-00000000a103', 'Invite scope member'),
  ('00000000-0000-4000-8000-00000000a104', 'Invite scope pending'),
  ('00000000-0000-4000-8000-00000000a105', 'Invite scope creator'),
  ('00000000-0000-4000-8000-00000000a106', 'Invite scope unconfirmed'),
  ('00000000-0000-4000-8000-00000000a107', 'Invite scope direct')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.workspaces (id, name, personal, creator_id) values
  ('00000000-0000-4000-8000-00000000a1a0', 'Invite scope A', false, '00000000-0000-4000-8000-00000000a101'),
  ('00000000-0000-4000-8000-00000000a1b0', 'Invite scope B', false, '00000000-0000-4000-8000-00000000a101'),
  ('00000000-0000-4000-8000-00000000a1e0', 'Invite scope E', false, '00000000-0000-4000-8000-00000000a105'),
  ('00000000-0000-4000-8000-00000000a1f0', 'Invite scope F', false, '00000000-0000-4000-8000-00000000a101');

insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a101', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000a1b0', '00000000-0000-4000-8000-00000000a101', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000a1f0', '00000000-0000-4000-8000-00000000a101', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a103', 'MEMBER')
on conflict do nothing;

-- Plain members of A must not inherit member management from seeded defaults.
delete from public.workspace_default_permissions
where ws_id = '00000000-0000-4000-8000-00000000a1a0'
  and permission in ('admin', 'manage_workspace_members');

-- E must be empty for the creator bootstrap branch.
delete from public.workspace_members
where ws_id = '00000000-0000-4000-8000-00000000a1e0';

insert into public.workspace_email_invites (ws_id, email, type, invited_by) values
  ('00000000-0000-4000-8000-00000000a1a0', 'invite-target@example.test', 'GUEST', '00000000-0000-4000-8000-00000000a101'),
  ('00000000-0000-4000-8000-00000000a1a0', 'invite-pending@example.test', 'MEMBER', '00000000-0000-4000-8000-00000000a101'),
  ('00000000-0000-4000-8000-00000000a1a0', 'invite-unconfirmed@example.test', 'MEMBER', '00000000-0000-4000-8000-00000000a101');

insert into public.workspace_invites (ws_id, user_id, type) values
  ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a107', 'GUEST');

insert into public.workspace_roles (id, ws_id, name) values
  ('00000000-0000-4000-8000-00000000a1a5', '00000000-0000-4000-8000-00000000a1a0', 'Invite scope role A'),
  ('00000000-0000-4000-8000-00000000a1b5', '00000000-0000-4000-8000-00000000a1b0', 'Invite scope role B');

-- F is seat-based with every seat used (one member, no invites).
insert into private.workspace_subscription_products (id, tier, pricing_model, name)
values ('00000000-0000-4000-8000-00000000a1d0', 'PRO', 'seat_based', 'Invite scope seats');

insert into public.workspace_subscriptions (ws_id, polar_subscription_id, product_id, seat_count, status)
values (
  '00000000-0000-4000-8000-00000000a1f0',
  'invite-scope-seat-fixture',
  '00000000-0000-4000-8000-00000000a1d0',
  1,
  'active'
);

create function pg_temp.act_as(p_user uuid, p_email text) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', p_user, 'email', p_email)::text,
    true
  );
$$;

-- Structure ----------------------------------------------------------------

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_email_invites'
      and policyname = 'Enable insert for workspace members'
  ),
  'the ungated member invite INSERT policy is removed'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('workspace_members', 'workspace_email_invites')
      and cmd = 'INSERT'
      and (roles && array['public', 'anon']::name[])
  ),
  'no INSERT policy on members or email invites targets anon or PUBLIC'
);

select ok(
  (
    select count(*)
    from pg_proc
    where oid in (
      to_regprocedure('public.current_user_workspace_invite_type(uuid)'),
      to_regprocedure('public.current_user_can_bootstrap_workspace(uuid)'),
      to_regprocedure('public.current_user_can_assign_workspace_role(uuid, uuid)')
    )
      and prosecdef
      and proconfig = array['search_path=pg_catalog, pg_temp']
  ) = 3,
  'invite helpers are pinned SECURITY DEFINER functions'
);

select ok(
  to_regprocedure('public.current_user_workspace_invite_type(uuid)') is not null
  and to_regprocedure('public.current_user_can_bootstrap_workspace(uuid)') is not null
  and to_regprocedure('public.current_user_can_assign_workspace_role(uuid, uuid)') is not null
  and not has_function_privilege('anon', 'public.current_user_can_assign_workspace_role(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.current_user_workspace_invite_type(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.current_user_can_bootstrap_workspace(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.current_user_workspace_invite_type(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.current_user_can_bootstrap_workspace(uuid)', 'execute'),
  'invite helpers are not executable by anon'
);

-- Joining via an invite ---------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-00000000a102', 'invite-target@example.test');

select throws_ok(
  $$insert into public.workspace_members (ws_id, user_id, type)
    values ('00000000-0000-4000-8000-00000000a1b0', '00000000-0000-4000-8000-00000000a102', 'MEMBER')$$,
  '42501', null,
  'an invite in workspace A does not admit the invitee to workspace B'
);

select throws_ok(
  $$insert into public.workspace_members (ws_id, user_id, type)
    values ('00000000-0000-4000-8000-00000000a1b0', '00000000-0000-4000-8000-00000000a102', 'GUEST')$$,
  '42501', null,
  'an invite in workspace A does not admit the invitee to B as a guest either'
);

select throws_ok(
  $$insert into public.workspace_members (ws_id, user_id, type)
    values ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a102', 'MEMBER')$$,
  '42501', null,
  'the invitee cannot choose a higher membership type than the invite grants'
);

select throws_ok(
  $$insert into public.workspace_members (ws_id, user_id)
    values ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a102')$$,
  '42501', null,
  'omitting the type cannot fall back to a higher column default'
);

select lives_ok(
  $$insert into public.workspace_members (ws_id, user_id, type)
    values ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a102', 'GUEST')$$,
  'the invitee can join the inviting workspace with the invited type'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000a106', 'invite-unconfirmed@example.test');
select throws_ok(
  $$insert into public.workspace_members (ws_id, user_id, type)
    values ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a106', 'MEMBER')$$,
  '42501', null,
  'an unconfirmed auth email cannot redeem an email invite'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000a105', 'invite-pending@example.test');
select throws_ok(
  $$insert into public.workspace_members (ws_id, user_id, type)
    values ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a105', 'MEMBER')$$,
  '42501', null,
  'a session email claim that differs from the confirmed auth email is not trusted'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000a107', 'invite-direct@example.test');
select throws_ok(
  $$insert into public.workspace_members (ws_id, user_id, type)
    values ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a107', 'MEMBER')$$,
  '42501', null,
  'a direct user invite also fixes the membership type'
);
select lives_ok(
  $$insert into public.workspace_members (ws_id, user_id, type)
    values ('00000000-0000-4000-8000-00000000a1a0', '00000000-0000-4000-8000-00000000a107', 'GUEST')$$,
  'a direct user invite still admits the invitee with the invited type'
);

-- Creating email invites ----------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-00000000a104', 'invite-pending@example.test');
select throws_ok(
  $$insert into public.workspace_email_invites (ws_id, email, type)
    values ('00000000-0000-4000-8000-00000000a1b0', 'invite-pending@example.test', 'MEMBER')$$,
  '42501', null,
  'a pending invitee cannot forge an invite for themselves into another workspace'
);
select throws_ok(
  $$insert into public.workspace_email_invites (ws_id, email, type)
    values ('00000000-0000-4000-8000-00000000a1b0', 'someone-else@example.test', 'MEMBER')$$,
  '42501', null,
  'a non-member cannot create invites in a workspace'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000a103', 'invite-member@example.test');
select throws_ok(
  $$insert into public.workspace_email_invites (ws_id, email, type)
    values ('00000000-0000-4000-8000-00000000a1a0', 'friend@example.test', 'MEMBER')$$,
  '42501', null,
  'a member without manage_workspace_members cannot invite'
);

select pg_temp.act_as('00000000-0000-4000-8000-00000000a101', 'invite-owner@example.test');
select throws_ok(
  $$insert into public.workspace_email_invites (ws_id, email, type)
    values ('00000000-0000-4000-8000-00000000a1a0', 'Invite-Owner@Example.test', 'MEMBER')$$,
  '42501', null,
  'a manager cannot invite their own email'
);
select lives_ok(
  $$insert into public.workspace_email_invites (ws_id, email, type)
    values ('00000000-0000-4000-8000-00000000a1a0', 'new-colleague@example.test', 'MEMBER')$$,
  'a manager can still invite another email'
);
select lives_ok(
  $$insert into public.workspace_email_invites (ws_id, email, type, role_id)
    values ('00000000-0000-4000-8000-00000000a1a0', 'role-colleague@example.test', 'MEMBER', '00000000-0000-4000-8000-00000000a1a5')$$,
  'a role manager can invite with a role of the same workspace'
);
select throws_ok(
  $$insert into public.workspace_email_invites (ws_id, email, type, role_id)
    values ('00000000-0000-4000-8000-00000000a1a0', 'role-mismatch@example.test', 'MEMBER', '00000000-0000-4000-8000-00000000a1b5')$$,
  '42501', null,
  'an invite cannot carry a role from another workspace'
);
select throws_ok(
  $$insert into public.workspace_email_invites (ws_id, email, type)
    values ('00000000-0000-4000-8000-00000000a1f0', 'over-limit@example.test', 'MEMBER')$$,
  '42501', null,
  'seat limits still block invites into a full seat-based workspace'
);

-- Creator bootstrap -------------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-00000000a105', 'invite-creator@example.test');
select lives_ok(
  $$insert into public.workspace_members (ws_id, user_id, type)
    values ('00000000-0000-4000-8000-00000000a1e0', '00000000-0000-4000-8000-00000000a105', 'MEMBER')$$,
  'the creator can still bootstrap membership of an empty workspace'
);

reset role;

select is(
  (
    select type::text from public.workspace_members
    where ws_id = '00000000-0000-4000-8000-00000000a1a0'
      and user_id = '00000000-0000-4000-8000-00000000a102'
  ),
  'GUEST',
  'the joined row carries the invited type'
);

select ok(
  not exists (
    select 1 from public.workspace_members
    where ws_id = '00000000-0000-4000-8000-00000000a1b0'
      and user_id in (
        '00000000-0000-4000-8000-00000000a102',
        '00000000-0000-4000-8000-00000000a104'
      )
  ),
  'no cross-workspace membership was created'
);

select * from finish();

rollback;
