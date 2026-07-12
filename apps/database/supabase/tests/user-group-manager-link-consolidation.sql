begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, private, extensions;

select plan(7);

select has_function(
  'private',
  'consolidate_user_group_manager_link',
  array['uuid', 'uuid'],
  'manager link consolidation helper exists in the private schema'
);

select has_trigger(
  'public',
  'workspace_user_groups_users',
  'consolidate_user_group_manager_link',
  'manager memberships trigger automatic link consolidation'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.consolidate_user_group_manager_link(uuid, uuid)',
    'execute'
  ),
  'authenticated callers cannot execute the private consolidation helper'
);

insert into public.users (id, display_name)
values
  ('00000000-0000-0000-0000-000000032001', 'Manager Link Owner'),
  ('00000000-0000-0000-0000-000000032002', 'Unique Manager'),
  ('00000000-0000-0000-0000-000000032003', 'Ambiguous Manager A'),
  ('00000000-0000-0000-0000-000000032004', 'Ambiguous Manager B')
on conflict (id) do nothing;

insert into public.user_private_details (user_id, email)
values
  ('00000000-0000-0000-0000-000000032002', ' unique.manager@example.com '),
  ('00000000-0000-0000-0000-000000032003', 'shared.manager@example.com'),
  ('00000000-0000-0000-0000-000000032004', ' SHARED.MANAGER@example.com ')
on conflict (user_id) do update set email = excluded.email;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000032010',
  'Manager Link Consolidation Workspace',
  false,
  '00000000-0000-0000-0000-000000032001'
)
on conflict (id) do nothing;

set local session_replication_role = replica;

insert into public.workspace_members (ws_id, user_id)
values
  (
    '00000000-0000-0000-0000-000000032010',
    '00000000-0000-0000-0000-000000032002'
  ),
  (
    '00000000-0000-0000-0000-000000032010',
    '00000000-0000-0000-0000-000000032003'
  ),
  (
    '00000000-0000-0000-0000-000000032010',
    '00000000-0000-0000-0000-000000032004'
  )
on conflict do nothing;

set local session_replication_role = origin;

insert into public.workspace_user_groups (id, ws_id, name, archived)
values
  (
    '00000000-0000-0000-0000-000000032101',
    '00000000-0000-0000-0000-000000032010',
    'Unique Manager Group',
    false
  ),
  (
    '00000000-0000-0000-0000-000000032102',
    '00000000-0000-0000-0000-000000032010',
    'Ambiguous Manager Group',
    false
  )
on conflict (id) do nothing;

insert into public.workspace_users (id, ws_id, display_name, email)
values
  (
    '00000000-0000-0000-0000-000000032201',
    '00000000-0000-0000-0000-000000032010',
    'Unique Manager Profile',
    'UNIQUE.MANAGER@example.com'
  ),
  (
    '00000000-0000-0000-0000-000000032202',
    '00000000-0000-0000-0000-000000032010',
    'Ambiguous Manager Profile',
    'shared.manager@example.com'
  )
on conflict (id) do nothing;

insert into public.workspace_user_groups_users (group_id, user_id, role)
values (
  '00000000-0000-0000-0000-000000032101',
  '00000000-0000-0000-0000-000000032201',
  'STUDENT'
);

select is(
  (
    select count(*)::integer
    from public.workspace_user_linked_users
    where virtual_user_id = '00000000-0000-0000-0000-000000032201'
  ),
  0,
  'student memberships do not create platform links'
);

update public.workspace_user_groups_users
set role = 'TEACHER'
where group_id = '00000000-0000-0000-0000-000000032101'
  and user_id = '00000000-0000-0000-0000-000000032201';

select is(
  (
    select platform_user_id
    from public.workspace_user_linked_users
    where virtual_user_id = '00000000-0000-0000-0000-000000032201'
  ),
  '00000000-0000-0000-0000-000000032002'::uuid,
  'promoting a unique matching workspace member to manager creates its link'
);

insert into public.workspace_user_groups_users (group_id, user_id, role)
values (
  '00000000-0000-0000-0000-000000032102',
  '00000000-0000-0000-0000-000000032202',
  'TEACHER'
);

select is(
  (
    select count(*)::integer
    from public.workspace_user_linked_users
    where virtual_user_id = '00000000-0000-0000-0000-000000032202'
  ),
  0,
  'ambiguous matching platform members are not linked automatically'
);

select is(
  private.consolidate_user_group_manager_link(
    '00000000-0000-0000-0000-000000032201',
    '00000000-0000-0000-0000-000000032010'
  ),
  '00000000-0000-0000-0000-000000032002'::uuid,
  'consolidation is idempotent for an existing manager link'
);

select * from finish();

rollback;
