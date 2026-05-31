begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, private, extensions;

select plan(2);

delete from public.workspace_members
where ws_id = '00000000-0000-0000-0000-000000000004'
  and user_id = '00000000-0000-0000-0000-000000000003';

insert into public.workspace_users (
  id,
  ws_id,
  full_name,
  display_name,
  email
)
values (
  '00000000-0000-0000-0000-000000000820',
  '00000000-0000-0000-0000-000000000004',
  'Linked Teacher',
  'Linked Teacher',
  'user2@tuturuuu.com'
)
on conflict (id) do nothing;

insert into public.workspace_user_linked_users (
  platform_user_id,
  virtual_user_id,
  ws_id
)
values (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000820',
  '00000000-0000-0000-0000-000000000004'
)
on conflict do nothing;

insert into private.topic_announcement_contacts (
  id,
  ws_id,
  workspace_user_id,
  name,
  email
)
values (
  '00000000-0000-0000-0000-000000000830',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000820',
  'Linked Teacher',
  'user2@tuturuuu.com'
)
on conflict (id) do update
set workspace_user_id = excluded.workspace_user_id,
    email = excluded.email;

select is(
  private.topic_announcement_contact_has_linked_verified_email(
    '00000000-0000-0000-0000-000000000830'
  ),
  false,
  'linked confirmed contact is not auto-confirmed when the platform user is not a same-workspace member'
);

insert into public.workspace_members (ws_id, user_id)
values (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000003'
)
on conflict do nothing;

select is(
  private.topic_announcement_contact_has_linked_verified_email(
    '00000000-0000-0000-0000-000000000830'
  ),
  true,
  'linked confirmed contact is auto-confirmed when the platform user is a same-workspace member'
);

select * from finish();

rollback;
