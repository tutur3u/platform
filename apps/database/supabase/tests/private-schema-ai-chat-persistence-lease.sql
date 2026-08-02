begin;

select plan(18);

select has_table(
  'private', 'ai_chat_persistence_requests',
  'AI persistence request leases are private'
);
select has_function(
  'private', 'ai_chat_claim_persistence_request',
  'AI persistence requests can be claimed atomically'
);
select has_function(
  'private', 'ai_chat_complete_persistence_request',
  'AI persistence requests can be completed with a fence token'
);
select has_function(
  'private', 'ai_chat_release_persistence_request',
  'AI persistence request leases can be released after failures'
);
select isnt_empty(
  $$select 1 from information_schema.table_privileges
    where table_schema = 'private'
      and table_name = 'ai_chat_persistence_requests'
      and grantee = 'service_role'$$,
  'service role can manage AI persistence request leases'
);
select is_empty(
  $$select 1 from information_schema.table_privileges
    where table_schema = 'private'
      and table_name = 'ai_chat_persistence_requests'
      and grantee in ('anon', 'authenticated')$$,
  'client roles cannot read AI persistence request leases'
);
select function_privs_are(
  'private', 'ai_chat_claim_persistence_request',
  array['uuid','uuid','uuid','text','text','uuid'],
  'service_role', array['EXECUTE'],
  'service role can claim AI persistence requests'
);
select function_privs_are(
  'private', 'ai_chat_claim_persistence_request',
  array['uuid','uuid','uuid','text','text','uuid'],
  'authenticated', array[]::text[],
  'authenticated clients cannot claim AI persistence requests'
);

insert into public.users (id)
values ('00000000-0000-0000-0000-000000000020')
on conflict (id) do nothing;

insert into public.ai_chats (id, title, creator_id)
values (
  '00000000-0000-0000-0000-000000000021',
  'pgtap persistence lease probe',
  '00000000-0000-0000-0000-000000000020'
)
on conflict (id) do nothing;

insert into public.ai_chat_messages (
  chat_id, content, creator_id, metadata, role
)
values (
  '00000000-0000-0000-0000-000000000021',
  'Saved prompt',
  '00000000-0000-0000-0000-000000000020',
  '{"requestId":"00000000-0000-0000-0000-000000000022","source":"Rewise"}',
  'USER'
);

select is(
  private.ai_chat_claim_persistence_request(
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000022',
    'Saved prompt', 'Rewise',
    '00000000-0000-0000-0000-000000000023'
  )->>'state',
  'claimed',
  'the first provider worker claims the request'
);
select is(
  private.ai_chat_claim_persistence_request(
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000022',
    'Saved prompt', 'Rewise',
    '00000000-0000-0000-0000-000000000024'
  )->>'state',
  'active',
  'a concurrent provider worker observes the active lease'
);
select cmp_ok(
  (
    private.ai_chat_claim_persistence_request(
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000020',
      '00000000-0000-0000-0000-000000000022',
      'Saved prompt', 'Rewise',
      '00000000-0000-0000-0000-000000000024'
    )->>'retryAfterSeconds'
  )::integer,
  '>', 0,
  'active leases provide a positive retry delay'
);
select is(
  private.ai_chat_complete_persistence_request(
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000023'
  ),
  false,
  'a lease cannot complete before its assistant response exists'
);

update private.ai_chat_persistence_requests
set lease_expires_at = now() - interval '1 second'
where chat_id = '00000000-0000-0000-0000-000000000021'
  and request_id = '00000000-0000-0000-0000-000000000022';

select is(
  private.ai_chat_claim_persistence_request(
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000022',
    'Saved prompt', 'Rewise',
    '00000000-0000-0000-0000-000000000024'
  )->>'state',
  'claimed',
  'an expired lease can be reclaimed'
);
select is(
  private.ai_chat_release_persistence_request(
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000023'
  ),
  false,
  'a stale fence token cannot release a reclaimed request'
);

insert into public.ai_chat_messages (
  chat_id, content, creator_id, metadata, role
)
values (
  '00000000-0000-0000-0000-000000000021',
  'Saved answer',
  '00000000-0000-0000-0000-000000000020',
  '{"requestId":"00000000-0000-0000-0000-000000000022","source":"Rewise"}',
  'ASSISTANT'
);

select is(
  private.ai_chat_complete_persistence_request(
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000024'
  ),
  true,
  'the current fence token completes a persisted assistant response'
);
select isnt(
  (
    select completed_at
    from private.ai_chat_persistence_requests
    where chat_id = '00000000-0000-0000-0000-000000000021'
      and request_id = '00000000-0000-0000-0000-000000000022'
  ),
  null,
  'completion is recorded on the private request row'
);
select is(
  private.ai_chat_claim_persistence_request(
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000022',
    'Saved prompt', 'Rewise',
    '00000000-0000-0000-0000-000000000025'
  )->>'state',
  'completed',
  'later retries observe the completed assistant response'
);
select is(
  private.ai_chat_release_persistence_request(
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000024'
  ),
  false,
  'completed persistence requests cannot be released'
);

select * from finish();
rollback;
