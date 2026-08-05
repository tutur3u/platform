begin;
select plan(59);

select has_table('private', 'external_chat_source_events', 'source event ledger exists');
select has_table('private', 'external_chat_observations', 'dynamic observation store exists');
select has_table('private', 'external_chat_sync_runs', 'durable sync run store exists');
select has_table('private', 'external_chat_stream_cursors', 'durable stream cursors exist');
select has_function('private', 'external_chat_upsert_observation', 'observation upsert RPC exists');
select has_function('private', 'external_chat_apply_message_state', 'message state replay RPC exists');
select has_function('private', 'external_chat_claim_source_event', 'atomic source claim RPC exists');
select has_function(
  'private', 'external_chat_finalize_reply',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'uuid', 'jsonb'],
  'attachment-aware reply finalization RPC exists'
);
select has_function(
  'private', 'external_chat_attach_message_files',
  array['uuid', 'uuid', 'uuid', 'uuid', 'jsonb'],
  'internal attachment projection helper exists'
);
select has_function(
  'private', 'external_chat_mark_reply_delivered',
  array['uuid', 'uuid', 'text'],
  'atomic remote-delivery identity RPC exists'
);
select has_column(
  'private', 'external_chat_outbound_deliveries', 'remote_message_id',
  'outbound delivery retains the actual remote message identity'
);

