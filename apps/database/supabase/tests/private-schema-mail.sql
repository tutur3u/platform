begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(34);

select ok(to_regclass('private.mail_domains') is not null, 'mail domains live in the private schema');
select ok(to_regclass('private.mail_stored_objects') is not null, 'mail stored objects live in the private schema');
select ok(to_regclass('private.mail_folders') is not null, 'mail folders live in the private schema');
select ok(to_regclass('private.mail_message_folders') is not null, 'mail message folders live in the private schema');
select ok(to_regclass('private.mail_ai_conversations') is not null, 'mail AI conversations live in the private schema');
select ok(to_regclass('private.mail_ai_messages') is not null, 'mail AI messages live in the private schema');
select ok(to_regclass('private.mail_ai_tool_executions') is not null, 'mail AI tool executions live in the private schema');
select ok(to_regclass('private.mail_auto_draft_jobs') is not null, 'mail auto-draft jobs live in the private schema');
select ok(to_regclass('private.mail_mcp_credentials') is not null, 'mail MCP credentials live in the private schema');
select ok(to_regclass('private.mail_mcp_credential_mailboxes') is not null, 'mail MCP mailbox grants live in the private schema');

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
        ('mail_domains'),
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
        ('mail_outbound_jobs'),
        ('mail_stored_objects'),
        ('mail_folders'),
        ('mail_message_folders'),
        ('mail_ai_conversations'),
        ('mail_ai_messages'),
        ('mail_ai_tool_executions'),
        ('mail_auto_draft_jobs'),
        ('mail_mcp_credentials'),
        ('mail_mcp_credential_mailboxes')
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
        ('mail_domains'),
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
        ('mail_outbound_jobs'),
        ('mail_stored_objects'),
        ('mail_folders'),
        ('mail_message_folders'),
        ('mail_ai_conversations'),
        ('mail_ai_messages'),
        ('mail_ai_tool_executions'),
        ('mail_auto_draft_jobs'),
        ('mail_mcp_credentials'),
        ('mail_mcp_credential_mailboxes')
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
  $$ insert into private.mail_mailboxes(address, domain_id, type)
     select 'pilot@xwf.tuturuuu.com', id, 'personal'
     from private.mail_domains where domain = 'tuturuuu.com' $$,
  null,
  'xwf.tuturuuu.com mailboxes are rejected'
);

select throws_ok(
  $$ insert into private.mail_mailboxes(address, domain_id, type)
     select 'Person@tuturuuu.com', id, 'personal'
     from private.mail_domains where domain = 'tuturuuu.com' $$,
  null,
  'mailbox addresses must be lowercase exact Tuturuuu addresses'
);

insert into public.users (id)
values
  ('00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into private.mail_mailboxes(address, domain_id, type, display_name)
select 'ops-mail-test@tuturuuu.com', id, 'shared', 'Ops'
from private.mail_domains
where domain = 'tuturuuu.com';

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

select ok(
  not exists (select 1 from private.mail_mailboxes where domain_id is null),
  'all existing mailboxes are backfilled to a domain'
);

select ok(
  exists (
    select 1 from private.mail_domains
    where domain = 'tuturuuu.com'
      and inbound_provider = 'ses'
      and outbound_provider = 'ses'
  ),
  'the Tuturuuu domain preserves SES as both providers after backfill'
);

select lives_ok(
  $$ insert into private.mail_threads(mailbox_id, subject, normalized_subject)
     select id, 'Status', 'status' from test_mailbox;
     insert into private.mail_threads(mailbox_id, subject, normalized_subject)
     select id, 'Status', 'status' from test_mailbox $$,
  'normalized subjects are indexed fallback hints and are no longer unique'
);

select throws_ok(
  $$ insert into private.mail_mcp_credentials(name, token_prefix, token_hash, scopes, created_by)
     values ('invalid send token', 'mail_invalid', repeat('a', 64), array['read', 'send'],
       '00000000-0000-0000-0000-000000000000') $$,
  null,
  'MCP credentials can never receive a send scope'
);

insert into private.mail_domains(domain, status, inbound_provider, outbound_provider)
values ('example-mail.test', 'active', 'cloudflare', 'cloudflare');

select lives_ok(
  $$ insert into private.mail_mailboxes(address, domain_id, type)
     select 'shared@example-mail.test', id, 'shared'
     from private.mail_domains where domain = 'example-mail.test' $$,
  'mailboxes may use an explicitly configured non-Tuturuuu domain'
);

select throws_ok(
  $$ insert into private.mail_domains(domain, inbound_provider, outbound_provider)
     values ('invalid-provider.test', 'smtp', 'ses') $$,
  null,
  'mail domains reject unsupported inbound providers'
);

select * from finish();

rollback;
