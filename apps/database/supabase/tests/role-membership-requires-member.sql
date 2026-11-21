-- Workspace role memberships require a MEMBER row in the role's workspace,
-- and demotion to GUEST ends them.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('5dfd0000-0000-4000-8000-000000000001', 'rmrm-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfd0000-0000-4000-8000-000000000002', 'rmrm-member@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfd0000-0000-4000-8000-000000000003', 'rmrm-guest@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfd0000-0000-4000-8000-000000000004', 'rmrm-outsider@example.com', now(), '{}'::jsonb, '{}'::jsonb);

insert into public.workspaces (id, name, creator_id, personal) values
  ('5dfd0000-0000-4000-8000-0000000000a1', 'Guard team A', '5dfd0000-0000-4000-8000-000000000001', false),
  ('5dfd0000-0000-4000-8000-0000000000a2', 'Guard team B', '5dfd0000-0000-4000-8000-000000000001', false);
insert into public.workspace_members (ws_id, user_id, type) values
  ('5dfd0000-0000-4000-8000-0000000000a1', '5dfd0000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5dfd0000-0000-4000-8000-0000000000a2', '5dfd0000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5dfd0000-0000-4000-8000-0000000000a1', '5dfd0000-0000-4000-8000-000000000003', 'GUEST')
on conflict do nothing;
insert into public.workspace_roles (id, name, ws_id) values
  ('5dfd0000-0000-4000-8000-0000000000b1', 'Editors', '5dfd0000-0000-4000-8000-0000000000a1'),
  ('5dfd0000-0000-4000-8000-0000000000b2', 'Editors B', '5dfd0000-0000-4000-8000-0000000000a2'),
  ('5dfd0000-0000-4000-8000-0000000000b3', 'Reviewers', '5dfd0000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$insert into public.workspace_role_members (role_id, user_id)
    values ('5dfd0000-0000-4000-8000-0000000000b1', '5dfd0000-0000-4000-8000-000000000004')$$,
  '42501', 'workspace roles can only be held by members of the role''s workspace',
  'a non-member cannot hold a workspace role');

select throws_ok(
  $$insert into public.workspace_role_members (role_id, user_id)
    values ('5dfd0000-0000-4000-8000-0000000000b1', '5dfd0000-0000-4000-8000-000000000003')$$,
  '42501', 'workspace roles can only be held by members of the role''s workspace',
  'a guest cannot hold a workspace role');

select lives_ok(
  $$insert into public.workspace_role_members (role_id, user_id) values
    ('5dfd0000-0000-4000-8000-0000000000b1', '5dfd0000-0000-4000-8000-000000000002'),
    ('5dfd0000-0000-4000-8000-0000000000b2', '5dfd0000-0000-4000-8000-000000000002')$$,
  'a MEMBER can hold roles in their workspaces');

select lives_ok(
  $$insert into public.workspace_role_members (role_id, user_id)
    values ('5dfd0000-0000-4000-8000-0000000000b1', '5dfd0000-0000-4000-8000-000000000002')
    on conflict (role_id, user_id) do nothing$$,
  'repeating an existing role membership is accepted');

select throws_ok(
  $$update public.workspace_role_members
    set user_id = '5dfd0000-0000-4000-8000-000000000004'
    where role_id = '5dfd0000-0000-4000-8000-0000000000b1'
      and user_id = '5dfd0000-0000-4000-8000-000000000002'$$,
  '42501', 'workspace roles can only be held by members of the role''s workspace',
  'a role membership cannot be moved to a non-member');

select lives_ok(
  $$update public.workspace_role_members
    set role_id = '5dfd0000-0000-4000-8000-0000000000b3'
    where role_id = '5dfd0000-0000-4000-8000-0000000000b1'
      and user_id = '5dfd0000-0000-4000-8000-000000000002'$$,
  'a role membership can move to another role in the same workspace');

-- Demotion to GUEST ends the user's roles in that workspace only.
-- Member type changes run from a service-role context, as the members API does.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.workspace_members set type = 'GUEST'
where ws_id = '5dfd0000-0000-4000-8000-0000000000a1'
  and user_id = '5dfd0000-0000-4000-8000-000000000002';

select ok(
  not exists (
    select 1 from public.workspace_role_members wrm
    join public.workspace_roles wr on wr.id = wrm.role_id
    where wr.ws_id = '5dfd0000-0000-4000-8000-0000000000a1'
      and wrm.user_id = '5dfd0000-0000-4000-8000-000000000002'
  ),
  'demotion to GUEST deletes the user''s roles in that workspace');

select ok(
  exists (
    select 1 from public.workspace_role_members
    where role_id = '5dfd0000-0000-4000-8000-0000000000b2'
      and user_id = '5dfd0000-0000-4000-8000-000000000002'
  ),
  'roles in other workspaces stay');

update public.workspace_members set type = 'MEMBER'
where ws_id = '5dfd0000-0000-4000-8000-0000000000a1'
  and user_id = '5dfd0000-0000-4000-8000-000000000002';

select ok(
  not public.has_workspace_permission('5dfd0000-0000-4000-8000-0000000000a1',
    '5dfd0000-0000-4000-8000-000000000002', 'manage_workspace_roles')
  and not exists (
    select 1 from public.workspace_role_members wrm
    join public.workspace_roles wr on wr.id = wrm.role_id
    where wr.ws_id = '5dfd0000-0000-4000-8000-0000000000a1'
      and wrm.user_id = '5dfd0000-0000-4000-8000-000000000002'
  ),
  'promoting back to MEMBER does not restore ended roles');

-- Demoting the recorded Mastermind holder writes a revoke to its ledger.
insert into public.workspaces (id, name, creator_id, personal)
values ('00000000-0000-0000-0000-000000000000', 'Root', '5dfd0000-0000-4000-8000-000000000001', false)
on conflict (id) do nothing;
insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-0000-0000-000000000000', '5dfd0000-0000-4000-8000-000000000002', 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
insert into public.workspace_roles (id, name, ws_id)
values ('5dfd0000-0000-4000-8000-0000000000c1', 'Mastermind', '00000000-0000-0000-0000-000000000000');
select set_config('tuturuuu.mastermind_grant', 'audited', true);
delete from private.mastermind_access_role;
insert into private.mastermind_access_role (role_id) values ('5dfd0000-0000-4000-8000-0000000000c1');
insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
values ('5dfd0000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'manage_mastermind', true);
insert into public.workspace_role_members (role_id, user_id)
values ('5dfd0000-0000-4000-8000-0000000000c1', '5dfd0000-0000-4000-8000-000000000002');
select set_config('tuturuuu.mastermind_grant', '', true);

update public.workspace_members set type = 'GUEST'
where ws_id = '00000000-0000-0000-0000-000000000000'
  and user_id = '5dfd0000-0000-4000-8000-000000000002';

select is(
  (select count(*)::integer from private.mastermind_access_audit
   where action = 'revoke'
     and target_user_id = '5dfd0000-0000-4000-8000-000000000002'
     and role_id = '5dfd0000-0000-4000-8000-0000000000c1'
     and reason = 'Root workspace membership demoted to guest'),
  1, 'demoting a Mastermind holder to GUEST records a revoke');

select ok(
  not exists (
    select 1 from public.workspace_role_members
    where role_id = '5dfd0000-0000-4000-8000-0000000000c1'
      and user_id = '5dfd0000-0000-4000-8000-000000000002'
  ),
  'the demoted holder no longer holds the Mastermind role');

select * from finish();
rollback;