select is_empty(
  $$select 1 from information_schema.table_privileges
    where table_schema = 'private'
      and table_name in (
        'external_chat_source_events', 'external_chat_observations',
        'external_chat_sync_runs', 'external_chat_stream_cursors'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')$$,
  'parity stores have no direct client grants'
);

create temporary table parity_context (ws_id uuid primary key, actor_id uuid not null);
insert into parity_context
select '77777777-7777-4777-8777-777777777777'::uuid, id
from public.users
order by created_at
limit 1;
insert into public.workspaces (id, name, personal, creator_id)
select ws_id, 'External parity test', false, actor_id from parity_context;
insert into public.workspace_external_project_bindings (ws_id, is_enabled, settings)
select ws_id, true, '{"chat":{"enabled":true}}'::jsonb from parity_context;
insert into private.external_chat_binding_credentials (
  ws_id, configuration_revision, verified_at, verified_revision
)
select ws_id, 1, now(), 1 from parity_context;

select lives_ok(
  format(
    $$select private.external_chat_upsert_observation(
      %L, 'opaque-connector', 'bucket-1', 'visitor-1', 'profile:visitor-1',
      'profile_context', '{"displayName":"Visitor","dynamic":{"field":"value"}}', now()
    )$$,
    (select ws_id from parity_context)
  ),
  'a profile observation can create its external thread'
);
select lives_ok(
  format(
    $$select private.external_chat_upsert_observation(
      %L, 'opaque-connector', 'bucket-1', 'visitor-1', 'profile:visitor-1',
      'profile_context', '{"displayName":"Updated visitor"}', now()
    )$$,
    (select ws_id from parity_context)
  ),
  'replaying an observation is idempotent'
);
select is(
  (
    select count(*)::integer from private.external_chat_threads t
    cross join parity_context c
    where t.ws_id = c.ws_id and t.connector_key = 'opaque-connector'
      and t.remote_agent_id = 'bucket-1' and t.remote_visitor_id = 'visitor-1'
  ),
  1,
  'profile replay creates exactly one thread'
);
select is(
  (
    select count(*)::integer from private.external_chat_observations o
    cross join parity_context c
    where o.ws_id = c.ws_id and o.connector_key = 'opaque-connector'
      and o.remote_observation_id = 'profile:visitor-1'
  ),
  1,
  'profile replay creates exactly one observation'
);
select is(
  (
    select payload->>'displayName' from private.external_chat_observations o
    cross join parity_context c
    where o.ws_id = c.ws_id and o.connector_key = 'opaque-connector'
      and o.remote_observation_id = 'profile:visitor-1'
  ),
  'Updated visitor',
  'observation replay updates canonical dynamic content'
);
select lives_ok(
  format(
    $$select private.external_chat_upsert_observation(
      %L, 'opaque-connector', 'bucket-1', 'visitor-1', 'profile:visitor-1',
      'profile_context', '{"displayName":"Stale visitor"}', '2020-01-01T00:00:00Z'
    )$$,
    (select ws_id from parity_context)
  ),
  'a stale observation replay is handled idempotently'
);
select is(
  (
    select payload->>'displayName' from private.external_chat_observations o
    cross join parity_context c
    where o.ws_id = c.ws_id and o.connector_key = 'opaque-connector'
      and o.remote_observation_id = 'profile:visitor-1'
  ),
  'Updated visitor',
  'a stale observation cannot replace newer dynamic content'
);
select throws_ok(
  format(
    $$select private.external_chat_upsert_observation(
      %L, 'opaque-connector', 'bucket-2', 'visitor-2', 'profile:visitor-1',
      'profile_context', '{"displayName":"Wrong visitor"}', now()
    )$$,
    (select ws_id from parity_context)
  ),
  'P0001',
  'external_chat_observation_identity_mismatch',
  'an observation identity cannot move between external threads'
);
select is(
  (
    select count(*)::integer from pg_constraint
    where conrelid = 'private.external_chat_source_events'::regclass
      and conname = 'external_chat_source_events_identity_key'
      and contype = 'u'
  ),
  1,
  'source event identities are unique'
);
select is(
  (
    select count(*)::integer from pg_constraint
    where conrelid = 'private.external_chat_observations'::regclass
      and conname = 'external_chat_observations_identity_key'
      and contype = 'u'
  ),
  1,
  'observation source identities are unique'
);
select col_type_is(
  'private', 'external_chat_observations', 'payload', 'jsonb',
  'observation content remains dynamic JSON'
);

insert into private.external_chat_source_events (
  ws_id, connector_key, source_event_id, source_record_id, event_kind,
  delivery_mode, payload_digest, thread_id, occurred_at
)
select c.ws_id, 'opaque-connector', 'probe:1', 'probe:1', 'message',
  'probe', repeat('a', 64), t.id, now()
from parity_context c
join private.external_chat_threads t on t.ws_id = c.ws_id;
select is(
  (
    select count(*)::integer
    from private.external_chat_threads t
    where t.ws_id = (select ws_id from parity_context)
      and (
        not exists (
          select 1 from private.external_chat_source_events e
          where e.thread_id = t.id
        )
        or exists (
          select 1 from private.external_chat_source_events e
          where e.thread_id = t.id and e.delivery_mode <> 'probe'
        )
      )
  ),
  0,
  'probe-only threads are hidden from the ordinary inbox'
);
insert into private.external_chat_source_events (
  ws_id, connector_key, source_event_id, source_record_id, event_kind,
  delivery_mode, payload_digest, thread_id, occurred_at
)
select c.ws_id, 'opaque-connector', 'historical:1', 'historical:1', 'message',
  'historical', repeat('b', 64), t.id, now()
from parity_context c
join private.external_chat_threads t on t.ws_id = c.ws_id;
select is(
  (
    select count(*)::integer
    from private.external_chat_threads t
    where t.ws_id = (select ws_id from parity_context)
      and exists (
        select 1 from private.external_chat_source_events e
        where e.thread_id = t.id and e.delivery_mode <> 'probe'
      )
  ),
  1,
  'historical or live source records keep the thread visible'
);

select lives_ok(
  format(
    $$select private.external_chat_claim_source_event(
      %L, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'probe', %L, '10000000-0000-4000-8000-000000000001', now()
    )$$,
    (select ws_id from parity_context),
    repeat('c', 64)
  ),
  'a source identity can be claimed atomically'
);
select is(
  (
    select private.external_chat_claim_source_event(
      ws_id, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'probe', repeat('c', 64),
      '10000000-0000-4000-8000-000000000002', now()
    )->>'status'
    from parity_context
  ),
  'in_progress',
  'a concurrent matching delivery waits for the active claim'
);
select is(
  (
    select private.external_chat_claim_source_event(
      ws_id, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'probe', repeat('d', 64),
      '10000000-0000-4000-8000-000000000003', now()
    )->>'status'
    from parity_context
  ),
  'payload_mismatch',
  'a concurrent changed payload is rejected atomically'
);
select lives_ok(
  format(
    $$select private.external_chat_record_source_event(
      %L, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'probe', %L, '10000000-0000-4000-8000-000000000001',
      %L, '{"accepted":true}', now()
    )$$,
    (select ws_id from parity_context),
    repeat('c', 64),
    (select id from private.external_chat_threads
      where ws_id = (select ws_id from parity_context) limit 1)
  ),
  'a claimed source record can be finalized atomically'
);
select lives_ok(
  format(
    $$select private.external_chat_claim_source_event(
      %L, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'historical', %L, '10000000-0000-4000-8000-000000000004', now()
    )$$,
    (select ws_id from parity_context),
    repeat('c', 64)
  ),
  'an authoritative replay promotes a finalized probe'
);
select lives_ok(
  format(
    $$select private.external_chat_record_source_event(
      %L, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'historical', %L, '10000000-0000-4000-8000-000000000004',
      %L, '{"accepted":true}', now()
    )$$,
    (select ws_id from parity_context),
    repeat('c', 64),
    (select id from private.external_chat_threads
      where ws_id = (select ws_id from parity_context) limit 1)
  ),
  'an authoritative replay finalizes the promoted claim'
);
select lives_ok(
  format(
    $$select private.external_chat_claim_source_event(
      %L, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'probe', %L, '10000000-0000-4000-8000-000000000005', now()
    )$$,
    (select ws_id from parity_context),
    repeat('c', 64)
  ),
  'a later probe replay is accepted without downgrading authority'
);
select is(
  (
    select delivery_mode from private.external_chat_source_events
    where ws_id = (select ws_id from parity_context)
      and connector_key = 'opaque-connector'
      and source_event_id = 'authority:1'
  ),
  'historical',
  'source delivery authority is monotonic'
);
select is(
  (
    select result ? 'content' from private.external_chat_source_events
    where ws_id = (select ws_id from parity_context)
      and connector_key = 'opaque-connector'
      and source_event_id = 'authority:1'
  ),
  false,
  'source replay results retain identifiers without message content'
);
select is(
  (
    select private.external_chat_claim_source_event(
      ws_id, 'opaque-connector', 'lease:1', 'lease:1', 'message',
      'historical', repeat('e', 64),
      '20000000-0000-4000-8000-000000000001', now()
    )->>'status'
    from parity_context
  ),
  'claimed',
  'a source identity receives an initial fenced claim'
);
update private.external_chat_source_events
set created_at = now() - interval '6 minutes'
where ws_id = (select ws_id from parity_context)
  and connector_key = 'opaque-connector'
  and source_event_id = 'lease:1';
select is(
  (
    select private.external_chat_claim_source_event(
      ws_id, 'opaque-connector', 'lease:1', 'lease:1', 'message',
      'historical', repeat('e', 64),
      '20000000-0000-4000-8000-000000000002', now()
    )->>'status'
    from parity_context
  ),
  'claimed',
  'a stale source claim can be taken over with a new fence token'
);
do $$
declare
  v_ws_id uuid := (select ws_id from parity_context);
begin
  perform private.external_chat_record_source_event(
    v_ws_id, 'opaque-connector', 'lease:1', 'lease:1', 'message',
    'historical', repeat('e', 64),
    '20000000-0000-4000-8000-000000000001', null,
    '{"accepted":true}'::jsonb, now()
  );
  perform private.external_chat_release_source_event(
    v_ws_id, 'opaque-connector', 'lease:1', repeat('e', 64),
    '20000000-0000-4000-8000-000000000001'
  );
end;
$$;
select is(
  (
    select result->>'claimToken'
    from private.external_chat_source_events
    where ws_id = (select ws_id from parity_context)
      and connector_key = 'opaque-connector'
      and source_event_id = 'lease:1'
  ),
  '20000000-0000-4000-8000-000000000002',
  'an expired claim cannot release the active fenced takeover'
);
select lives_ok(
  format(
    $$select private.external_chat_import_event(
      %L, 'opaque-state', 'bucket-1', 'visitor-state', 'message-state',
      'visitor', 'State replay content', '2026-08-01T00:00:00Z', 1
    )$$,
    (select ws_id from parity_context)
  ),
  'a canonical message can be imported for state replay'
);
select lives_ok(
  format(
    $$select private.external_chat_import_event(
      %L, 'opaque-state', 'bucket-1', 'visitor-state', 'message-state',
      'visitor', 'Corrected replay content', '2026-08-01T00:00:00Z', 1,
      '{"displayName":"Corrected visitor"}', '{"status":"sent","revision":"two"}'
    )$$,
    (select ws_id from parity_context)
  ),
  'a revised canonical snapshot updates the existing native record'
);
select throws_ok(
  format(
    $$select private.external_chat_import_event(
      %L, 'opaque-state', 'bucket-1', 'other-visitor', 'message-state',
      'visitor', 'Hijacked content', '2026-08-01T00:00:00Z', 1
    )$$,
    (select ws_id from parity_context)
  ),
  'P0001',
  'external_chat_message_identity_mismatch',
  'a replayed snapshot cannot move a message to another visitor identity'
);
with delivery as (
  insert into private.external_chat_outbound_deliveries (
    ws_id, thread_id, request_fingerprint, payload_hash,
    configuration_revision, idempotency_key, actor_user_id,
    delivered_at, remote_message_id
  )
  select context.ws_id, thread.id, 'remote-identity-test', repeat('f', 64),
    1, '30000000-0000-4000-8000-000000000001', context.actor_id,
    now(), 'legacy-message-91'
  from parity_context context
  join private.external_chat_threads thread
    on thread.ws_id = context.ws_id
    and thread.connector_key = 'opaque-state'
  returning ws_id, thread_id, idempotency_key
), message as (
  insert into private.chat_messages (conversation_id, sender_id, content)
  select thread.conversation_id, context.actor_id, 'Remote identity test'
  from delivery
  join private.external_chat_threads thread on thread.id = delivery.thread_id
  cross join parity_context context
  returning id
)
insert into private.external_chat_events (
  ws_id, thread_id, connector_key, remote_message_id,
  message_id, direction
)
select delivery.ws_id, delivery.thread_id, 'opaque-state',
  delivery.idempotency_key::text, message.id, 'staff'
from delivery cross join message;
select pass(
  'a finalized outbound mapping accepts the platform idempotency identity'
);
select is(
  (
    select event.remote_message_id
    from private.external_chat_events event
    where event.ws_id = (select ws_id from parity_context)
      and event.connector_key = 'opaque-state'
      and event.direction = 'staff'
  ),
  'legacy-message-91',
  'the outbound mapping stores the actual remote message identity'
);
select lives_ok(
  format(
    $$select private.external_chat_mark_reply_delivered(
      %L, %L, 'legacy-message-91'
    )$$,
    (select ws_id from parity_context),
    (
      select id
      from private.external_chat_outbound_deliveries
      where request_fingerprint = 'remote-identity-test'
    )
  ),
  'replaying the same remote delivery identity is idempotent'
);
select throws_ok(
  format(
    $$select private.external_chat_mark_reply_delivered(
      %L, %L, 'other-message'
    )$$,
    (select ws_id from parity_context),
    (
      select id
      from private.external_chat_outbound_deliveries
      where request_fingerprint = 'remote-identity-test'
    )
  ),
  '22023',
  'external_chat_remote_message_id_mismatch',
  'a delivered reservation cannot be rebound to another remote identity'
);
select is(
  (
    select count(*)::integer
    from private.external_chat_events event
    where event.ws_id = (select ws_id from parity_context)
      and event.connector_key = 'opaque-state'
      and event.remote_message_id = 'message-state'
  ),
  1,
  'a revised snapshot does not duplicate the native message mapping'
);
select is(
  (
    select message.content
    from private.external_chat_events event
    join private.chat_messages message on message.id = event.message_id
    where event.ws_id = (select ws_id from parity_context)
      and event.connector_key = 'opaque-state'
      and event.remote_message_id = 'message-state'
  ),
  'Corrected replay content',
  'a revised snapshot repairs native message content'
);
select is(
  (
    select conversation.title
    from private.external_chat_events event
    join private.external_chat_threads thread on thread.id = event.thread_id
    join private.chat_conversations conversation on conversation.id = thread.conversation_id
    where event.ws_id = (select ws_id from parity_context)
      and event.connector_key = 'opaque-state'
      and event.remote_message_id = 'message-state'
  ),
  'Corrected visitor',
  'a revised snapshot repairs the native visitor label'
);
do $attachment_test$
declare
  v_actor_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_ws_id uuid;
begin
  select context.actor_id, context.ws_id, thread.conversation_id, event.message_id
  into strict v_actor_id, v_ws_id, v_conversation_id, v_message_id
  from parity_context context
  join private.external_chat_events event on event.ws_id = context.ws_id
  join private.external_chat_threads thread on thread.id = event.thread_id
  where event.connector_key = 'opaque-state'
    and event.remote_message_id = 'message-state';

  perform private.external_chat_attach_message_files(
    v_ws_id,
    v_conversation_id,
    v_message_id,
    v_actor_id,
    jsonb_build_array(jsonb_build_object(
      'path', format('chats/%s/image.png', v_conversation_id),
      'filename', 'image.png',
      'contentType', 'image/png',
      'sizeBytes', 12
    ))
  );
end;
$attachment_test$;
select pass(
  'a delivered external image is attached to the native message'
);
select is(
  (
    select count(*)::integer
    from private.chat_message_attachments attachment
    join private.external_chat_events event on event.message_id = attachment.message_id
    join parity_context context on context.ws_id = event.ws_id
    where event.connector_key = 'opaque-state'
      and event.remote_message_id = 'message-state'
  ),
  1,
  'attachment projection remains singular and scoped to the mapped message'
);
select throws_ok(
  (
    select format(
      $sql$select private.external_chat_attach_message_files(
        %L, %L, %L, %L,
        jsonb_build_array(jsonb_build_object(
          'path', %L,
          'filename', 'escaped.png'
        ))
      )$sql$,
      context.ws_id,
      thread.conversation_id,
      event.message_id,
      context.actor_id,
      format('chats/%s/../../escaped.png', thread.conversation_id)
    )
    from parity_context context
    join private.external_chat_events event on event.ws_id = context.ws_id
    join private.external_chat_threads thread on thread.id = event.thread_id
    where event.connector_key = 'opaque-state'
      and event.remote_message_id = 'message-state'
  ),
  '42501',
  'chat_attachment_path_forbidden',
  'an attachment path cannot escape the conversation prefix'
);
select lives_ok(
  format(
    $$select private.external_chat_apply_message_state(
      %L, 'opaque-state', 'message-state', 'seen',
      '2026-08-01T00:02:00Z', false
    )$$,
    (select ws_id from parity_context)
  ),
  'a newer delivery state is applied'
);
select lives_ok(
  format(
    $$select private.external_chat_apply_message_state(
      %L, 'opaque-state', 'message-state', 'sent',
      '2026-08-01T00:02:00Z', false
    )$$,
    (select ws_id from parity_context)
  ),
  'an equal-time lower delivery state is handled without failure'
);
select is(
  (
    select message.metadata->>'status'
    from private.external_chat_events event
    join private.chat_messages message on message.id = event.message_id
    where event.ws_id = (select ws_id from parity_context)
      and event.connector_key = 'opaque-state'
      and event.remote_message_id = 'message-state'
  ),
  'seen',
  'an equal-time lower delivery state cannot regress a terminal state'
);
select ok(
  (
    select private.external_chat_apply_message_state(
      ws_id, 'opaque-state', 'message-state', 'seen',
      '2026-08-01T00:02:00Z', false
    )->>'conversationId' is not null
    from parity_context
  ),
  'message state replay retains its native conversation identity'
);
select lives_ok(
  format(
    $$select private.external_chat_apply_message_state(
      %L, 'opaque-state', 'message-state', 'sent',
      '2026-08-01T00:01:00Z', false
    )$$,
    (select ws_id from parity_context)
  ),
  'an out-of-order state replay is handled without failure'
);
select is(
  (
    select message.metadata->>'status'
    from private.external_chat_events event
    join private.chat_messages message on message.id = event.message_id
    where event.ws_id = (select ws_id from parity_context)
      and event.connector_key = 'opaque-state'
      and event.remote_message_id = 'message-state'
  ),
  'seen',
  'a stale replay cannot replace the newer message state'
);
select lives_ok(
  format(
    $$select private.external_chat_apply_message_state(
      %L, 'opaque-state', 'message-state', 'deleted',
      '2026-08-01T00:03:00Z', true
    )$$,
    (select ws_id from parity_context)
  ),
  'a deletion state is applied'
);
select is(
  (
    select message.content
    from private.external_chat_events event
    join private.chat_messages message on message.id = event.message_id
    where event.ws_id = (select ws_id from parity_context)
      and event.connector_key = 'opaque-state'
      and event.remote_message_id = 'message-state'
  ),
  '',
  'a deleted external message has no retained visible content'
);
select ok(
  (
    select message.deleted_at is not null
    from private.external_chat_events event
    join private.chat_messages message on message.id = event.message_id
    where event.ws_id = (select ws_id from parity_context)
      and event.connector_key = 'opaque-state'
      and event.remote_message_id = 'message-state'
  ),
  'a deleted external message is tombstoned natively'
);

select * from finish();
rollback;
