begin;
select plan(35);

select has_table('private', 'external_chat_binding_credentials', 'binding credentials are private');
select has_table('private', 'external_chat_threads', 'external thread mappings are private');
select has_table('private', 'external_chat_events', 'external event mappings are private');
select has_table('private', 'external_chat_outbound_deliveries', 'outbound delivery reservations are private');
select has_table('private', 'external_chat_sync_checkpoints', 'sync checkpoints are private');
select has_function('private', 'external_chat_import_event', 'idempotent import RPC exists');
select has_function('private', 'external_chat_mark_verified', 'verification fencing RPC exists');
select has_function('private', 'external_chat_clear_credential', 'credential recovery RPC exists');
select has_function('private', 'external_chat_reserve_reply', 'idempotent outbound reservation RPC exists');
select has_function('private', 'external_chat_finalize_reply', 'atomic outbound finalization RPC exists');
select has_function('private', 'external_chat_update_settings', 'atomic binding settings RPC exists');
select has_function('private', 'external_chat_stage_credential', 'serialized credential staging RPC exists');
select has_function('private', 'external_chat_promote_credential', 'conditional credential promotion RPC exists');
select has_function('private', 'external_chat_issue_pairing_ticket', 'pairing ticket issuance RPC exists');
select has_function('private', 'external_chat_consume_pairing_ticket', 'pairing ticket consumption RPC exists');

select isnt_empty(
  $$select 1 from information_schema.table_privileges
    where table_schema = 'private'
      and table_name = 'external_chat_binding_credentials'
      and grantee = 'service_role'$$,
  'service role can manage binding credentials'
);
select is_empty(
  $$select 1 from information_schema.table_privileges
    where table_schema = 'private'
      and table_name in ('external_chat_binding_credentials', 'external_chat_threads', 'external_chat_events', 'external_chat_outbound_deliveries')
      and grantee in ('anon', 'authenticated')$$,
  'external chat private tables have no direct client grants'
);

select col_type_is('private', 'external_chat_threads', 'metadata', 'jsonb', 'thread context is dynamic JSON');
select col_type_is('private', 'external_chat_events', 'metadata', 'jsonb', 'event context is dynamic JSON');
select col_type_is('private', 'external_chat_sync_checkpoints', 'details', 'jsonb', 'checkpoint diagnostics are dynamic JSON');

select has_index(
  'private', 'external_chat_threads',
  'external_chat_threads_remote_identity_key',
  'remote thread identity is unique'
);
select has_index(
  'private', 'external_chat_events',
  'external_chat_events_remote_message_key',
  'remote messages are idempotent'
);

select function_privs_are(
  'private', 'external_chat_import_event',
  array['uuid','text','text','text','text','text','text','timestamp with time zone','jsonb','jsonb','uuid'],
  'service_role', array['EXECUTE'], 'service role can execute imports'
);
select function_privs_are(
  'private', 'external_chat_import_event',
  array['uuid','text','text','text','text','text','text','timestamp with time zone','jsonb','jsonb','uuid'],
  'authenticated', array[]::text[], 'authenticated clients cannot execute imports'
);

create temporary table external_chat_test_context (ws_id uuid primary key);
insert into external_chat_test_context
select w.id
from public.workspaces w
where not exists (
  select 1 from public.workspace_external_project_bindings b where b.ws_id = w.id
)
limit 1;
insert into public.workspace_external_project_bindings (ws_id, is_enabled, settings)
select ws_id, true, '{"chat":{"enabled":true}}'::jsonb
from external_chat_test_context;

select lives_ok(
  format(
    $$select private.external_chat_issue_pairing_ticket(%L, %L, now() + interval '5 minutes')$$,
    (select ws_id from external_chat_test_context),
    repeat('a', 64)
  ),
  'a short-lived pairing ticket can be issued'
);
select ok(
  private.external_chat_consume_pairing_ticket(
    (select ws_id from external_chat_test_context), repeat('a', 64)
  ),
  'a matching pairing ticket is consumed once'
);
select ok(
  not private.external_chat_consume_pairing_ticket(
    (select ws_id from external_chat_test_context), repeat('a', 64)
  ),
  'a consumed pairing ticket cannot be replayed'
);
select lives_ok(
  format(
    $$select private.external_chat_issue_pairing_ticket(%L, %L, now() + interval '5 minutes')$$,
    (select ws_id from external_chat_test_context),
    repeat('b', 64)
  ),
  'a replacement pairing ticket can be issued'
);
update private.external_chat_binding_credentials
set pairing_ticket_expires_at = now() - interval '1 second'
where ws_id = (select ws_id from external_chat_test_context);
select ok(
  not private.external_chat_consume_pairing_ticket(
    (select ws_id from external_chat_test_context), repeat('b', 64)
  ),
  'an expired pairing ticket is rejected'
);
select is(
  (
    select pairing_ticket_issued_at is not null
      and char_length(pairing_ticket_hash) = 64
    from private.external_chat_binding_credentials
    where ws_id = (select ws_id from external_chat_test_context)
  ),
  true,
  'ticket issuance records only bounded metadata and a fixed-length digest'
);

create temporary table external_chat_test_results (
  attempt integer primary key,
  result jsonb not null
);
insert into external_chat_test_results
select 1, private.external_chat_import_event(
  ws_id, 'test-connector', 'agent-1', 'visitor-1', 'message-1',
  'visitor', 'hello', now(), '{"displayName":"Test visitor"}',
  '{"context":{"network":"loopback","routes":["/test"]}}'
)
from external_chat_test_context;
insert into external_chat_test_results
select 2, private.external_chat_import_event(
  ws_id, 'test-connector', 'agent-1', 'visitor-1', 'message-1',
  'visitor', 'hello', now(), '{"displayName":"Test visitor"}',
  '{"context":{"network":"loopback","routes":["/test"]}}'
)
from external_chat_test_context;

select is(
  (select result->>'duplicate' from external_chat_test_results where attempt = 1),
  'false',
  'first import creates a native message'
);
select is(
  (select result->>'duplicate' from external_chat_test_results where attempt = 2),
  'true',
  'duplicate import is acknowledged idempotently'
);
select is(
  (select count(*) from private.external_chat_events e
    join external_chat_test_context c on c.ws_id = e.ws_id),
  1::bigint,
  'duplicate import creates one event mapping'
);
select is(
  (select count(*) from private.chat_messages m
    join private.external_chat_threads t on t.conversation_id = m.conversation_id
    join external_chat_test_context c on c.ws_id = t.ws_id),
  1::bigint,
  'duplicate import creates one native message'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name like 'external_chat%'
      and column_name in ('ip', 'ip_address', 'visited_routes', 'page_url')
  ),
  'potentially sensitive context is not advertised by fixed columns'
);

select * from finish();
rollback;
