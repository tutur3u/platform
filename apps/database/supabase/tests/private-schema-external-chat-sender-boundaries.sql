begin;
select plan(4);

create temporary table external_chat_sender_context (
  ws_id uuid primary key,
  actor_id uuid not null,
  non_member_id uuid not null
);
insert into external_chat_sender_context
select workspace.ws_id, workspace.actor_id, non_member.id
from (
  select w.id as ws_id, wm.user_id as actor_id
  from public.workspaces w
  join public.workspace_members wm on wm.ws_id = w.id
  where not exists (
    select 1 from public.workspace_external_project_bindings b where b.ws_id = w.id
  )
  limit 1
) workspace
cross join lateral (
  select u.id
  from public.users u
  where not exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = workspace.ws_id and wm.user_id = u.id
  )
  limit 1
) non_member;

select isnt_empty(
  $$select 1 from external_chat_sender_context$$,
  'the sender-boundary fixture has a member and a user outside the workspace'
);
insert into public.workspace_external_project_bindings (ws_id, is_enabled, settings)
select ws_id, true, '{"chat":{"enabled":true}}'::jsonb
from external_chat_sender_context;
insert into private.external_chat_binding_credentials (
  ws_id, configuration_revision, verified_revision, verified_at
)
select ws_id, 2, 2, now()
from external_chat_sender_context;
do $test$
begin
  perform private.external_chat_import_event(
    ws_id, 'test-connector', 'agent-1', 'visitor-1', 'visitor-message',
    'visitor', 'hello', now(), 2, '{}', '{}'
  ) from external_chat_sender_context;
end;
$test$;

do $test$
begin
  perform private.external_chat_import_event(
    ws_id, 'test-connector', 'agent-1', 'visitor-1', 'member-message',
    'staff', 'mapped reply', now(), 2, '{}', '{}', actor_id
  ) from external_chat_sender_context;
end;
$test$;
select is(
  (
    select m.sender_id
    from private.chat_messages m
    join private.external_chat_events e on e.message_id = m.id
    where e.remote_message_id = 'member-message'
  ),
  (select actor_id from external_chat_sender_context),
  'verified workspace members can be attributed as inbound staff senders'
);

do $test$
begin
  perform private.external_chat_import_event(
    ws_id, 'test-connector', 'agent-1', 'visitor-1', 'non-member-message',
    'staff', 'untrusted mapped reply', now(), 2, '{}', '{}', non_member_id
  ) from external_chat_sender_context;
end;
$test$;
select is(
  (
    select m.sender_id
    from private.chat_messages m
    join private.external_chat_events e on e.message_id = m.id
    where e.remote_message_id = 'non-member-message'
  ),
  null,
  'users outside the workspace cannot be attributed as inbound staff senders'
);

insert into private.external_chat_outbound_deliveries (
  ws_id, thread_id, request_fingerprint, payload_hash,
  configuration_revision, idempotency_key, delivered_at
)
select
  context.ws_id, thread.id, repeat('1', 64), repeat('2', 64),
  credentials.configuration_revision,
  '33333333-3333-4333-8333-333333333333'::uuid, now()
from external_chat_sender_context context
join private.external_chat_threads thread on thread.ws_id = context.ws_id
join private.external_chat_binding_credentials credentials
  on credentials.ws_id = context.ws_id;
do $test$
begin
  perform private.external_chat_import_event(
    ws_id, 'test-connector', 'agent-1', 'visitor-1',
    '33333333-3333-4333-8333-333333333333',
    'staff', 'anonymous native reply', now(), 2, '{}', '{}', actor_id
  ) from external_chat_sender_context;
end;
$test$;
select is(
  (
    select m.sender_id
    from private.chat_messages m
    join private.external_chat_events e on e.message_id = m.id
    where e.remote_message_id = '33333333-3333-4333-8333-333333333333'
  ),
  null,
  'native staff echoes preserve a null reserved actor instead of using the inbound mapping'
);

select * from finish();
rollback;
