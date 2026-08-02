begin;
select plan(50);

select ok(
  'custom' = any(enum_range(null::public.external_project_adapter_kind)::text[])
    and not ('cms_site' = any(enum_range(null::public.external_project_adapter_kind)::text[])),
  'the CMS site contract remains adapter-neutral behind a generic binding adapter'
);

select has_table('private', 'external_chat_binding_credentials', 'binding credentials are private');
select has_table('private', 'external_chat_threads', 'external thread mappings are private');
select has_table('private', 'external_chat_events', 'external event mappings are private');
select has_table('private', 'external_chat_outbound_deliveries', 'outbound delivery reservations are private');
select has_table('private', 'external_chat_sync_checkpoints', 'sync checkpoints are private');
select has_function('private', 'external_chat_import_event', 'idempotent import RPC exists');
select has_function('private', 'chat_persist_ai_message_batch', 'atomic native AI batch RPC exists');
select has_function('private', 'chat_persist_ai_message_batch_idempotent', 'request-id atomic native AI batch RPC exists');
select has_function('private', 'chat_send_user_message_idempotent', 'request-id atomic native user-message RPC exists');
select has_function('private', 'chat_list_conversations_by_recency', 'recency-ordered native inbox RPC exists');
select has_function('private', 'external_chat_mark_verified', 'verification fencing RPC exists');
select has_function('private', 'external_chat_clear_credential', 'credential recovery RPC exists');
select has_function('private', 'external_chat_reserve_reply', 'idempotent outbound reservation RPC exists');
select has_function('private', 'external_chat_finalize_reply', 'atomic outbound finalization RPC exists');
select has_function('private', 'external_chat_list_conversations', 'bounded external inbox RPC exists');
select has_function('private', 'external_chat_update_settings', 'atomic binding settings RPC exists');
select has_function('private', 'external_chat_stage_credential', 'serialized credential staging RPC exists');
select has_function('private', 'external_chat_promote_credential', 'conditional credential promotion RPC exists');
select has_function('private', 'external_chat_issue_pairing_ticket', 'pairing ticket issuance RPC exists');
select has_function('private', 'external_chat_consume_pairing_ticket', 'pairing ticket consumption RPC exists');
select has_function('private', 'external_project_set_cms_site_template', 'atomic CMS template RPC exists');

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
      and table_name in ('external_chat_binding_credentials', 'external_chat_threads', 'external_chat_events', 'external_chat_outbound_deliveries', 'external_chat_sync_checkpoints')
      and grantee in ('anon', 'authenticated')$$,
  'external chat private tables have no direct client grants'
);

select col_type_is('private', 'external_chat_threads', 'metadata', 'jsonb', 'thread context is dynamic JSON');
select col_type_is('private', 'external_chat_events', 'metadata', 'jsonb', 'event context is dynamic JSON');
select col_type_is('private', 'external_chat_sync_checkpoints', 'details', 'jsonb', 'checkpoint diagnostics are dynamic JSON');
select col_type_is('private', 'external_chat_binding_credentials', 'configuration_revision', 'bigint', 'credential configuration has a monotonic revision');
select col_type_is('private', 'external_chat_binding_credentials', 'verified_revision', 'bigint', 'verification records its configuration revision');
select col_type_is('private', 'external_chat_outbound_deliveries', 'payload_hash', 'text', 'outbound idempotency binds an opaque payload digest');
select col_type_is('private', 'external_chat_outbound_deliveries', 'configuration_revision', 'bigint', 'outbound delivery captures its credential revision');
select col_type_is('private', 'external_chat_outbound_deliveries', 'cancelled_at', 'timestamp with time zone', 'failed delivery leases can be released');

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
select has_index(
  'public', 'ai_chat_messages',
  'ai_chat_messages_persistence_request_key',
  'AI bridge persistence requests are database-idempotent'
);
select has_index(
  'private', 'chat_messages',
  'chat_messages_client_request_key',
  'native user-message requests are database-idempotent'
);

select function_privs_are(
  'private', 'external_chat_import_event',
  array['uuid','text','text','text','text','text','text','timestamp with time zone','bigint','jsonb','jsonb','uuid'],
  'service_role', array['EXECUTE'], 'service role can execute imports'
);
select function_privs_are(
  'private', 'external_chat_import_event',
  array['uuid','text','text','text','text','text','text','timestamp with time zone','bigint','jsonb','jsonb','uuid'],
  'authenticated', array[]::text[], 'authenticated clients cannot execute imports'
);
select function_privs_are(
  'private', 'external_project_set_cms_site_template',
  array['uuid','jsonb','uuid'],
  'service_role', array['EXECUTE'], 'service role can atomically update CMS templates'
);
select function_privs_are(
  'private', 'external_chat_list_conversations',
  array['uuid','uuid','text','integer','integer'],
  'authenticated', array[]::text[], 'authenticated clients cannot list external inboxes directly'
);
select function_privs_are(
  'private', 'chat_persist_ai_message_batch_idempotent',
  array['uuid','uuid','uuid','uuid','jsonb'],
  'authenticated', array[]::text[], 'authenticated clients cannot persist AI batches directly'
);
select function_privs_are(
  'private', 'chat_send_user_message_idempotent',
  array['uuid','uuid','uuid','uuid','text','uuid','jsonb'],
  'authenticated', array[]::text[], 'authenticated clients cannot persist idempotent user messages directly'
);
select function_privs_are(
  'private', 'chat_list_conversations_by_recency',
  array['uuid','uuid','text','integer'],
  'authenticated', array[]::text[], 'authenticated clients cannot invoke recency listing directly'
);
select throws_ok(
  $$select private.external_chat_stage_credential('00000000-0000-0000-0000-000000000000', null, null, null, null)$$,
  'external_chat_invalid_credential_action',
  'null credential actions are rejected explicitly'
);
select throws_ok(
  $$select private.external_chat_clear_credential('00000000-0000-0000-0000-000000000000', null)$$,
  'external_chat_invalid_credential_kind',
  'null credential kinds are rejected explicitly'
);
select throws_ok(
  $$select private.chat_persist_ai_message_batch_idempotent('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', null, '[]'::jsonb)$$,
  'chat_request_id_required',
  'atomic AI persistence rejects a null request ID'
);
select throws_ok(
  $$select private.chat_send_user_message_idempotent('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', null, 'message', null, '[]'::jsonb)$$,
  'chat_request_id_required',
  'atomic user-message persistence rejects a null request ID'
);
select throws_ok(
  $$select private.external_chat_issue_pairing_ticket('00000000-0000-0000-0000-000000000000', repeat('a', 64), null)$$,
  'external_chat_invalid_pairing_ticket',
  'pairing tickets require an explicit expiry'
);
select throws_ok(
  $$select private.external_chat_list_conversations('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'active', 40, 1001)$$,
  'external_chat_offset_too_large',
  'external inbox pagination rejects oversized offsets at the database boundary'
);
select throws_ok(
  $$select private.external_chat_import_event('00000000-0000-0000-0000-000000000000', 'connector', repeat('a', 256), 'visitor', 'message', 'visitor', 'content', now(), 1, '{}'::jsonb, '{}'::jsonb, null)$$,
  'external_chat_invalid_identity',
  'external imports reject oversized remote agent identities'
);


select * from finish();
rollback;
