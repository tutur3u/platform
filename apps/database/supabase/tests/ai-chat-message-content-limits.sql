begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(7);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_chat_messages'::regclass
      and conname = 'ai_chat_messages_content_length_check'
      and pg_get_constraintdef(oid) like '%char_length(content)%<= 10000%'
  ),
  'public AI chat messages enforce a 10000-character content limit'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_chat_messages'::regclass
      and conname = 'ai_chat_messages_content_bytes_check'
      and pg_get_constraintdef(oid) like '%octet_length(content)%<= 40000%'
  ),
  'public AI chat messages enforce a 40000-byte content limit'
);

insert into public.users (id)
values ('00000000-0000-0000-0000-000000000010')
on conflict (id) do nothing;

insert into public.ai_chats (id, title, creator_id)
values (
  '00000000-0000-0000-0000-000000000011',
  'pgtap content limit probe',
  '00000000-0000-0000-0000-000000000010'
)
on conflict (id) do nothing;

select lives_ok(
  $$insert into public.ai_chat_messages (chat_id, content, creator_id, role)
    values (
      '00000000-0000-0000-0000-000000000011',
      repeat('a', 10000),
      '00000000-0000-0000-0000-000000000010',
      'USER'
    )$$,
  'public AI chat message table accepts boundary-size content'
);

select throws_ok(
  $$insert into public.ai_chat_messages (chat_id, content, creator_id, role)
    values (
      '00000000-0000-0000-0000-000000000011',
      repeat('a', 10001),
      '00000000-0000-0000-0000-000000000010',
      'USER'
    )$$,
  '23514',
  null,
  'public AI chat message table rejects oversized direct inserts'
);

select lives_ok(
  $$select public.insert_ai_chat_message(
      repeat('b', 10000),
      '00000000-0000-0000-0000-000000000011',
      'pgtap'
    )$$,
  'public AI chat message RPC accepts boundary-size content'
);

select throws_ok(
  $$select public.insert_ai_chat_message(
      repeat('b', 10001),
      '00000000-0000-0000-0000-000000000011',
      'pgtap'
    )$$,
  '22023',
  'ai_chat_message_content_too_large',
  'public AI chat message RPC rejects oversized content before insert'
);

select is(
  (
    select max(char_length(content))
    from public.ai_chat_messages
    where chat_id = '00000000-0000-0000-0000-000000000011'
  ),
  10000,
  'oversized RPC calls do not persist truncated or oversized content'
);

select *
from finish();

rollback;
