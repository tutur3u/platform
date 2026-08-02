begin;
select plan(50);

create temporary table external_chat_test_context (
  ws_id uuid primary key,
  actor_id uuid not null
);
insert into external_chat_test_context
select w.id, wm.user_id
from public.workspaces w
join public.workspace_members wm on wm.ws_id = w.id
where not exists (
  select 1 from public.workspace_external_project_bindings b where b.ws_id = w.id
)
limit 1;
insert into public.workspace_external_project_bindings (ws_id, is_enabled, settings)
select ws_id, true, '{"chat":{"enabled":true}}'::jsonb
from external_chat_test_context;

select lives_ok(
  format(
    $$select private.external_project_set_cms_site_template(%L, '{"kind":"standard-site","version":1}'::jsonb, null)$$,
    (select ws_id from external_chat_test_context)
  ),
  'CMS template can be written without replacing sibling settings'
);
select is(
  (
    select settings #>> '{chat,enabled}' from public.workspace_external_project_bindings
    where ws_id = (select ws_id from external_chat_test_context)
  ),
  'true',
  'atomic CMS template writes preserve chat settings'
);

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

update private.external_chat_binding_credentials
set control_secret_encrypted = 'ciphertext',
    ingest_secret_hash = repeat('c', 64)
where ws_id = (select ws_id from external_chat_test_context);
select ok(
  private.external_chat_mark_verified(
    (select ws_id from external_chat_test_context), 'ciphertext', 1
  ),
  'verification succeeds for the captured active configuration revision'
);
select lives_ok(
  format(
    $$select private.external_chat_update_settings(%L, '{"enabled":true,"bridgeBaseUrl":"https://bridge.example.com","agentMappings":{},"inboxDefaults":{},"authorityMode":"legacy_primary"}'::jsonb, null)$$,
    (select ws_id from external_chat_test_context)
  ),
  'bridge settings can advance the configuration revision'
);
select is(
  (
    select configuration_revision from private.external_chat_binding_credentials
    where ws_id = (select ws_id from external_chat_test_context)
  ),
  2::bigint,
  'bridge URL changes advance the credential configuration revision'
);
select ok(
  not private.external_chat_mark_verified(
    (select ws_id from external_chat_test_context), 'ciphertext', 1
  ),
  'a stale verification cannot mark a newer configuration ready'
);
do $$
begin
  perform private.external_chat_mark_verified(
    (select ws_id from external_chat_test_context), 'ciphertext', 2
  );
end;
$$;

