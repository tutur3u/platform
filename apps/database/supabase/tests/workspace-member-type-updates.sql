begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(8);

select has_function(
  'public',
  'enforce_workspace_member_type_update',
  'workspace member type update trigger helper exists'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'workspace_members_enforce_type_update'
      and tgrelid = 'public.workspace_members'::regclass
      and not tgisinternal
  ),
  'workspace_members type update trigger is installed'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_members'
      and policyname = 'Allow workspace managers to update members'
      and cmd = 'UPDATE'
      and qual like '%has_workspace_permission%'
      and with_check like '%has_workspace_permission%'
      and qual not like '%auth.uid() = user_id%'
      and with_check not like '%auth.uid() = user_id%'
  ),
  'workspace_members update policy requires manage_workspace_members without self-update fallback'
);

insert into public.users (id)
values
  ('00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000001002'),
  ('00000000-0000-0000-0000-000000001003')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000001010',
  'Workspace Member Type Update Test',
  false,
  '00000000-0000-0000-0000-000000001001'
)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  (
    '00000000-0000-0000-0000-000000001010',
    '00000000-0000-0000-0000-000000001001',
    'MEMBER'
  ),
  (
    '00000000-0000-0000-0000-000000001010',
    '00000000-0000-0000-0000-000000001002',
    'MEMBER'
  ),
  (
    '00000000-0000-0000-0000-000000001010',
    '00000000-0000-0000-0000-000000001003',
    'GUEST'
  )
on conflict (ws_id, user_id) do update
set type = excluded.type;

update public.workspace_default_permissions
set enabled = false
where ws_id = '00000000-0000-0000-0000-000000001010'
  and member_type = 'MEMBER'
  and permission = 'admin';

set local role authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000001002',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$
    update public.workspace_members
    set type = 'GUEST'
    where ws_id = '00000000-0000-0000-0000-000000001010'
      and user_id = '00000000-0000-0000-0000-000000001002'
    returning 1
  $$,
  $$
    select 1
    where false
  $$,
  'ordinary members cannot self-update workspace member type through RLS'
);

reset role;

select is(
  (
    select type
    from public.workspace_members
    where ws_id = '00000000-0000-0000-0000-000000001010'
      and user_id = '00000000-0000-0000-0000-000000001002'
  ),
  'MEMBER'::public.workspace_member_type,
  'ordinary member type remains unchanged after denied self-update'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000001002',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$
    update public.workspace_members
    set type = 'GUEST'
    where ws_id = '00000000-0000-0000-0000-000000001010'
      and user_id = '00000000-0000-0000-0000-000000001002'
  $$,
  '42501',
  'Only workspace managers can change workspace member type',
  'trigger rejects non-manager type changes even if a future policy permits the row update'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000001001',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    update public.workspace_members
    set type = 'MEMBER'
    where ws_id = '00000000-0000-0000-0000-000000001010'
      and user_id = '00000000-0000-0000-0000-000000001003'
  $$,
  'workspace creator can change workspace member type'
);

select is(
  (
    select type
    from public.workspace_members
    where ws_id = '00000000-0000-0000-0000-000000001010'
      and user_id = '00000000-0000-0000-0000-000000001003'
  ),
  'MEMBER'::public.workspace_member_type,
  'manager update changes guest membership to member'
);

select * from finish();

rollback;
