begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(40);

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
select throws_ok(
  $$select private.unlink_contact_account_link(
    '07400000-0000-4000-8000-000000000010',
    '07400000-0000-4000-8000-000000000011',
    '07400000-0000-4000-8000-000000000002',
    '07400000-0000-4000-8000-000000000099'
  )$$,
  '42501', 'Insufficient permissions', 'An outsider cannot unlink an account'
);
select is(private.unlink_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  '07400000-0000-4000-8000-000000000002',
  '07400000-0000-4000-8000-000000000002'
), 'unlinked', 'The linked account holder can unlink');
select is((select count(*) from private.contact_account_link_audit
  where ws_id = '07400000-0000-4000-8000-000000000010'
    and contact_id = '07400000-0000-4000-8000-000000000011'
    and actor_id = '07400000-0000-4000-8000-000000000002'
    and account_id = '07400000-0000-4000-8000-000000000002'
    and outcome = 'unlinked'), 1::bigint, 'Unlink commits with an attributed audit event');
select ok(not has_function_privilege(
  'anon', 'private.unlink_contact_account_link(uuid, uuid, uuid, uuid)', 'execute'
), 'Anon cannot execute unlink');
select is((select count(*) from public.workspace_members
  where ws_id = '07400000-0000-4000-8000-000000000010'
    and user_id = '07400000-0000-4000-8000-000000000002'),
  1::bigint, 'Unlink preserves the workspace membership');

insert into public.workspace_user_linked_users (ws_id, virtual_user_id, platform_user_id)
values ('07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  '07400000-0000-4000-8000-000000000002');

insert into public.users (id, display_name)
values ('07400000-0000-4000-8000-000000000003', 'Synthetic member');
insert into public.workspace_members (ws_id, user_id, type)
values ('07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000003', 'MEMBER');
delete from public.workspace_default_permissions where
  ws_id = '07400000-0000-4000-8000-000000000010';
delete from public.workspace_role_members
where user_id = '07400000-0000-4000-8000-000000000003';
insert into public.workspaces (id, name, creator_id, personal)
values ('07400000-0000-4000-8000-000000000099', 'Other test workspace',
  '07400000-0000-4000-8000-000000000001', false);

select ok(not public.has_workspace_permission(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000003',
  'update_users'
), 'The synthetic member has no update_users permission');
select throws_ok(
  $$select private.unlink_contact_account_link(
    '07400000-0000-4000-8000-000000000010',
    '07400000-0000-4000-8000-000000000011',
    '07400000-0000-4000-8000-000000000002',
    '07400000-0000-4000-8000-000000000003'
  )$$,
  '42501', 'Insufficient permissions',
  'A workspace member without update_users cannot unlink another account'
);
select is(private.unlink_contact_account_link(
  '07400000-0000-4000-8000-000000000099',
  '07400000-0000-4000-8000-000000000011',
  '07400000-0000-4000-8000-000000000002',
  '07400000-0000-4000-8000-000000000002'
), 'ineligible', 'An unlink scoped to a different workspace is ineligible');
select is(private.unlink_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  '07400000-0000-4000-8000-000000000002',
  '07400000-0000-4000-8000-000000000001'
), 'unlinked', 'A workspace administrator with update_users can unlink the account');
insert into public.users (id, display_name)
values ('07400000-0000-4000-8000-000000000004', 'Provisioned account');
insert into public.workspace_members (ws_id, user_id, type)
values ('07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000004', 'MEMBER');

create temporary table provisioned_test_profile on commit drop as
select virtual_user_id as id
from public.workspace_user_linked_users
where ws_id = '07400000-0000-4000-8000-000000000010'
  and platform_user_id = '07400000-0000-4000-8000-000000000004';

select is((select count(*) from provisioned_test_profile), 1::bigint,
  'Membership creates a linked profile before invitation without fixture deletion');

update link_test_invitation set id = private.invite_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  '07400000-0000-4000-8000-000000000004',
  '07400000-0000-4000-8000-000000000001'
);
select ok((select id from link_test_invitation) is not null,
  'A marked provisioned profile does not block an invitation');
select ok(private.preview_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000004'
) is not null, 'The recipient can preview the provisioned-profile invitation');
select ok(private.preview_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000003'
) is null, 'A different account cannot preview the starter-profile invitation');
select is(private.confirm_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000003'
), 'confirmation_required', 'A different account cannot confirm the replacement');

insert into public.workspace_user_groups (id, ws_id, name, archived)
values ('07400000-0000-4000-8000-000000000080',
  '07400000-0000-4000-8000-000000000010', 'Merge collision fixture', false);
insert into public.workspace_user_groups_users (group_id, user_id, role)
values ('07400000-0000-4000-8000-000000000080',
  '07400000-0000-4000-8000-000000000011', 'STUDENT'),
  ('07400000-0000-4000-8000-000000000080',
  (select id from provisioned_test_profile), 'STUDENT');
