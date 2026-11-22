begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(45);

insert into auth.users (id, email, email_confirmed_at, created_at, raw_app_meta_data, raw_user_meta_data)
select id, id::text || chr(64) || 'tuturuuu.com', now(), now() - interval '1 hour', '{}'::jsonb, '{}'::jsonb
from unnest(array[
  '55717e00-0000-4000-8000-000000000001'::uuid,
  '55717e00-0000-4000-8000-000000000002'::uuid
]) as fixture(id);

create function pg_temp.restore_mailbox() returns void language sql as $$
  select private.restore_retained_personal_mailbox('55717e00-0000-4000-8000-000000000001', '55717e00-0000-4000-8000-000000000010');
$$;
create function pg_temp.rollback_mailbox() returns void language sql as $$
  select private.rollback_retained_personal_mailbox_restoration('55717e00-0000-4000-8000-000000000001');
$$;

select lives_ok(
  $$select private.restore_retained_personal_mailbox('55717e00-0000-4000-8000-000000000099', '55717e00-0000-4000-8000-000000000010')$$,
  'an absent account skips the restoration'
);
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: no matching mailbox', 'a missing mailbox fails closed'
);

insert into private.mail_mailboxes (id, address, domain_id, status)
select '55717e00-0000-4000-8000-000000000010', u.email, d.id, 'disabled'
from auth.users u
join private.mail_domains d on d.domain = split_part(u.email, chr(64), 2)
where u.id = '55717e00-0000-4000-8000-000000000001';

savepoint duplicate_mailbox;
drop index private.mail_mailboxes_address_key;
insert into private.mail_mailboxes (address, domain_id, status)
select address, domain_id, status from private.mail_mailboxes
where id = '55717e00-0000-4000-8000-000000000010';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: multiple matching mailboxes', 'duplicate matches fail closed'
);
rollback to savepoint duplicate_mailbox;

update private.mail_mailboxes set type = 'shared' where id = '55717e00-0000-4000-8000-000000000010';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox is not personal', 'a shared mailbox fails closed'
);
update private.mail_mailboxes set type = 'personal', archived_at = now()
where id = '55717e00-0000-4000-8000-000000000010';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox is archived', 'an archived mailbox fails closed'
);
update private.mail_mailboxes set archived_at = null, status = 'quarantined'
where id = '55717e00-0000-4000-8000-000000000010';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox is not disabled', 'a quarantined mailbox fails closed'
);
update private.mail_mailboxes set status = 'active', created_by = '55717e00-0000-4000-8000-000000000001'
where id = '55717e00-0000-4000-8000-000000000010';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox is not disabled', 'an active mailbox without its owner fails closed'
);
update private.mail_mailboxes set status = 'disabled', created_by = '55717e00-0000-4000-8000-000000000002'
where id = '55717e00-0000-4000-8000-000000000010';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox has a foreign creator', 'a foreign creator fails closed'
);
update private.mail_mailboxes set created_by = null where id = '55717e00-0000-4000-8000-000000000010';

insert into private.mail_mailbox_members (mailbox_id, user_id, role)
values ('55717e00-0000-4000-8000-000000000010', '55717e00-0000-4000-8000-000000000002', 'viewer');
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox has a foreign member', 'a foreign member fails closed'
);
delete from private.mail_mailbox_members where mailbox_id = '55717e00-0000-4000-8000-000000000010';

savepoint inactive_domain;
update private.mail_domains set status = 'disabled'
where id = (select domain_id from private.mail_mailboxes where id = '55717e00-0000-4000-8000-000000000010');
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: domain is not active', 'an inactive domain fails closed'
);
rollback to savepoint inactive_domain;

savepoint unconfirmed_email;
update auth.users set email_confirmed_at = null where id = '55717e00-0000-4000-8000-000000000001';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: Auth email is missing or unconfirmed', 'an unconfirmed email fails closed'
);
rollback to savepoint unconfirmed_email;

savepoint deleted_user;
update auth.users set deleted_at = now() where id = '55717e00-0000-4000-8000-000000000001';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: Auth user is deleted', 'a deleted account fails closed'
);
rollback to savepoint deleted_user;

savepoint anonymous_user;
update auth.users set is_anonymous = true where id = '55717e00-0000-4000-8000-000000000001';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: Auth user is anonymous', 'an anonymous account fails closed'
);
rollback to savepoint anonymous_user;

