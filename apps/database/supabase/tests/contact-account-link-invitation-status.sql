begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

insert into public.users (id, display_name) values
  ('07500000-0000-4000-8000-000000000001', 'Synthetic owner'),
  ('07500000-0000-4000-8000-000000000002', 'Synthetic account'),
  ('07500000-0000-4000-8000-000000000003', 'Synthetic member'),
  ('07500000-0000-4000-8000-000000000004', 'Synthetic outsider');
insert into public.workspaces (id, name, creator_id, personal)
values ('07500000-0000-4000-8000-000000000010', 'Status test workspace',
  '07500000-0000-4000-8000-000000000001', false);
insert into public.workspace_members (ws_id, user_id, type) values
  ('07500000-0000-4000-8000-000000000010', '07500000-0000-4000-8000-000000000001', 'MEMBER'),
  ('07500000-0000-4000-8000-000000000010', '07500000-0000-4000-8000-000000000002', 'MEMBER'),
  ('07500000-0000-4000-8000-000000000010', '07500000-0000-4000-8000-000000000003', 'MEMBER')
on conflict do nothing;
delete from public.workspace_default_permissions
where ws_id = '07500000-0000-4000-8000-000000000010';
delete from public.workspace_role_members
where user_id = '07500000-0000-4000-8000-000000000003';
-- Simulate an unlinked account independently of membership provisioning.
delete from public.workspace_user_linked_users
where ws_id = '07500000-0000-4000-8000-000000000010'
  and platform_user_id = '07500000-0000-4000-8000-000000000002';

insert into public.workspace_users (id, ws_id, display_name)
values ('07500000-0000-4000-8000-000000000011',
  '07500000-0000-4000-8000-000000000010', 'Synthetic contact');

create temporary table status_test_ids (
  label text primary key,
  id uuid
) on commit drop;

create function pg_temp.link_status() returns jsonb
language sql as $$
  select private.read_contact_account_link_invitation(
    '07500000-0000-4000-8000-000000000010',
    '07500000-0000-4000-8000-000000000011',
    '07500000-0000-4000-8000-000000000001'
  )
$$;

create function pg_temp.invite() returns uuid
language sql as $$
  select private.invite_contact_account_link(
    '07500000-0000-4000-8000-000000000010',
    '07500000-0000-4000-8000-000000000011',
    '07500000-0000-4000-8000-000000000002',
    '07500000-0000-4000-8000-000000000001'
  )
$$;

select is(pg_temp.link_status(), null::jsonb,
  'A contact without invitation history has no status');

select throws_ok(
  $$select private.read_contact_account_link_invitation(
    '07500000-0000-4000-8000-000000000010',
    '07500000-0000-4000-8000-000000000011',
    '07500000-0000-4000-8000-000000000003')$$,
  '42501', 'Insufficient permissions',
  'A member without contact permissions cannot read the status'
);
select throws_ok(
  $$select private.read_contact_account_link_invitation(
    '07500000-0000-4000-8000-000000000010',
    '07500000-0000-4000-8000-000000000011',
    '07500000-0000-4000-8000-000000000004')$$,
  '42501', 'Insufficient permissions',
  'A non-member cannot read the status'
);

set local role authenticated;
select throws_ok(
  $$select private.read_contact_account_link_invitation(
    '07500000-0000-4000-8000-000000000010',
    '07500000-0000-4000-8000-000000000011',
    '07500000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'Signed-in clients cannot call the status function directly'
);
reset role;

insert into status_test_ids values ('first', pg_temp.invite());
select is(pg_temp.link_status()->>'state', 'pending',
  'An active invitation is pending');
select is((pg_temp.link_status()->>'invitationId')::uuid,
  (select id from status_test_ids where label = 'first'),
  'A pending status exposes the invitation to share');
select is(pg_temp.link_status()->>'accountId',
  '07500000-0000-4000-8000-000000000002',
  'The status identifies the invited account');
select ok(pg_temp.link_status()->>'expiresAt' is not null,
  'A pending status includes its expiry');
select is(
  (select count(*) from jsonb_object_keys(pg_temp.link_status())),
  5::bigint, 'The status returns only state, identifiers and timestamps');

insert into status_test_ids values ('second', pg_temp.invite());
select is((pg_temp.link_status()->>'invitationId')::uuid,
  (select id from status_test_ids where label = 'second'),
  'Resending reports the replacement invitation as pending');

select is(private.finish_contact_account_link_invitation(
  '07500000-0000-4000-8000-000000000010',
  '07500000-0000-4000-8000-000000000011',
  null, '07500000-0000-4000-8000-000000000001', 'revoke'
), 'revoked', 'The operator revokes the active invitation');
select is(pg_temp.link_status()->>'state', 'cancelled',
  'A revoked invitation is cancelled');
select is(pg_temp.link_status()->'invitationId', 'null'::jsonb,
  'A cancelled status no longer exposes an invitation id');

insert into status_test_ids values ('third', pg_temp.invite());
update private.contact_account_link_invitations
set expires_at = now() - interval '1 minute'
where id = (select id from status_test_ids where label = 'third');
select is(pg_temp.link_status()->>'state', 'expired',
  'An unused invitation past its expiry is expired');

insert into status_test_ids values ('fourth', pg_temp.invite());
select is(private.finish_contact_account_link_invitation(
  '07500000-0000-4000-8000-000000000010',
  '07500000-0000-4000-8000-000000000011',
  (select id from status_test_ids where label = 'fourth'),
  '07500000-0000-4000-8000-000000000002', 'decline'
), 'declined', 'The account holder declines');
select is(pg_temp.link_status()->>'state', 'declined',
  'A declined invitation reports declined');

insert into status_test_ids values ('fifth', pg_temp.invite());
select is(private.confirm_contact_account_link(
  '07500000-0000-4000-8000-000000000010',
  '07500000-0000-4000-8000-000000000011',
  (select id from status_test_ids where label = 'fifth'),
  '07500000-0000-4000-8000-000000000002'
), 'linked', 'The account holder accepts');
select is(pg_temp.link_status()->>'state', 'accepted',
  'An accepted invitation reports accepted');

select is(private.unlink_contact_account_link(
  '07500000-0000-4000-8000-000000000010',
  '07500000-0000-4000-8000-000000000011',
  '07500000-0000-4000-8000-000000000002',
  '07500000-0000-4000-8000-000000000001'
), 'unlinked', 'The operator unlinks the account');
select is(pg_temp.link_status(), null::jsonb,
  'Unlinking clears the accepted status');

select * from finish();
rollback;
