begin;
select plan(30);

select has_table('private', 'external_chat_source_events', 'source event ledger exists');
select has_table('private', 'external_chat_observations', 'dynamic observation store exists');
select has_table('private', 'external_chat_sync_runs', 'durable sync run store exists');
select has_table('private', 'external_chat_stream_cursors', 'durable stream cursors exist');
select has_function('private', 'external_chat_upsert_observation', 'observation upsert RPC exists');
select has_function('private', 'external_chat_apply_message_state', 'message state replay RPC exists');
select has_function('private', 'external_chat_record_source_event', 'atomic source ledger RPC exists');

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
    $$select private.external_chat_record_source_event(
      %L, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'probe', %L, %L, '{"authority":"probe"}', now()
    )$$,
    (select ws_id from parity_context),
    repeat('c', 64),
    (select id from private.external_chat_threads
      where ws_id = (select ws_id from parity_context) limit 1)
  ),
  'a probe source record can be inserted atomically'
);
select lives_ok(
  format(
    $$select private.external_chat_record_source_event(
      %L, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'historical', %L, %L, '{"authority":"historical"}', now()
    )$$,
    (select ws_id from parity_context),
    repeat('c', 64),
    (select id from private.external_chat_threads
      where ws_id = (select ws_id from parity_context) limit 1)
  ),
  'an authoritative source record promotes a probe atomically'
);
select lives_ok(
  format(
    $$select private.external_chat_record_source_event(
      %L, 'opaque-connector', 'authority:1', 'authority:1', 'message',
      'probe', %L, %L, '{"authority":"late-probe"}', now()
    )$$,
    (select ws_id from parity_context),
    repeat('c', 64),
    (select id from private.external_chat_threads
      where ws_id = (select ws_id from parity_context) limit 1)
  ),
  'a later probe replay cannot downgrade authority'
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
    select result->>'authority' from private.external_chat_source_events
    where ws_id = (select ws_id from parity_context)
      and connector_key = 'opaque-connector'
      and source_event_id = 'authority:1'
  ),
  'historical',
  'a late probe cannot replace authoritative source results'
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