savepoint pending_email_change;
update auth.users set email_change = 'next' || chr(64) || 'tuturuuu.com'
where id = '55717e00-0000-4000-8000-000000000001';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: Auth email change is pending', 'a pending email change fails closed'
);
rollback to savepoint pending_email_change;

savepoint banned_user;
update auth.users set banned_until = now() + interval '1 day'
where id = '55717e00-0000-4000-8000-000000000001';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: Auth user is banned', 'a banned account fails closed'
);
rollback to savepoint banned_user;

savepoint earlier_holder;
update private.mail_mailboxes set created_at = (
  select created_at - interval '1 day' from auth.users where id = '55717e00-0000-4000-8000-000000000001'
) where id = '55717e00-0000-4000-8000-000000000010';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox predates the account', 'a mailbox older than the account fails closed'
);
rollback to savepoint earlier_holder;

savepoint foreign_adoption;
insert into private.employee_mailbox_adoptions (operation_id, request, mailbox_id, snapshot, content_snapshot, ownership_confirmed)
values (gen_random_uuid(), jsonb_build_object('userId', '55717e00-0000-4000-8000-000000000002'),
  '55717e00-0000-4000-8000-000000000010', repeat('a', 64), 'fixture', true);
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox has a foreign adoption', 'another person''s adoption fails closed'
);
rollback to savepoint foreign_adoption;

savepoint foreign_staff;
insert into private.infrastructure_employees (user_id, staff_email, managed_name, mailbox_id)
select '55717e00-0000-4000-8000-000000000002', u.email, 'Fixture', '55717e00-0000-4000-8000-000000000010'
from auth.users u where u.id = '55717e00-0000-4000-8000-000000000001';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox has a foreign staff binding', 'another person''s staff binding fails closed'
);
rollback to savepoint foreign_staff;

savepoint foreign_message;
insert into private.mail_messages (mailbox_id, direction, from_address, created_by)
values ('55717e00-0000-4000-8000-000000000010', 'outbound', 'fixture' || chr(64) || 'example.test',
  '55717e00-0000-4000-8000-000000000002');
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox has a foreign message author', 'another person''s message fails closed'
);
rollback to savepoint foreign_message;

savepoint foreign_label;
insert into private.mail_labels (mailbox_id, name, slug, created_by)
values ('55717e00-0000-4000-8000-000000000010', 'Fixture', 'fixture', '55717e00-0000-4000-8000-000000000002');
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox has a foreign label author', 'another person''s label fails closed'
);
rollback to savepoint foreign_label;

select lives_ok(
  $$select private.rollback_retained_personal_mailbox_restoration('55717e00-0000-4000-8000-000000000099')$$,
  'the rollback skips an absent account'
);

select throws_ok(
  $$select private.restore_retained_personal_mailbox('55717e00-0000-4000-8000-000000000001', '55717e00-0000-4000-8000-0000000000ff')$$,
  'P0001', 'Mailbox restoration refused: mailbox does not match the reviewed id',
  'a mailbox other than the reviewed id fails closed'
);
select results_eq(
  $$select mailbox_id, status from private.inspect_retained_personal_mailbox('55717e00-0000-4000-8000-000000000001')$$,
  $$values ('55717e00-0000-4000-8000-000000000010'::uuid, 'disabled'::text)$$,
  'inspection returns only the matching personal mailbox id and status'
);
select is(
  (select count(*) from private.inspect_retained_personal_mailbox('55717e00-0000-4000-8000-000000000099')),
  0::bigint, 'inspection returns nothing for an absent account'
);
savepoint foreign_credential;
with credential as (
  insert into private.mail_mcp_credentials (name, token_prefix, token_hash, scopes, created_by, revoked_at)
  values ('fixture', 'fixture', 'fixture', array['read'], '55717e00-0000-4000-8000-000000000002', now())
  returning id
)
insert into private.mail_mcp_credential_mailboxes (credential_id, mailbox_id)
select id, '55717e00-0000-4000-8000-000000000010' from credential;
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox has a foreign credential', 'another person''s revoked credential fails closed'
);
rollback to savepoint foreign_credential;

