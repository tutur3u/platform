begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(2);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000801',
    'authenticated',
    'authenticated',
    'workspace-owner@example.com',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000802',
    'authenticated',
    'authenticated',
    'linked-teacher@example.com',
    now(),
    now(),
    now()
  )
on conflict (id) do update
set email = excluded.email,
    email_confirmed_at = excluded.email_confirmed_at,
    updated_at = excluded.updated_at;

insert into public.users (id)
values
  ('00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000802')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000000810',
  'Topic Announcement Linked Member Workspace',
  false,
  '00000000-0000-0000-0000-000000000801'
)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id)
values (
  '00000000-0000-0000-0000-000000000810',
  '00000000-0000-0000-0000-000000000801'
)
on conflict do nothing;

insert into public.workspace_users (
  id,
  ws_id,
  full_name,
  display_name,
  email
)
values (
  '00000000-0000-0000-0000-000000000820',
  '00000000-0000-0000-0000-000000000810',
  'Linked Teacher',
  'Linked Teacher',
  'linked-teacher@example.com'
)
on conflict (id) do nothing;

insert into public.workspace_user_linked_users (
  platform_user_id,
  virtual_user_id,
  ws_id
)
values (
  '00000000-0000-0000-0000-000000000802',
  '00000000-0000-0000-0000-000000000820',
  '00000000-0000-0000-0000-000000000810'
)
on conflict do nothing;

insert into public.topic_announcement_contacts (
  id,
  ws_id,
  workspace_user_id,
  name,
  email
)
values (
  '00000000-0000-0000-0000-000000000830',
  '00000000-0000-0000-0000-000000000810',
  '00000000-0000-0000-0000-000000000820',
  'Linked Teacher',
  'linked-teacher@example.com'
)
on conflict (id) do update
set workspace_user_id = excluded.workspace_user_id,
    email = excluded.email;

select is(
  public.topic_announcement_contact_has_linked_verified_email(
    '00000000-0000-0000-0000-000000000830'
  ),
  false,
  'linked confirmed contact is not auto-confirmed when the platform user is not a same-workspace member'
);

insert into public.workspace_members (ws_id, user_id)
values (
  '00000000-0000-0000-0000-000000000810',
  '00000000-0000-0000-0000-000000000802'
)
on conflict do nothing;

select is(
  public.topic_announcement_contact_has_linked_verified_email(
    '00000000-0000-0000-0000-000000000830'
  ),
  true,
  'linked confirmed contact is auto-confirmed when the platform user is a same-workspace member'
);

select * from finish();

rollback;
