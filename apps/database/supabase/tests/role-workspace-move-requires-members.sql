-- A role moves to another workspace only when every holder is a MEMBER there.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('5dfe0000-0000-4000-8000-000000000001', 'rwm-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfe0000-0000-4000-8000-000000000002', 'rwm-both@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfe0000-0000-4000-8000-000000000003', 'rwm-source-only@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfe0000-0000-4000-8000-000000000004', 'rwm-guest-there@example.com', now(), '{}'::jsonb, '{}'::jsonb);

insert into public.workspaces (id, name, creator_id, personal) values
  ('5dfe0000-0000-4000-8000-0000000000a1', 'Move source', '5dfe0000-0000-4000-8000-000000000001', false),
  ('5dfe0000-0000-4000-8000-0000000000a2', 'Move destination', '5dfe0000-0000-4000-8000-000000000001', false);
insert into public.workspace_members (ws_id, user_id, type) values
  ('5dfe0000-0000-4000-8000-0000000000a1', '5dfe0000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5dfe0000-0000-4000-8000-0000000000a2', '5dfe0000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5dfe0000-0000-4000-8000-0000000000a1', '5dfe0000-0000-4000-8000-000000000003', 'MEMBER'),
  ('5dfe0000-0000-4000-8000-0000000000a1', '5dfe0000-0000-4000-8000-000000000004', 'MEMBER'),
  ('5dfe0000-0000-4000-8000-0000000000a2', '5dfe0000-0000-4000-8000-000000000004', 'GUEST')
on conflict do nothing;
insert into public.workspace_roles (id, name, ws_id) values
  ('5dfe0000-0000-4000-8000-0000000000b1', 'Shared holders', '5dfe0000-0000-4000-8000-0000000000a1'),
  ('5dfe0000-0000-4000-8000-0000000000b2', 'Source-only holder', '5dfe0000-0000-4000-8000-0000000000a1'),
  ('5dfe0000-0000-4000-8000-0000000000b3', 'Guest-there holder', '5dfe0000-0000-4000-8000-0000000000a1'),
  ('5dfe0000-0000-4000-8000-0000000000b4', 'Empty role', '5dfe0000-0000-4000-8000-0000000000a1');
insert into public.workspace_role_members (role_id, user_id) values
  ('5dfe0000-0000-4000-8000-0000000000b1', '5dfe0000-0000-4000-8000-000000000002'),
  ('5dfe0000-0000-4000-8000-0000000000b2', '5dfe0000-0000-4000-8000-000000000003'),
  ('5dfe0000-0000-4000-8000-0000000000b3', '5dfe0000-0000-4000-8000-000000000004');

select throws_ok(
  $$update public.workspace_roles set ws_id = '5dfe0000-0000-4000-8000-0000000000a2'
    where id = '5dfe0000-0000-4000-8000-0000000000b2'$$,
  '42501',
  'workspace_roles.ws_id cannot move a role whose holders are not members of the destination workspace',
  'the database owner cannot move a role to a workspace its holder is not in');

select throws_ok(
  $$update public.workspace_roles set ws_id = '5dfe0000-0000-4000-8000-0000000000a2'
    where id = '5dfe0000-0000-4000-8000-0000000000b3'$$,
  '42501',
  'workspace_roles.ws_id cannot move a role whose holders are not members of the destination workspace',
  'a role cannot move to a workspace where its holder is only a guest');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select throws_ok(
  $$update public.workspace_roles set ws_id = '5dfe0000-0000-4000-8000-0000000000a2'
    where id = '5dfe0000-0000-4000-8000-0000000000b2'$$,
  '42501',
  'workspace_roles.ws_id cannot move a role whose holders are not members of the destination workspace',
  'service_role cannot move a role to a workspace its holder is not in');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"5dfe0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$update public.workspace_roles set ws_id = '5dfe0000-0000-4000-8000-0000000000a2'
    where id = '5dfe0000-0000-4000-8000-0000000000b1'$$,
  '42501',
  null,
  'API roles still cannot move a role');
reset role;

select lives_ok(
  $$update public.workspace_roles set ws_id = '5dfe0000-0000-4000-8000-0000000000a2'
    where id = '5dfe0000-0000-4000-8000-0000000000b1'$$,
  'a role moves when every holder is a MEMBER of the destination');

select lives_ok(
  $$update public.workspace_roles set ws_id = '5dfe0000-0000-4000-8000-0000000000a2'
    where id = '5dfe0000-0000-4000-8000-0000000000b4'$$,
  'a role with no holders moves');

select is(
  (select ws_id::text from public.workspace_roles where id = '5dfe0000-0000-4000-8000-0000000000b2'),
  '5dfe0000-0000-4000-8000-0000000000a1',
  'a refused move leaves the role in place');

select lives_ok(
  $$update public.workspace_roles set name = 'Renamed source-only holder'
    where id = '5dfe0000-0000-4000-8000-0000000000b2'$$,
  'updates that keep the workspace are unaffected');

select * from finish();
rollback;