savepoint foreign_workspace;
insert into public.workspaces (id, name, creator_id, personal)
values ('55717e00-0000-4000-8000-000000000030', 'Fixture', '55717e00-0000-4000-8000-000000000002', false);
update private.mail_mailboxes set ws_id = '55717e00-0000-4000-8000-000000000030'
where id = '55717e00-0000-4000-8000-000000000010';
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: mailbox is linked to a foreign workspace', 'a foreign workspace link fails closed'
);
rollback to savepoint foreign_workspace;

savepoint foreign_intent;
insert into private.employee_creation_intents (user_id, staff_email, managed_name, actor_id)
values ('55717e00-0000-4000-8000-000000000002', (select email from auth.users where id = '55717e00-0000-4000-8000-000000000001'), 'Fixture', '55717e00-0000-4000-8000-000000000002');
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: address has a foreign employee record', 'another person''s creation intent fails closed'
);
rollback to savepoint foreign_intent;

savepoint foreign_operation;
insert into private.employee_creation_operations (actor_id, operation_id, staff_email, managed_name)
values ('55717e00-0000-4000-8000-000000000002', gen_random_uuid(), (select email from auth.users where id = '55717e00-0000-4000-8000-000000000001'), 'Fixture');
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: address has a foreign employee record', 'another person''s creation operation fails closed'
);
rollback to savepoint foreign_operation;

savepoint foreign_restore;
insert into private.infrastructure_employees (user_id, staff_email, managed_name)
values ('55717e00-0000-4000-8000-000000000002', 'other' || chr(64) || 'tuturuuu.com', 'Fixture');
insert into private.employee_restore_operations (operation_id, user_id, staff_email, expected_revision, actor_id, phase)
values (gen_random_uuid(), '55717e00-0000-4000-8000-000000000002', (select email from auth.users where id = '55717e00-0000-4000-8000-000000000001'), 0, '55717e00-0000-4000-8000-000000000002', 'reserved');
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: address has a foreign employee record', 'another person''s restore operation fails closed'
);
rollback to savepoint foreign_restore;

savepoint foreign_migration;
insert into private.employee_address_migrations (operation_id, user_id, source_address, destination_address, binding, phase, original_state)
select '55717e00-0000-4000-8000-000000000040', '55717e00-0000-4000-8000-000000000002', (select email from auth.users where id = '55717e00-0000-4000-8000-000000000001'), 'next' || chr(64) || 'tuturuuu.com',
  jsonb_build_object('operationId', '55717e00-0000-4000-8000-000000000040', 'userId', '55717e00-0000-4000-8000-000000000002',
    'sourceAddress', (select email from auth.users where id = '55717e00-0000-4000-8000-000000000001'), 'destinationAddress', 'next' || chr(64) || 'tuturuuu.com'),
  'reserved', '{}'::jsonb;
select throws_ok(
  'select pg_temp.restore_mailbox()', 'P0001',
  'Mailbox restoration refused: address has a foreign employee record', 'another person''s address migration fails closed'
);
rollback to savepoint foreign_migration;

savepoint inspect_anonymous;
update auth.users set is_anonymous = true where id = '55717e00-0000-4000-8000-000000000001';
select is(
  (select count(*) from private.inspect_retained_personal_mailbox('55717e00-0000-4000-8000-000000000001')),
  0::bigint, 'inspection returns nothing for an anonymous account'
);
rollback to savepoint inspect_anonymous;

savepoint inspect_unconfirmed;
update auth.users set email_confirmed_at = null where id = '55717e00-0000-4000-8000-000000000001';
select is(
  (select count(*) from private.inspect_retained_personal_mailbox('55717e00-0000-4000-8000-000000000001')),
  0::bigint, 'inspection returns nothing for an unconfirmed email'
);
rollback to savepoint inspect_unconfirmed;

savepoint inspect_foreign_owner;
update private.mail_mailboxes set created_by = '55717e00-0000-4000-8000-000000000002' where id = '55717e00-0000-4000-8000-000000000010';
select is(
  (select count(*) from private.inspect_retained_personal_mailbox('55717e00-0000-4000-8000-000000000001')),
  0::bigint, 'inspection returns nothing for a mailbox another person owns'
);
rollback to savepoint inspect_foreign_owner;

select is(
  (select count(*) from private.mail_mailbox_restorations where user_id = '55717e00-0000-4000-8000-000000000001'),
  0::bigint, 'refused restorations leave no receipt'
);

