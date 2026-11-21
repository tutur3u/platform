-- Removing a workspace member deletes their role memberships in that
-- workspace only, so a re-invited member starts with no roles.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('5dfc0000-0000-4000-8000-000000000001', 'mrrm-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfc0000-0000-4000-8000-000000000002', 'mrrm-member@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfc0000-0000-4000-8000-000000000003', 'mrrm-mover@example.com', now(), '{}'::jsonb, '{}'::jsonb);

insert into public.workspaces (id, name, creator_id, personal) values
  ('5dfc0000-0000-4000-8000-0000000000a1', 'Removal team A', '5dfc0000-0000-4000-8000-000000000001', false),
  ('5dfc0000-0000-4000-8000-0000000000a2', 'Removal team B', '5dfc0000-0000-4000-8000-000000000001', false);
insert into public.workspace_members (ws_id, user_id, type) values
  ('5dfc0000-0000-4000-8000-0000000000a1', '5dfc0000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5dfc0000-0000-4000-8000-0000000000a2', '5dfc0000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5dfc0000-0000-4000-8000-0000000000a1', '5dfc0000-0000-4000-8000-000000000003', 'MEMBER')
on conflict do nothing;

insert into public.workspace_roles (id, name, ws_id) values
  ('5dfc0000-0000-4000-8000-0000000000b1', 'Workspace Admin (preserved)', '5dfc0000-0000-4000-8000-0000000000a1'),
  ('5dfc0000-0000-4000-8000-0000000000b2', 'Admins', '5dfc0000-0000-4000-8000-0000000000a2');
insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled) values
  ('5dfc0000-0000-4000-8000-0000000000b1', '5dfc0000-0000-4000-8000-0000000000a1', 'admin', true),
  ('5dfc0000-0000-4000-8000-0000000000b2', '5dfc0000-0000-4000-8000-0000000000a2', 'admin', true);
insert into public.workspace_role_members (role_id, user_id) values
  ('5dfc0000-0000-4000-8000-0000000000b1', '5dfc0000-0000-4000-8000-000000000002'),
  ('5dfc0000-0000-4000-8000-0000000000b2', '5dfc0000-0000-4000-8000-000000000002'),
  ('5dfc0000-0000-4000-8000-0000000000b1', '5dfc0000-0000-4000-8000-000000000003');

-- Remove the member the way the members API does: a service-role delete.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
delete from public.workspace_members
where ws_id = '5dfc0000-0000-4000-8000-0000000000a1'
  and user_id = '5dfc0000-0000-4000-8000-000000000002';
reset role;

select ok(
  not exists (
    select 1 from public.workspace_role_members
    where role_id = '5dfc0000-0000-4000-8000-0000000000b1'
      and user_id = '5dfc0000-0000-4000-8000-000000000002'
  ),
  'removing a member deletes their role memberships in that workspace');

select ok(
  exists (
    select 1 from public.workspace_role_members
    where role_id = '5dfc0000-0000-4000-8000-0000000000b2'
      and user_id = '5dfc0000-0000-4000-8000-000000000002'
  ),
  'their role memberships in other workspaces stay');

select ok(
  exists (
    select 1 from public.workspace_role_members
    where role_id = '5dfc0000-0000-4000-8000-0000000000b1'
      and user_id = '5dfc0000-0000-4000-8000-000000000003'
  ),
  'other members keep the role');

-- Re-invite the removed member as a plain MEMBER.
insert into public.workspace_members (ws_id, user_id, type)
values ('5dfc0000-0000-4000-8000-0000000000a1', '5dfc0000-0000-4000-8000-000000000002', 'MEMBER');

select ok(
  not public.has_workspace_permission('5dfc0000-0000-4000-8000-0000000000a1',
    '5dfc0000-0000-4000-8000-000000000002', 'manage_workspace_secrets'),
  'a re-invited member does not regain the preserved admin role');

-- Moving a membership row to another workspace ends the old roles too.
update public.workspace_members
set ws_id = '5dfc0000-0000-4000-8000-0000000000a2'
where ws_id = '5dfc0000-0000-4000-8000-0000000000a1'
  and user_id = '5dfc0000-0000-4000-8000-000000000003';

select ok(
  not exists (
    select 1 from public.workspace_role_members
    where role_id = '5dfc0000-0000-4000-8000-0000000000b1'
      and user_id = '5dfc0000-0000-4000-8000-000000000003'
  ),
  'moving a membership to another workspace deletes the old workspace roles');

select ok(
  not exists (
    select 1
    from public.workspace_role_members wrm
    join public.workspace_roles wr on wr.id = wrm.role_id
    where wr.ws_id in ('5dfc0000-0000-4000-8000-0000000000a1', '5dfc0000-0000-4000-8000-0000000000a2')
      and not exists (
        select 1 from public.workspace_members wm
        where wm.ws_id = wr.ws_id and wm.user_id = wrm.user_id
      )
  ),
  'no role membership outlives its workspace membership');

-- Removing a root member who holds the recorded Mastermind role writes a
-- revoke to the Mastermind ledger.
insert into public.workspaces (id, name, creator_id, personal)
values ('00000000-0000-0000-0000-000000000000', 'Root', '5dfc0000-0000-4000-8000-000000000001', false)
on conflict (id) do nothing;
insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-0000-0000-000000000000', '5dfc0000-0000-4000-8000-000000000003', 'MEMBER')
on conflict do nothing;
insert into public.workspace_roles (id, name, ws_id)
values ('5dfc0000-0000-4000-8000-0000000000c1', 'Mastermind', '00000000-0000-0000-0000-000000000000');
select set_config('tuturuuu.mastermind_grant', 'audited', true);
delete from private.mastermind_access_role;
insert into private.mastermind_access_role (role_id) values ('5dfc0000-0000-4000-8000-0000000000c1');
insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
values ('5dfc0000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'manage_mastermind', true);
insert into public.workspace_role_members (role_id, user_id)
values ('5dfc0000-0000-4000-8000-0000000000c1', '5dfc0000-0000-4000-8000-000000000003');
select set_config('tuturuuu.mastermind_grant', '', true);

delete from public.workspace_members
where ws_id = '00000000-0000-0000-0000-000000000000'
  and user_id = '5dfc0000-0000-4000-8000-000000000003';

select is(
  (select count(*)::integer from private.mastermind_access_audit
   where action = 'revoke'
     and target_user_id = '5dfc0000-0000-4000-8000-000000000003'
     and role_id = '5dfc0000-0000-4000-8000-0000000000c1'
     and reason = 'Root workspace membership ended'),
  1, 'removing a Mastermind holder from root records a revoke');

select * from finish();
rollback;