select is(private.confirm_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000011',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000004'
), 'linked', 'Consent merges the provisioned profile');
select ok(
  exists (select 1 from public.workspace_user_linked_users
    where ws_id = '07400000-0000-4000-8000-000000000010'
      and virtual_user_id = '07400000-0000-4000-8000-000000000011'
      and platform_user_id = '07400000-0000-4000-8000-000000000004')
  and not exists (select 1 from public.workspace_users
    where id = (select id from provisioned_test_profile)),
  'The original contact inherits the link and the fresh source is removed'
);
select ok(exists (
  select 1
  from private.contact_account_link_audit audit
  where audit.invitation_id = (select id from link_test_invitation)
    and audit.outcome = 'linked'
    and audit.merge_result @> '{
      "success": true,
      "collision_details": [{
        "table": "workspace_user_groups_users",
        "deleted_count": 1,
        "deleted_pk_values": ["07400000-0000-4000-8000-000000000080"]
      }]
    }'::jsonb
), 'The consented merge audit includes the deleted collision records');
select ok(not has_function_privilege(
  'authenticated', 'private.merge_workspace_users_for_actor(uuid,uuid,uuid,uuid)', 'execute'
), 'Authenticated callers cannot invoke the actor-parameterized merge');
select ok(not has_function_privilege(
  'service_role', 'private.merge_workspace_users_for_actor(uuid,uuid,uuid,uuid)', 'execute'
), 'Service role cannot invoke the actor-parameterized merge directly');

insert into public.workspace_users (id, ws_id, display_name)
values
  ('07400000-0000-4000-8000-000000000012',
   '07400000-0000-4000-8000-000000000010', 'Second contact'),
  ('07400000-0000-4000-8000-000000000014',
   '07400000-0000-4000-8000-000000000010', 'Merge source');
select ok(private.invite_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000012',
  '07400000-0000-4000-8000-000000000004',
  '07400000-0000-4000-8000-000000000001'
) is null, 'A linked profile without provisioning provenance cannot receive another replacement invite');

insert into public.workspace_roles (id, ws_id, name)
values ('07400000-0000-4000-8000-000000000070',
  '07400000-0000-4000-8000-000000000010', 'Synthetic merge operator');
insert into public.workspace_role_members (role_id, user_id)
values ('07400000-0000-4000-8000-000000000070',
  '07400000-0000-4000-8000-000000000003');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  ('07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000070', 'update_users', true),
  ('07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000070', 'delete_users', true),
  ('07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000070', 'view_users_public_info', true),
  ('07400000-0000-4000-8000-000000000010', '07400000-0000-4000-8000-000000000070', 'view_users_private_info', true);

insert into public.users (id, display_name)
values ('07400000-0000-4000-8000-000000000005', 'Second starter account');
insert into public.workspace_members (ws_id, user_id, type)
values ('07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000005', 'MEMBER');
update provisioned_test_profile set id = (
  select virtual_user_id from public.workspace_user_linked_users
  where ws_id = '07400000-0000-4000-8000-000000000010'
    and platform_user_id = '07400000-0000-4000-8000-000000000005'
);

update link_test_invitation set id = private.invite_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000012',
  '07400000-0000-4000-8000-000000000005',
  '07400000-0000-4000-8000-000000000003'
);
select ok((select id from link_test_invitation) is not null,
  'An operator with delete_users can issue a replacement invitation');
delete from public.workspace_role_permissions
where role_id = '07400000-0000-4000-8000-000000000070'
  and permission = 'delete_users';
select is(private.confirm_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000012',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000005'
), 'ineligible', 'Losing delete_users makes confirmation ineligible');
select is((select virtual_user_id from public.workspace_user_linked_users
  where ws_id = '07400000-0000-4000-8000-000000000010'
    and platform_user_id = '07400000-0000-4000-8000-000000000005'),
  (select id from provisioned_test_profile),
  'A failed confirmation preserves the starter profile mapping');

update link_test_invitation set id = private.invite_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000012',
  '07400000-0000-4000-8000-000000000005',
  '07400000-0000-4000-8000-000000000001'
);
select ok((select id from link_test_invitation) is not null, 'A fresh invitation is available before merging');
select ok((private.merge_workspace_users_for_actor(
  '07400000-0000-4000-8000-000000000014',
  (select id from provisioned_test_profile),
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000001'
)->>'success')::boolean, 'The starter profile becomes the retained merge target');
select ok(not exists (select 1 from private.contact_account_provisioned_profiles
  where profile_id = (select id from provisioned_test_profile)),
  'A profile retained by a merge loses its starter provenance');
select ok(private.preview_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000012',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000005'
) is null, 'The preview is unavailable after the starter profile is merged');
select is(private.confirm_contact_account_link(
  '07400000-0000-4000-8000-000000000010',
  '07400000-0000-4000-8000-000000000012',
  (select id from link_test_invitation),
  '07400000-0000-4000-8000-000000000005'
), 'ineligible', 'Confirmation cannot merge a profile that has become a merge target');
select * from finish();
rollback;