select lives_ok('select pg_temp.restore_mailbox()', 'the retained mailbox is restored');
select results_eq(
  $$select status, created_by, ws_id
    from private.mail_mailboxes where id = '55717e00-0000-4000-8000-000000000010'$$,
  $$select 'active'::text, creator_id, id
    from public.workspaces where creator_id = '55717e00-0000-4000-8000-000000000001' and personal$$,
  'the mailbox is active, attributed to its owner, and linked to the personal workspace'
);
select results_eq(
  $$select user_id, role, created_by from private.mail_mailbox_members
    where mailbox_id = '55717e00-0000-4000-8000-000000000010'$$,
  $$values ('55717e00-0000-4000-8000-000000000001'::uuid, 'owner'::text, '55717e00-0000-4000-8000-000000000001'::uuid)$$,
  'an owner membership is provisioned'
);
create temp table first_receipt as
select * from private.mail_mailbox_restorations where mailbox_id = '55717e00-0000-4000-8000-000000000010';
select lives_ok('select pg_temp.restore_mailbox()', 'rerunning the restoration is safe');
select results_eq(
  $$select * from private.mail_mailbox_restorations where mailbox_id = '55717e00-0000-4000-8000-000000000010'$$,
  'select * from first_receipt',
  'the rerun preserves the original receipt'
);

savepoint ownership_drift;
update private.mail_mailbox_members set role = 'viewer'
where mailbox_id = '55717e00-0000-4000-8000-000000000010';
select throws_ok(
  'select pg_temp.rollback_mailbox()', 'P0001',
  'Mailbox restoration rollback refused: restored ownership state changed', 'rollback preserves later ownership changes'
);
rollback to savepoint ownership_drift;

select lives_ok('select pg_temp.rollback_mailbox()', 'rollback consumes the restoration receipt');
select results_eq(
  $$select status, created_by, ws_id,
    exists (select 1 from private.mail_mailbox_members where mailbox_id = m.id),
    exists (select 1 from private.mail_mailbox_restorations where mailbox_id = m.id)
    from private.mail_mailboxes m where id = '55717e00-0000-4000-8000-000000000010'$$,
  $$values ('disabled'::text, null::uuid, null::uuid, false, false)$$,
  'rollback restores an unlinked mailbox without a creator, membership, or receipt'
);
select throws_ok(
  'select pg_temp.rollback_mailbox()', 'P0001',
  'Mailbox restoration rollback refused: restoration receipt is missing', 'a repeated rollback is a non-mutating refusal'
);

update private.mail_mailboxes set created_by = '55717e00-0000-4000-8000-000000000001'
where id = '55717e00-0000-4000-8000-000000000010';
insert into private.mail_mailbox_members (id, mailbox_id, user_id, role, created_by)
values ('55717e00-0000-4000-8000-000000000020', '55717e00-0000-4000-8000-000000000010',
  '55717e00-0000-4000-8000-000000000001', 'viewer', '55717e00-0000-4000-8000-000000000002');
select pg_temp.restore_mailbox();
select pg_temp.rollback_mailbox();
select results_eq(
  $$select m.status, m.created_by, m.ws_id, member.id, member.role, member.created_by
    from private.mail_mailboxes m join private.mail_mailbox_members member on member.mailbox_id = m.id
    where m.id = '55717e00-0000-4000-8000-000000000010'$$,
  $$values ('disabled'::text, '55717e00-0000-4000-8000-000000000001'::uuid, null::uuid,
    '55717e00-0000-4000-8000-000000000020'::uuid, 'viewer'::text, '55717e00-0000-4000-8000-000000000002'::uuid)$$,
  'rollback keeps a pre-existing membership and restores its role and attribution'
);

select ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) as api(role)
    where has_table_privilege(api.role, 'private.mail_mailbox_restorations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_function_privilege(api.role, 'private.restore_retained_personal_mailbox(uuid, uuid)', 'EXECUTE')
      or has_function_privilege(api.role, 'private.inspect_retained_personal_mailbox(uuid)', 'EXECUTE')
      or has_function_privilege(api.role, 'private.rollback_retained_personal_mailbox_restoration(uuid)', 'EXECUTE')
  ), 'the audit table and all three helpers are inaccessible to API roles'
);

select * from finish();
rollback;
