begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

insert into public.users (id, display_name) values
  ('07400000-0000-4000-8000-000000000001', 'Synthetic owner'),
  ('07400000-0000-4000-8000-000000000002', 'Synthetic account');
insert into public.workspaces (id, name, creator_id, personal)
values ('07400000-0000-4000-8000-000000000010', 'Link test workspace',
  '07400000-0000-4000-8000-000000000001', false);
insert into public.workspace_members (ws_id, user_id, type) values
  ('07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000001', 'MEMBER'),
  ('07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000002', 'MEMBER')
on conflict do nothing;

-- Simulate the legacy missing-link case independently of membership triggers.
delete from public.workspace_user_linked_users
where ws_id = '07400000-0000-4000-8000-000000000010'
  and platform_user_id = '07400000-0000-4000-8000-000000000002';
insert into public.user_private_details (user_id, email)
values ('07400000-0000-4000-8000-000000000002', 'account@example.invalid')
on conflict (user_id) do update set email = excluded.email;

insert into public.workspace_users (id, ws_id, display_name, email)
values ('07400000-0000-4000-8000-000000000011',
        '07400000-0000-4000-8000-000000000010', 'Synthetic contact',
        'original@example.invalid');
update public.workspace_users set email = 'account@example.invalid'
where id = '07400000-0000-4000-8000-000000000011';

set local role authenticated;
select throws_ok(
  $$insert into public.workspace_user_linked_users
    (ws_id, virtual_user_id, platform_user_id)
    values ('07400000-0000-4000-8000-000000000010',
      '07400000-0000-4000-8000-000000000011',
      '07400000-0000-4000-8000-000000000002')$$,
  '42501', 'permission denied for table workspace_user_linked_users',
  'Authenticated requests cannot write mappings directly'
);
reset role;

select is(private.confirm_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  '07400000-0000-4000-8000-000000000012',
  '07400000-0000-4000-8000-000000000002'
), 'confirmation_required', 'A mutable email match cannot link a contact');
select is((select count(*) from public.workspace_user_linked_users
  where virtual_user_id = '07400000-0000-4000-8000-000000000011'),
  0::bigint, 'The rejected confirmation leaves the contact unlinked');

create temporary table link_test_invitation on commit drop as
select private.invite_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  '07400000-0000-4000-8000-000000000002',
  '07400000-0000-4000-8000-000000000001'
) as id;

select ok(private.preview_contact_account_link(
  '07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000011', (select id from link_test_invitation), '07400000-0000-4000-8000-000000000001'
) is null, 'A different account receives no invitation details');
select is(private.preview_contact_account_link(
  '07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000011', (select id from link_test_invitation), '07400000-0000-4000-8000-000000000002'
)->>'contact', 'Synthetic contact', 'The recipient sees the contact display name');
select is(private.finish_contact_account_link_invitation(
  '07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000011', (select id from link_test_invitation), '07400000-0000-4000-8000-000000000002', 'decline'
), 'declined', 'The recipient can decline');
select ok(private.preview_contact_account_link(
  '07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000011', (select id from link_test_invitation), '07400000-0000-4000-8000-000000000002'
) is null, 'A declined invitation is not available');
update link_test_invitation set id = private.invite_contact_account_link(
  '07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000011', '07400000-0000-4000-8000-000000000002', '07400000-0000-4000-8000-000000000001'
);
select is(private.finish_contact_account_link_invitation(
  '07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000011', null, '07400000-0000-4000-8000-000000000001', 'revoke'
), 'revoked', 'An authorized operator can cancel the active invitation');
update link_test_invitation set id = private.invite_contact_account_link(
  '07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000011', '07400000-0000-4000-8000-000000000002', '07400000-0000-4000-8000-000000000001'
);

select is(private.confirm_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000001'
), 'confirmation_required', 'An invitation is bound to the invited account');

select is(private.confirm_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000002'
), 'linked', 'The invited account can explicitly confirm');

select is((select count(*) from private.contact_account_link_audit
  where ws_id = '07400000-0000-4000-8000-000000000010'
    and contact_id = '07400000-0000-4000-8000-000000000011'
    and actor_id = '07400000-0000-4000-8000-000000000002'
    and outcome = 'linked'), 1::bigint, 'The link commits with an attributed audit event');

select is(private.confirm_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000002'
), 'confirmation_required', 'A consumed invitation cannot be replayed');
select * from finish();
rollback;
