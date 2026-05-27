begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select ok(
  to_regclass('private.mail_mailboxes') is not null,
  'mail mailboxes live in the private schema'
);

select ok(
  to_regclass('private.mail_mailbox_members') is not null,
  'mail mailbox members live in the private schema'
);

select ok(
  to_regclass('private.mail_raw_messages') is not null,
  'mail raw messages live in the private schema'
);

select ok(
  to_regclass('private.mail_threads') is not null,
  'mail threads live in the private schema'
);

select ok(
  to_regclass('private.mail_messages') is not null,
  'mail messages live in the private schema'
);

select ok(
  to_regclass('private.mail_inbound_jobs') is not null,
  'mail inbound jobs live in the private schema'
);

select ok(
  to_regclass('private.mail_outbound_jobs') is not null,
  'mail outbound jobs live in the private schema'
);

select ok(
  to_regclass('public.mail_messages') is null,
  'mail messages are not exposed as a public table'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select ok(
  has_schema_privilege('service_role', 'private', 'usage'),
  'service role can use the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('mail_mailboxes'),
        ('mail_mailbox_members'),
        ('mail_raw_messages'),
        ('mail_threads'),
        ('mail_messages'),
        ('mail_recipients'),
        ('mail_attachments'),
        ('mail_labels'),
        ('mail_message_labels'),
        ('mail_message_user_state'),
        ('mail_events'),
        ('mail_inbound_jobs'),
        ('mail_outbound_jobs')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'authenticated has no direct mail table privileges'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('mail_mailboxes'),
        ('mail_mailbox_members'),
        ('mail_raw_messages'),
        ('mail_threads'),
        ('mail_messages'),
        ('mail_recipients'),
        ('mail_attachments'),
        ('mail_labels'),
        ('mail_message_labels'),
        ('mail_message_user_state'),
        ('mail_events'),
        ('mail_inbound_jobs'),
        ('mail_outbound_jobs')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'service role can manage private mail tables'
);

select throws_ok(
  $$ insert into private.mail_mailboxes(address, type) values ('pilot@xwf.tuturuuu.com', 'personal') $$,
  null,
  'xwf.tuturuuu.com mailboxes are rejected'
);

select throws_ok(
  $$ insert into private.mail_mailboxes(address, type) values ('Person@tuturuuu.com', 'personal') $$,
  null,
  'mailbox addresses must be lowercase exact Tuturuuu addresses'
);

insert into public.users (id)
values
  ('00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into private.mail_mailboxes(address, type, display_name)
values ('ops-mail-test@tuturuuu.com', 'shared', 'Ops');

create temporary table test_mailbox as
select id
from private.mail_mailboxes
where address = 'ops-mail-test@tuturuuu.com';

select lives_ok(
  $$ insert into private.mail_mailbox_members(mailbox_id, user_id, role)
     select id, '00000000-0000-0000-0000-000000000000'::uuid, 'viewer'
     from test_mailbox $$,
  'mailbox viewer membership role is accepted'
);

select throws_ok(
  $$ insert into private.mail_mailbox_members(mailbox_id, user_id, role)
     select id, '00000000-0000-0000-0000-000000000001'::uuid, 'reader'
     from test_mailbox $$,
  null,
  'unknown mailbox member roles are rejected'
);

insert into private.mail_inbound_jobs(provider, provider_message_id, s3_bucket, s3_key)
values ('ses', 'ses-message-1', 'mail-bucket', 'raw/ses-message-1.eml');

select throws_ok(
  $$ insert into private.mail_inbound_jobs(provider, provider_message_id, s3_bucket, s3_key)
     values ('ses', 'ses-message-1', 'mail-bucket', 'raw/ses-message-1-copy.eml') $$,
  null,
  'SES inbound provider message ids are idempotent'
);

select * from finish();

rollback;
