-- New workspaces seed no MEMBER admin default, so an invited member with no
-- role holds only the seeded drive and chat defaults.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('5dfa0000-0000-4000-8000-000000000001', 'mdal-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5dfa0000-0000-4000-8000-000000000002', 'mdal-member@example.com', now(), '{}'::jsonb, '{}'::jsonb);

insert into public.workspaces (id, name, creator_id, personal)
values ('5dfa0000-0000-4000-8000-0000000000a1', 'Least privilege team', '5dfa0000-0000-4000-8000-000000000001', false);

insert into public.workspace_members (ws_id, user_id, type)
values ('5dfa0000-0000-4000-8000-0000000000a1', '5dfa0000-0000-4000-8000-000000000002', 'MEMBER')
on conflict do nothing;

select is(
  (select array_agg(permission::text order by permission::text)
   from public.workspace_default_permissions
   where ws_id = '5dfa0000-0000-4000-8000-0000000000a1'
     and member_type = 'MEMBER' and enabled),
  array['create_chat', 'manage_drive_tasks_directory', 'view_chat', 'view_drive'],
  'a new workspace seeds only the drive and chat MEMBER defaults'
);

select ok(
  not exists (
    select 1 from public.workspace_default_permissions
    where ws_id = '5dfa0000-0000-4000-8000-0000000000a1'
      and permission = 'admin'
  ),
  'a new workspace has no admin default row'
);

select ok(
  not exists (
    select 1 from public.workspace_default_permissions
    where member_type = 'MEMBER' and permission = 'admin' and enabled
  ),
  'no workspace keeps an enabled MEMBER admin default'
);

-- Evaluate as the invited member's own session.
select set_config('request.jwt.claims',
  '{"sub":"5dfa0000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

create temp table mdal_results as
select p as permission,
  public.has_workspace_permission('5dfa0000-0000-4000-8000-0000000000a1',
    '5dfa0000-0000-4000-8000-000000000002', p) as granted
from unnest(array[
  'admin', 'manage_workspace_members', 'manage_workspace_roles',
  'manage_workspace_secrets', 'manage_workspace_settings',
  'manage_workspace_security', 'manage_workspace_billing', 'manage_api_keys',
  'manage_ai_keys', 'manage_e2ee', 'manage_sso_clients', 'manage_finance',
  'manage_subscription', 'view_drive', 'create_chat'
]) p;

reset role;

select is(
  (select array_agg(permission order by permission) from mdal_results where granted),
  array['create_chat', 'view_drive'],
  'an invited member with no role holds only the seeded drive and chat permissions'
);

-- The creator keeps full access.
select set_config('request.jwt.claims',
  '{"sub":"5dfa0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select ok(
  public.has_workspace_permission('5dfa0000-0000-4000-8000-0000000000a1',
    '5dfa0000-0000-4000-8000-000000000001', 'manage_workspace_secrets'),
  'the workspace creator keeps manage_workspace_secrets'
);
reset role;

select * from finish();
rollback;