create temporary table external_chat_test_results (
  attempt integer primary key,
  result jsonb not null
);
insert into external_chat_test_results
select 1, private.external_chat_import_event(
  ws_id, 'test-connector', 'agent-1', 'visitor-1', 'message-1',
  'visitor', 'hello', now(), 2, '{"displayName":"Test visitor"}',
  '{"context":{"network":"loopback","routes":["/test"]}}'
)
from external_chat_test_context;
insert into external_chat_test_results
select 2, private.external_chat_import_event(
  ws_id, 'test-connector', 'agent-1', 'visitor-1', 'message-1',
  'visitor', 'hello', now(), 2, '{"displayName":"Test visitor"}',
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
  (select result->>'conversationCreated' from external_chat_test_results where attempt = 1),
  'true',
  'first import identifies the newly created conversation for realtime fanout'
);
select ok(
  (select result ? 'conversation' and result ? 'message'
    from external_chat_test_results where attempt = 1),
  'first import returns native realtime payloads'
);
insert into private.ai_agent_external_threads (
  ws_id, agent_id, channel_id, adapter, external_thread_id, title
)
select ws_id, 'test-agent', 'test-channel', 'discord', 'test-thread', 'AI thread'
from external_chat_test_context;
select ok(
  not exists (
    select 1
    from jsonb_array_elements(private.external_chat_list_conversations(
      (select ws_id from external_chat_test_context),
      (select actor_id from external_chat_test_context),
      'active',
      41,
      0
    )) item
    where item #>> '{metadata,source}' = 'ai-agent-external-thread'
  ),
  'connected-site inbox excludes unrelated AI-agent external threads'
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

insert into external_chat_test_results
select 4, private.external_chat_import_event(
  ws_id, 'test-connector', 'agent-1', 'visitor-1', 'message-staff-1',
  'staff', 'mapped reply', now(), 2, '{"displayName":"Test visitor"}',
  '{}'::jsonb, actor_id
)
from external_chat_test_context;
select is(
  (
    select m.sender_id
    from private.chat_messages m
    join private.external_chat_events e on e.message_id = m.id
    join external_chat_test_context c on c.ws_id = e.ws_id
    where e.remote_message_id = 'message-staff-1'
  ),
  (select actor_id from external_chat_test_context),
  'inbound staff messages use the mapped workspace user as sender'
);

create temporary table external_chat_forged_conversation (id uuid primary key);
insert into external_chat_forged_conversation
select (private.chat_create_conversation(
  c.ws_id,
  c.actor_id,
  '{"type":"channel","title":"Forged external metadata","metadata":{"externalChat":true}}'::jsonb
)->>'id')::uuid
from external_chat_test_context c;
select ok(
  not exists (
    select 1
    from jsonb_array_elements(private.external_chat_list_conversations(
      (select ws_id from external_chat_test_context),
      (select actor_id from external_chat_test_context),
      'active',
      41,
      0
    )) item
    where item->>'id' = (select id::text from external_chat_forged_conversation)
  ),
  'external inbox membership requires a bound external thread'
);

update private.chat_conversations
set archived_at = now()
where id = (
  select (result->>'conversationId')::uuid
  from external_chat_test_results
  where attempt = 1
);
select is(
  jsonb_array_length(private.external_chat_list_conversations(
    (select ws_id from external_chat_test_context),
    (select actor_id from external_chat_test_context),
    'archived',
    41,
    0
  )),
  1,
  'archived external channels remain visible in the archived inbox'
);
select is(
  private.external_chat_list_conversations(
    (select ws_id from external_chat_test_context),
    (select actor_id from external_chat_test_context),
    'archived',
    41,
    0
  ) #>> '{0,id}',
  (select result->>'conversationId' from external_chat_test_results where attempt = 1),
  'archived inbox entries retain their native conversation identity'
);
insert into external_chat_test_results
select 3, private.external_chat_import_event(
  ws_id, 'test-connector', 'agent-1', 'visitor-1', 'message-2',
  'visitor', 'reopened', now(), 2, '{"displayName":"Test visitor"}',
  '{}'::jsonb
)
from external_chat_test_context;
select is(
  (
    select archived_at from private.chat_conversations
    where id = (
      select (result->>'conversationId')::uuid
      from external_chat_test_results
      where attempt = 1
    )
  ),
  null,
  'new inbound activity reopens an archived external conversation'
);

select ok(
  private.external_chat_mark_verified(
    (select ws_id from external_chat_test_context), 'ciphertext', 2
  ),
  'the current credential revision can be verified for delivery'
);
update public.workspace_external_project_bindings
set settings = jsonb_set(
  settings,
  '{chat,bridgeBaseUrl}',
  '"https://direct.example.com"'::jsonb
)
where ws_id = (select ws_id from external_chat_test_context);
select is(
  (
    select configuration_revision from private.external_chat_binding_credentials
    where ws_id = (select ws_id from external_chat_test_context)
  ),
  3::bigint,
  'direct binding URL changes advance the configuration fence'
);
select is(
  (
    select verified_at is null and verified_revision is null
    from private.external_chat_binding_credentials
    where ws_id = (select ws_id from external_chat_test_context)
  ),
  true,
  'direct binding URL changes invalidate prior verification'
);
select ok(
  private.external_chat_mark_verified(
    (select ws_id from external_chat_test_context), 'ciphertext', 3
  ),
  'the directly changed bridge can be verified at its new revision'
);
create temporary table external_chat_delivery_results (result jsonb not null);
insert into external_chat_delivery_results
select private.external_chat_reserve_reply(
  c.ws_id,
  (r.result->>'conversationId')::uuid,
  c.actor_id,
  repeat('d', 64),
  repeat('e', 64),
  (select result->>'messageId' from external_chat_test_results where attempt = 1)::uuid
)
from external_chat_test_context c
cross join external_chat_test_results r
where r.attempt = 1;
select is(
  (select (result->>'configurationRevision')::bigint from external_chat_delivery_results),
  3::bigint,
  'reply reservations capture the verified configuration revision'
);
select throws_ok(
  format(
    $$select private.external_chat_update_settings(%L, '{"enabled":true,"bridgeBaseUrl":"https://next.example.com","agentMappings":{},"inboxDefaults":{},"authorityMode":"legacy_primary"}'::jsonb, null)$$,
    (select ws_id from external_chat_test_context)
  ),
  'external_chat_delivery_in_progress',
  'settings cannot change while a reply delivery lease is active'
);
select throws_ok(
  format(
    $$select private.external_chat_stage_credential(%L, 'set_ingest', 'pending', %L, 'last')$$,
    (select ws_id from external_chat_test_context),
    repeat('f', 64)
  ),
  'external_chat_delivery_in_progress',
  'credentials cannot rotate while a reply delivery lease is active'
);
update private.external_chat_outbound_deliveries
set cancelled_at = current_timestamp
where ws_id = (select ws_id from external_chat_test_context);
select lives_ok(
  format(
    $$select private.external_chat_update_settings(%L, '{"enabled":true,"bridgeBaseUrl":"https://next.example.com","agentMappings":{},"inboxDefaults":{},"authorityMode":"legacy_primary"}'::jsonb, null)$$,
    (select ws_id from external_chat_test_context)
  ),
  'settings can change after a failed delivery lease is released'
);
select ok(
  private.external_chat_mark_verified(
    (select ws_id from external_chat_test_context), 'ciphertext', 4
  ),
  'the advanced configuration can be verified after lease release'
);
update private.external_chat_outbound_deliveries
set cancelled_at = current_timestamp
where ws_id = (select ws_id from external_chat_test_context);
update external_chat_delivery_results
set result = private.external_chat_reserve_reply(
  (select ws_id from external_chat_test_context),
  (select (result->>'conversationId')::uuid from external_chat_test_results where attempt = 1),
  (select actor_id from external_chat_test_context),
  repeat('d', 64),
  repeat('e', 64),
  (select result->>'messageId' from external_chat_test_results where attempt = 1)::uuid
);
select is(
  (select (result->>'configurationRevision')::bigint from external_chat_delivery_results),
  4::bigint,
  'retrying a cancelled reservation refreshes its configuration fence'
);

update private.external_chat_outbound_deliveries
set delivered_at = current_timestamp, cancelled_at = null
where id = (select (result->>'deliveryId')::uuid from external_chat_delivery_results);
create temporary table external_chat_echo_results (result jsonb not null);
insert into external_chat_echo_results
select private.external_chat_import_event(
  c.ws_id,
  'test-connector',
  'agent-1',
  'visitor-1',
  d.result->>'idempotencyKey',
  'staff',
  'reply',
  now(),
  4,
  '{"displayName":"Test visitor"}'::jsonb,
  '{}'::jsonb,
  c.actor_id
)
from external_chat_test_context c
cross join external_chat_delivery_results d;
select throws_ok(
  format(
    $$select private.external_chat_finalize_reply(%L, %L, %L, 'changed reply', %L, %L)$$,
    (select ws_id from external_chat_test_context),
    (select (result->>'deliveryId')::uuid from external_chat_delivery_results),
    (select actor_id from external_chat_test_context),
    repeat('e', 64),
    (select (result->>'messageId')::uuid from external_chat_test_results where attempt = 1)
  ),
  'external_chat_idempotency_payload_mismatch',
  'an altered bridge echo cannot be accepted as the finalized reply'
);
update private.chat_messages
set reply_to_message_id = null
where id = (select (result->>'messageId')::uuid from external_chat_echo_results);
select throws_ok(
  format(
    $$select private.external_chat_finalize_reply(%L, %L, %L, 'reply', %L, %L)$$,
    (select ws_id from external_chat_test_context),
    (select (result->>'deliveryId')::uuid from external_chat_delivery_results),
    (select actor_id from external_chat_test_context),
    repeat('e', 64),
    (select (result->>'messageId')::uuid from external_chat_test_results where attempt = 1)
  ),
  'external_chat_idempotency_payload_mismatch',
  'an echo with a changed reply target cannot be accepted as finalized'
);
update private.chat_messages
set reply_to_message_id = (
  select (result->>'messageId')::uuid
  from external_chat_test_results
  where attempt = 1
)
where id = (select (result->>'messageId')::uuid from external_chat_echo_results);
create temporary table external_chat_finalize_results (
  attempt integer primary key,
  result jsonb not null
);
insert into external_chat_finalize_results
select 1, private.external_chat_finalize_reply(
  c.ws_id,
  (d.result->>'deliveryId')::uuid,
  c.actor_id,
  'reply',
  repeat('e', 64),
  (select result->>'messageId' from external_chat_test_results where attempt = 1)::uuid
)
from external_chat_test_context c
cross join external_chat_delivery_results d;
select is(
  (select result #>> '{message,id}' from external_chat_finalize_results where attempt = 1),
  (select result->>'messageId' from external_chat_echo_results),
  'finalization reconciles the bridge echo instead of creating another message'
);
select is(
  (select result->>'replayed' from external_chat_finalize_results where attempt = 1),
  'true',
  'an echo completed before finalization is reported as replayed'
);
insert into external_chat_finalize_results
select 2, private.external_chat_finalize_reply(
  c.ws_id,
  (d.result->>'deliveryId')::uuid,
  c.actor_id,
  'reply',
  repeat('e', 64),
  (select result->>'messageId' from external_chat_test_results where attempt = 1)::uuid
)
from external_chat_test_context c
cross join external_chat_delivery_results d;
select is(
  (select result->>'replayed' from external_chat_finalize_results where attempt = 2),
  'true',
  'a repeated finalization is marked so notification side effects can be suppressed'
);
select is(
  (
    select message_id::text from private.external_chat_outbound_deliveries
    where id = (select (result->>'deliveryId')::uuid from external_chat_delivery_results)
  ),
  (select result->>'messageId' from external_chat_echo_results),
  'the delivery is completed with the echoed native message'
);
select is(
  (
    select sender_id::text from private.chat_messages
    where id = (select (result->>'messageId')::uuid from external_chat_echo_results)
  ),
  (select actor_id::text from external_chat_test_context),
  'staff echoes are reconciled to the native actor before realtime fanout'
);
select is(
  (
    select reply_to_message_id::text from private.chat_messages
    where id = (select (result->>'messageId')::uuid from external_chat_echo_results)
  ),
  (select result->>'messageId' from external_chat_test_results where attempt = 1),
  'staff echoes retain the reserved native reply target'
);

update private.external_chat_binding_credentials
set pending_action = null,
    pending_secret_encrypted = null,
    pending_secret_hash = null,
    pending_secret_last_four = null,
    pending_created_at = null
where ws_id = (select ws_id from external_chat_test_context);
update private.external_chat_binding_credentials
set pairing_ticket_hash = repeat('9', 64),
    pairing_ticket_issued_at = now(),
    pairing_ticket_expires_at = now() + interval '5 minutes',
    pairing_ticket_consumed_at = null
where ws_id = (select ws_id from external_chat_test_context);
select ok(
  (
    select pairing_ticket_expires_at > now()
    from private.external_chat_binding_credentials
    where ws_id = (select ws_id from external_chat_test_context)
  ),
  'a new pairing attempt can begin before credential revocation'
);
select throws_ok(
  format(
    $$select private.external_chat_clear_credential(%L, 'control')$$,
    (select ws_id from external_chat_test_context)
  ),
  'external_chat_pairing_in_progress',
  'credential revocation cannot race an active pairing attempt'
);
update private.external_chat_binding_credentials
set pairing_ticket_expires_at = now() - interval '1 second'
where ws_id = (select ws_id from external_chat_test_context);
select lives_ok(
  format(
    $$select private.external_chat_stage_credential(%L, 'set_ingest', 'pending-ingest', %L, 'last')$$,
    (select ws_id from external_chat_test_context),
    repeat('f', 64)
  ),
  'an ingest rotation can be pending before full credential revocation'
);
do $$
begin
  perform private.external_chat_clear_credential(
    (select ws_id from external_chat_test_context),
    'control'
  );
end;
$$;
select is(
  (
    select control_secret_encrypted is null
      and ingest_secret_hash is null
      and pending_action is null
    from private.external_chat_binding_credentials
    where ws_id = (select ws_id from external_chat_test_context)
  ),
  true,
  'clearing control credentials atomically revokes the full pairing and pending ingest rotation'
);

update private.external_chat_binding_credentials
set control_secret_encrypted = 'revocation-ciphertext',
    control_secret_last_four = 'last',
    ingest_secret_hash = repeat('a', 64),
    ingest_secret_last_four = 'last',
    pairing_ticket_hash = repeat('b', 64),
    pairing_ticket_issued_at = now(),
    pairing_ticket_expires_at = now() - interval '1 second',
    pairing_ticket_consumed_at = now()
where ws_id = (select ws_id from external_chat_test_context);
select lives_ok(
  format(
    $$select private.external_chat_stage_credential(%L, 'clear_control', 'external-chat-clear', null, '')$$,
    (select ws_id from external_chat_test_context)
  ),
  'paired credential revocation can be durably staged before remote mutation'
);
select is(
  (
    select control_secret_encrypted = 'revocation-ciphertext'
      and ingest_secret_hash = repeat('a', 64)
      and pending_action = 'clear_control'
    from private.external_chat_binding_credentials
    where ws_id = (select ws_id from external_chat_test_context)
  ),
  true,
  'staging revocation preserves active signing material until remote acknowledgement'
);
do $$
begin
  perform private.external_chat_promote_credential(
    (select ws_id from external_chat_test_context),
    'clear_control',
    'external-chat-clear'
  );
end;
$$;
select is(
  (
    select control_secret_encrypted is null
      and ingest_secret_hash is null
      and pending_action is null
      and pairing_ticket_hash is null
      and pairing_ticket_consumed_at is null
    from private.external_chat_binding_credentials
    where ws_id = (select ws_id from external_chat_test_context)
  ),
  true,
  'promoting control revocation clears both credentials and pairing metadata atomically'
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
