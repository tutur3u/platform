-- Replays the member default admin backfill against workspaces whose MEMBER
-- defaults still enable admin, and checks who keeps access.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('5dfb0000-0000-4000-8000-000000000001', 'mdab-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfb0000-0000-4000-8000-000000000002', 'mdab-member@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfb0000-0000-4000-8000-000000000003', 'mdab-guest@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfb0000-0000-4000-8000-000000000004', 'mdab-late@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfb0000-0000-4000-8000-000000000005', 'mdab-billing@example.com', now(), '{}'::jsonb, '{}'::jsonb);

-- Team A: MEMBER admin default on, a member, a guest, a role-less key and a
-- key that holds a narrow role.
insert into public.workspaces (id, name, creator_id, personal) values
  ('5dfb0000-0000-4000-8000-0000000000a1', 'Backfill team A', '5dfb0000-0000-4000-8000-000000000001', false),
  ('5dfb0000-0000-4000-8000-0000000000a2', 'Backfill team B', '5dfb0000-0000-4000-8000-000000000001', false);
insert into public.workspace_members (ws_id, user_id, type) values
  ('5dfb0000-0000-4000-8000-0000000000a1', '5dfb0000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5dfb0000-0000-4000-8000-0000000000a1', '5dfb0000-0000-4000-8000-000000000003', 'GUEST'),
  ('5dfb0000-0000-4000-8000-0000000000a2', '5dfb0000-0000-4000-8000-000000000005', 'MEMBER')
on conflict do nothing;
insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled) values
  ('5dfb0000-0000-4000-8000-0000000000a1', 'admin', 'MEMBER', true),
  ('5dfb0000-0000-4000-8000-0000000000a2', 'admin', 'MEMBER', true);
insert into public.workspace_roles (id, name, ws_id) values
  ('5dfb0000-0000-4000-8000-0000000000b1', 'Readers', '5dfb0000-0000-4000-8000-0000000000a1'),
  -- Team B already has a preserved-named role that holds billing; it must not be reused.
  ('5dfb0000-0000-4000-8000-0000000000b2', 'Workspace Admin (preserved)', '5dfb0000-0000-4000-8000-0000000000a2');
insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled) values
  ('5dfb0000-0000-4000-8000-0000000000b2', '5dfb0000-0000-4000-8000-0000000000a2', 'manage_subscription', true);
insert into public.workspace_api_keys (id, ws_id, name, role_id) values
  ('5dfb0000-0000-4000-8000-0000000000c1', '5dfb0000-0000-4000-8000-0000000000a1', 'role-less', null),
  ('5dfb0000-0000-4000-8000-0000000000c2', '5dfb0000-0000-4000-8000-0000000000a1', 'with role', '5dfb0000-0000-4000-8000-0000000000b1');

\ir helpers/member-default-admin-backfill.inc
-- A second run must change nothing.
\ir helpers/member-default-admin-backfill.inc

select is(
  (select count(*)::integer from public.workspace_roles
   where ws_id = '5dfb0000-0000-4000-8000-0000000000a1' and name = 'Workspace Admin (preserved)'),
  1, 'team A gets exactly one preserved admin role across two runs');

select is(
  (select array_agg(wrm.user_id::text order by wrm.user_id)
   from public.workspace_role_members wrm
   join public.workspace_roles wr on wr.id = wrm.role_id
   where wr.ws_id = '5dfb0000-0000-4000-8000-0000000000a1' and wr.name = 'Workspace Admin (preserved)'),
  array['5dfb0000-0000-4000-8000-000000000002'],
  'only the non-creator MEMBER is enrolled; the guest and creator are not');

select is(
  (select wr.name from public.workspace_api_keys k join public.workspace_roles wr on wr.id = k.role_id
   where k.id = '5dfb0000-0000-4000-8000-0000000000c1'),
  'Workspace Admin (preserved)', 'a role-less API key gets the preserved role');

select is(
  (select role_id::text from public.workspace_api_keys where id = '5dfb0000-0000-4000-8000-0000000000c2'),
  '5dfb0000-0000-4000-8000-0000000000b1', 'an API key with a role keeps it');

select ok(
  not exists (
    select 1 from public.workspace_role_members
    where role_id = '5dfb0000-0000-4000-8000-0000000000b2'
  ),
  'a preserved-named role holding manage_subscription is not reused');

select is(
  (select count(*)::integer from public.workspace_roles
   where ws_id = '5dfb0000-0000-4000-8000-0000000000a2' and name = 'Workspace Admin (preserved)'),
  2, 'team B gets a fresh preserved role beside the billing role');

select ok(
  not exists (
    select 1 from public.workspace_default_permissions
    where ws_id in ('5dfb0000-0000-4000-8000-0000000000a1', '5dfb0000-0000-4000-8000-0000000000a2')
      and member_type = 'MEMBER' and permission = 'admin' and enabled
  ),
  'the MEMBER admin default is disabled');

select is(
  array[
    public.has_workspace_permission('5dfb0000-0000-4000-8000-0000000000a1', '5dfb0000-0000-4000-8000-000000000002', 'manage_workspace_secrets'),
    public.has_workspace_permission('5dfb0000-0000-4000-8000-0000000000a2', '5dfb0000-0000-4000-8000-000000000005', 'manage_workspace_secrets'),
    public.has_workspace_permission('5dfb0000-0000-4000-8000-0000000000a2', '5dfb0000-0000-4000-8000-000000000005', 'manage_subscription'),
    public.has_workspace_permission('5dfb0000-0000-4000-8000-0000000000a1', '5dfb0000-0000-4000-8000-000000000003', 'manage_workspace_secrets')
  ],
  array[true, true, false, false],
  'existing members keep admin access, never billing; the guest gains nothing');

insert into public.workspace_members (ws_id, user_id, type)
values ('5dfb0000-0000-4000-8000-0000000000a1', '5dfb0000-0000-4000-8000-000000000004', 'MEMBER')
on conflict do nothing;
select ok(
  not public.has_workspace_permission('5dfb0000-0000-4000-8000-0000000000a1', '5dfb0000-0000-4000-8000-000000000004', 'manage_workspace_secrets'),
  'a member who joins after the backfill does not inherit admin');

select * from finish();
rollback;
