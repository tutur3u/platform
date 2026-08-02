begin;
select plan(7);

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

create temporary table external_chat_ai_context (
  conversation_id uuid primary key,
  request_id uuid not null
);
with inserted as (
  insert into private.chat_conversations (
    ws_id, type, title, ai_enabled, created_by
  )
  select ws_id, 'ai', 'Idempotency test', true, actor_id
  from external_chat_test_context
  returning id
)
insert into external_chat_ai_context (conversation_id, request_id)
select id, '11111111-1111-4111-8111-111111111111'::uuid
from inserted;
insert into private.chat_conversation_members (
  conversation_id, user_id, role
)
select conversation_id, actor_id, 'owner'
from external_chat_ai_context
cross join external_chat_test_context;

create temporary table external_chat_user_message_results (
  attempt integer primary key,
  result jsonb not null
);
insert into external_chat_user_message_results
select 1, private.chat_send_user_message_idempotent(
  c.ws_id,
  a.conversation_id,
  c.actor_id,
  '22222222-2222-4222-8222-222222222222'::uuid,
  'Atomic user message',
  null,
  jsonb_build_array(jsonb_build_object(
    'filename', 'retry.txt',
    'path', format('chats/%s/retry.txt', a.conversation_id)
  ))
)
from external_chat_test_context c
cross join external_chat_ai_context a;
insert into external_chat_user_message_results
select 2, private.chat_send_user_message_idempotent(
  c.ws_id,
  a.conversation_id,
  c.actor_id,
  '22222222-2222-4222-8222-222222222222'::uuid,
  'Atomic user message',
  null,
  jsonb_build_array(jsonb_build_object(
    'filename', 'retry.txt',
    'path', format('chats/%s/retry.txt', a.conversation_id)
  ))
)
from external_chat_test_context c
cross join external_chat_ai_context a;

select is(
  (select result->>'replayed' from external_chat_user_message_results where attempt = 1),
  'false',
  'the first native user-message request persists'
);
select is(
  (select result->>'replayed' from external_chat_user_message_results where attempt = 2),
  'true',
  'a repeated native user-message request replays the saved message'
);
select is(
  (
    select count(*)::integer
    from private.chat_messages m
    cross join external_chat_ai_context a
    where m.conversation_id = a.conversation_id
      and m.metadata->>'clientRequestId' =
        '22222222-2222-4222-8222-222222222222'
  ),
  1,
  'a repeated native user-message request creates exactly one message'
);
select throws_ok(
  format(
    $$select private.chat_send_user_message_idempotent(%L, %L, %L, '22222222-2222-4222-8222-222222222222'::uuid, 'Changed user message', null, '[]'::jsonb)$$,
    (select ws_id from external_chat_test_context),
    (select conversation_id from external_chat_ai_context),
    (select actor_id from external_chat_test_context)
  ),
  'chat_idempotency_payload_mismatch',
  'a repeated native user-message request rejects changed content'
);
select throws_ok(
  format(
    $$select private.chat_send_user_message_idempotent(%L, %L, %L, '22222222-2222-4222-8222-222222222222'::uuid, 'Atomic user message', null, '[{"path":"changed-attachment"}]'::jsonb)$$,
    (select ws_id from external_chat_test_context),
    (select conversation_id from external_chat_ai_context),
    (select actor_id from external_chat_test_context)
  ),
  'chat_idempotency_payload_mismatch',
  'a repeated native user-message request rejects changed attachments'
);
select throws_ok(
  format(
    $$select private.chat_persist_ai_message_batch(%L, %L, %L, null)$$,
    (select ws_id from external_chat_test_context),
    (select conversation_id from external_chat_ai_context),
    (select actor_id from external_chat_test_context)
  ),
  'chat_invalid_ai_message_batch',
  'the base native AI batch RPC rejects SQL null input'
);

create temporary table external_chat_ai_results (
  attempt integer primary key,
  result jsonb not null
);
insert into external_chat_ai_results
select 1, private.chat_persist_ai_message_batch_idempotent(
  c.ws_id,
  a.conversation_id,
  c.actor_id,
  a.request_id,
  '[{"content":"Atomic reply","metadata":{"source":"native-ai-chat"}}]'::jsonb
)
from external_chat_test_context c
cross join external_chat_ai_context a;
insert into external_chat_ai_results
select 2, private.chat_persist_ai_message_batch_idempotent(
  c.ws_id,
  a.conversation_id,
  c.actor_id,
  a.request_id,
  '[{"content":"Duplicate reply","metadata":{"source":"native-ai-chat"}}]'::jsonb
)
from external_chat_test_context c
cross join external_chat_ai_context a;

select ok(
  (select result->>'replayed' = 'false' from external_chat_ai_results where attempt = 1)
    and (select result->>'replayed' = 'true' from external_chat_ai_results where attempt = 2)
    and (
      select count(*) = 1
      from private.chat_messages m
      cross join external_chat_ai_context a
      where m.conversation_id = a.conversation_id
        and m.metadata->>'requestId' = a.request_id::text
    ),
  'AI retries replay the first batch and create exactly one assistant message'
);

select * from finish();
rollback;
