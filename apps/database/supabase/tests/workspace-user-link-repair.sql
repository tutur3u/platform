begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(10);

set local session_replication_role = replica;

insert into public.users (id, display_name, handle)
values
  ('00000000-0000-0000-0000-000000041001', 'Workspace Owner', 'workspace-owner'),
  ('00000000-0000-0000-0000-000000041002', null, null),
  ('00000000-0000-0000-0000-000000041003', 'Unique Member', null),
  ('00000000-0000-0000-0000-000000041004', 'Ambiguous Member', null),
  ('00000000-0000-0000-0000-000000041005', 'Non-member', null),
  ('00000000-0000-0000-0000-000000041006', null, null)
on conflict (id) do nothing;

insert into public.user_private_details (user_id, email, full_name)
values
  ('00000000-0000-0000-0000-000000041002', 'incomplete@example.com', 'Incomplete Profile'),
  ('00000000-0000-0000-0000-000000041003', 'unique@example.com', 'Unique Member'),
  ('00000000-0000-0000-0000-000000041004', 'ambiguous@example.com', 'Ambiguous Member')
on conflict (user_id) do update
set email = excluded.email,
    full_name = excluded.full_name;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000041010',
  'Workspace User Link Repair',
  false,
  '00000000-0000-0000-0000-000000041001'
)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-0000-0000-000000041010', '00000000-0000-0000-0000-000000041001', 'MEMBER'),
  ('00000000-0000-0000-0000-000000041010', '00000000-0000-0000-0000-000000041002', 'MEMBER'),
  ('00000000-0000-0000-0000-000000041010', '00000000-0000-0000-0000-000000041003', 'MEMBER'),
  ('00000000-0000-0000-0000-000000041010', '00000000-0000-0000-0000-000000041004', 'MEMBER'),
  ('00000000-0000-0000-0000-000000041010', '00000000-0000-0000-0000-000000041006', 'MEMBER'),
  ('00000000-0000-0000-0000-000000041010', '00000000-0000-0000-0000-000000041099', 'MEMBER')
on conflict do nothing;

insert into public.workspace_users (id, ws_id, display_name, email)
values
  ('00000000-0000-0000-0000-000000041101', '00000000-0000-0000-0000-000000041010', 'Unique Existing', 'UNIQUE@example.com'),
  ('00000000-0000-0000-0000-000000041102', '00000000-0000-0000-0000-000000041010', 'Ambiguous Existing A', 'ambiguous@example.com'),
  ('00000000-0000-0000-0000-000000041103', '00000000-0000-0000-0000-000000041010', 'Ambiguous Existing B', 'AMBIGUOUS@example.com')
on conflict (id) do nothing;

set local session_replication_role = origin;

select is(
  public.ensure_workspace_user_link(
    '00000000-0000-0000-0000-000000041002',
    '00000000-0000-0000-0000-000000041010'
  ),
  (
    select virtual_user_id
    from public.workspace_user_linked_users
    where platform_user_id = '00000000-0000-0000-0000-000000041002'
      and ws_id = '00000000-0000-0000-0000-000000041010'
  ),
  'a member with a null platform display name receives a workspace-user link'
);

select is(
  (
    select wu.display_name
    from public.workspace_user_linked_users link
    join public.workspace_users wu on wu.id = link.virtual_user_id
    where link.platform_user_id = '00000000-0000-0000-0000-000000041002'
      and link.ws_id = '00000000-0000-0000-0000-000000041010'
  ),
  'Incomplete Profile',
  'the repair falls back to the private full name'
);

select is(
  public.ensure_workspace_user_link(
    '00000000-0000-0000-0000-000000041002',
    '00000000-0000-0000-0000-000000041010'
  ),
  (
    select virtual_user_id
    from public.workspace_user_linked_users
    where platform_user_id = '00000000-0000-0000-0000-000000041002'
      and ws_id = '00000000-0000-0000-0000-000000041010'
  ),
  'repair is idempotent for an existing link'
);

select is(
  public.ensure_workspace_user_link(
    '00000000-0000-0000-0000-000000041003',
    '00000000-0000-0000-0000-000000041010'
  ),
  '00000000-0000-0000-0000-000000041101'::uuid,
  'a unique case-insensitive email match reuses the existing workspace profile'
);

select isnt(
  public.ensure_workspace_user_link(
    '00000000-0000-0000-0000-000000041004',
    '00000000-0000-0000-0000-000000041010'
  ),
  '00000000-0000-0000-0000-000000041102'::uuid,
  'an ambiguous email match does not reuse the first workspace profile'
);

select isnt(
  (
    select virtual_user_id
    from public.workspace_user_linked_users
    where platform_user_id = '00000000-0000-0000-0000-000000041004'
      and ws_id = '00000000-0000-0000-0000-000000041010'
  ),
  '00000000-0000-0000-0000-000000041103'::uuid,
  'an ambiguous email match does not reuse the second workspace profile'
);

select like(
  (
    select wu.display_name
    from public.workspace_user_linked_users link
    join public.workspace_users wu on wu.id = link.virtual_user_id
    where link.platform_user_id = '00000000-0000-0000-0000-000000041006'
      and link.ws_id = '00000000-0000-0000-0000-000000041010'
  ),
  'User 00000000',
  'a profile with no name or email receives a stable generic display name'
)
from (
  select public.ensure_workspace_user_link(
    '00000000-0000-0000-0000-000000041006',
    '00000000-0000-0000-0000-000000041010'
  )
) repaired;

select throws_ok(
  $$
    select public.ensure_workspace_user_link(
      '00000000-0000-0000-0000-000000041005',
      '00000000-0000-0000-0000-000000041010'
    )
  $$,
  'P0001',
  'User 00000000-0000-0000-0000-000000041005 is not a member of workspace 00000000-0000-0000-0000-000000041010',
  'an existing non-member is rejected'
);

select throws_ok(
  $$
    select public.ensure_workspace_user_link(
      '00000000-0000-0000-0000-000000041099',
      '00000000-0000-0000-0000-000000041010'
    )
  $$,
  'P0001',
  'User 00000000-0000-0000-0000-000000041099 not found',
  'an orphaned membership cannot create a link for a missing platform user'
);

select is(
  (
    select count(*)::integer
    from public.workspace_user_linked_users
    where ws_id = '00000000-0000-0000-0000-000000041010'
  ),
  4,
  'only valid workspace members receive links'
);

select * from finish();

rollback;
