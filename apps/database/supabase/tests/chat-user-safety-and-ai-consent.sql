-- Regression coverage for 20261128170000_chat_user_blocks.sql,
-- 20261128170500_chat_content_reports.sql and 20261128171000_mira_ai_data_consent.sql. Decision and scope:
-- apps/docs/platform/chat-safety-and-ai-consent.mdx.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- a = reporter/blocker, b = blocked person, c = unrelated stranger.
insert into auth.users(id) values
  ('00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000a002'),
  ('00000000-0000-4000-8000-00000000a003');
insert into public.users(id, display_name) values
  ('00000000-0000-4000-8000-00000000a001', 'Alice'),
  ('00000000-0000-4000-8000-00000000a002', 'Bao'),
  ('00000000-0000-4000-8000-00000000a003', 'Chi')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.workspaces(id, name, creator_id) values
  ('00000000-0000-4000-8000-00000000b001', 'Safety WS', '00000000-0000-4000-8000-00000000a001');
insert into public.workspace_members(ws_id, user_id) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a002')
on conflict do nothing;

insert into private.chat_conversations(id, ws_id, type, direct_key, created_by) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000b001',
   'direct', 'a001:a002', '00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000b001',
   'group', null, '00000000-0000-4000-8000-00000000a001');
insert into private.chat_conversation_members(conversation_id, user_id) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000a002'),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000a002');

insert into private.chat_messages(id, conversation_id, sender_id, kind, content) values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001',
   '00000000-0000-4000-8000-00000000a002', 'user', 'send me your password');

insert into private.chat_friend_requests(requester_user_id, recipient_user_id, status)
values ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a001', 'accepted');

-- Structure and privileges ---------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
    'private.chat_user_blocks'::regclass,
    'private.chat_content_reports'::regclass,
    'private.user_ai_data_consent'::regclass,
    'private.user_ai_data_consent_events'::regclass)),
  'RLS is on for every new table');
select ok(not has_table_privilege('authenticated', 'private.chat_user_blocks', 'SELECT')
  and not has_table_privilege('authenticated', 'private.chat_content_reports', 'SELECT')
  and not has_table_privilege('anon', 'private.chat_content_reports', 'SELECT')
  and not has_table_privilege('authenticated', 'private.user_ai_data_consent', 'SELECT'),
  'signed-in and anonymous roles cannot read blocks, reports or consent');
select ok(not has_function_privilege('authenticated',
    'private.chat_block_user(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon',
    'private.chat_submit_content_report(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'private.record_ai_data_consent(uuid,boolean,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'private.has_ai_data_consent(uuid)', 'EXECUTE')
  and has_function_privilege('service_role',
    'private.chat_block_user(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role',
    'private.has_ai_data_consent(uuid)', 'EXECUTE'),
  'block, report and consent functions run only as service_role');

-- Blocking -----------------------------------------------------------------
select ok(private.chat_can_invite_user(
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002'),
  'before blocking, workspace mates can invite each other');

select is(private.chat_block_user(
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002'),
  jsonb_build_object('blocked', true, 'userId', '00000000-0000-4000-8000-00000000a002'::uuid),
  'blocking returns the target');
select lives_ok($$ select private.chat_block_user(
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002') $$,
  'blocking twice is idempotent');
select throws_ok($$ select private.chat_block_user(
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a001') $$,
  '22023', 'chat_block_self_invalid', 'nobody can block themselves');
select throws_ok($$ select private.chat_block_user(
    '00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000a001') $$,
  'P0002', 'chat_block_target_not_found',
  'a stranger cannot block (or probe) an unrelated account');
select throws_ok($$ select private.chat_block_user(
    '00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000ffff') $$,
  'P0002', 'chat_block_target_not_found',
  'an unknown id answers exactly like an unrelated one');

select ok(not private.chat_can_invite_user(
    '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a001'),
  'the blocked person can no longer invite the blocker');
select ok(not private.chat_users_are_friends(
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002'),
  'blocking ends the friendship');

select throws_ok($$
  insert into private.chat_messages(conversation_id, sender_id, kind, content)
  values ('00000000-0000-4000-8000-00000000c001',
          '00000000-0000-4000-8000-00000000a002', 'user', 'hello again') $$,
  '42501', 'chat_blocked', 'the blocked person cannot message the blocker in a DM');
select throws_ok($$
  insert into private.chat_messages(conversation_id, sender_id, kind, content)
  values ('00000000-0000-4000-8000-00000000c001',
          '00000000-0000-4000-8000-00000000a001', 'user', 'stop') $$,
  '42501', 'chat_blocked', 'the blocker cannot message across their own block either');
select throws_ok($$
  insert into private.chat_messages(conversation_id, sender_id, kind, content)
  values ('00000000-0000-4000-8000-00000000c001', null, 'assistant', 'spoofed') $$,
  '42501', 'chat_blocked', 'assistant-kind messages cannot slip into a blocked DM');
select throws_ok($$
  insert into private.chat_messages(conversation_id, sender_id, kind, content)
  values ('00000000-0000-4000-8000-00000000c001',
          '00000000-0000-4000-8000-00000000a002', 'system', 'renamed') $$,
  '42501', 'chat_blocked', 'system messages cannot slip into a blocked DM');
select throws_ok($$
  update private.chat_messages set content = 'edited insult'
  where id = '00000000-0000-4000-8000-00000000d001' $$,
  '42501', 'chat_blocked', 'old DM messages cannot be edited across a block');
select throws_ok($$
  insert into private.chat_message_reactions(message_id, user_id, emoji)
  values ('00000000-0000-4000-8000-00000000d001',
          '00000000-0000-4000-8000-00000000a002', 'x') $$,
  '42501', 'chat_blocked', 'reactions cannot be added across a block');
select lives_ok($$
  update private.chat_messages set deleted_at = now()
  where id = '00000000-0000-4000-8000-00000000d001';
  update private.chat_messages set deleted_at = null
  where id = '00000000-0000-4000-8000-00000000d001' $$,
  'people can still delete their own messages in a blocked DM');
select lives_ok($$
  insert into private.chat_messages(conversation_id, sender_id, kind, content)
  values ('00000000-0000-4000-8000-00000000c002',
          '00000000-0000-4000-8000-00000000a002', 'user', 'group hello') $$,
  'group messages still store (they are hidden from the blocker on read)');

select lives_ok($$ select private.chat_create_friend_request_by_email(
    '00000000-0000-4000-8000-00000000b001',
    '00000000-0000-4000-8000-00000000a002', 'nobody-here@example.invalid') $$,
  'friend requests keep their uniform queued answer');
insert into private.chat_friend_requests(requester_user_id, recipient_user_id)
values ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a001');
select is((select count(*)::int from private.chat_friend_requests
    where requester_user_id = '00000000-0000-4000-8000-00000000a002'
      and status = 'pending'), 0,
  'a new friend request from the blocked person is silently dropped');

select is(jsonb_array_length(private.chat_list_blocked_users('00000000-0000-4000-8000-00000000a001')), 1,
  'the blocker sees one blocked person');
select is(jsonb_array_length(private.chat_list_blocked_users('00000000-0000-4000-8000-00000000a002')), 0,
  'the blocked person sees no block list entry (and is not told)');

select is(private.chat_unblock_user(
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002') ->> 'blocked',
  'false', 'unblocking removes the block');
select lives_ok($$
  insert into private.chat_messages(conversation_id, sender_id, kind, content)
  values ('00000000-0000-4000-8000-00000000c001',
          '00000000-0000-4000-8000-00000000a002', 'user', 'after unblock') $$,
  'after unblocking, DMs work again');

-- Reports ------------------------------------------------------------------
select is((private.chat_submit_content_report(
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001',
    'message', null, '00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000d001', null, 'harassment', 'phishing')
  ->> 'reportedUserId'), '00000000-0000-4000-8000-00000000a002',
  'a message report resolves the sender from the database');
select is((select snapshot ->> 'content' from private.chat_content_reports
    where message_id = '00000000-0000-4000-8000-00000000d001'),
  'send me your password', 'the report snapshots server-side content');
select is((private.chat_submit_content_report(
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001',
    'message', null, '00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000d001', null, 'spam', null) ->> 'duplicate'),
  'true', 'a repeat report of the same message returns the open report');
select throws_ok($$ select private.chat_submit_content_report(
    '00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000b001',
    'message', null, '00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000d001', null, 'spam', null) $$,
  'P0002', 'chat_report_message_not_found',
  'an outsider cannot report (or probe) a conversation they are not in');
select throws_ok($$ select private.chat_submit_content_report(
    '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000b001',
    'message', null, '00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000d001', null, 'spam', null) $$,
  '22023', 'chat_report_message_invalid', 'nobody can report their own message');
select throws_ok($$ select private.chat_submit_content_report(
    '00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000b001',
    'user', '00000000-0000-4000-8000-00000000a001', null, null, null, 'spam', null) $$,
  '42501', 'chat_report_target_invalid',
  'a stranger with no shared chat surface cannot report a user');
select throws_ok($$ select private.chat_submit_content_report(
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001',
    'user', '00000000-0000-4000-8000-00000000a002', null, null, null, 'nonsense', null) $$,
  '22023', 'chat_report_reason_invalid', 'unknown reasons are rejected');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$ select private.chat_list_content_reports(
    '00000000-0000-4000-8000-00000000a003', null, 50) $$,
  'PT403', 'Feedback forbidden', 'a non-staff account cannot read the report queue');
select throws_ok($$ select private.chat_review_content_report(
    (select id from private.chat_content_reports limit 1),
    '00000000-0000-4000-8000-00000000a003', 'dismissed', 'not abuse') $$,
  'PT403', 'Feedback forbidden', 'a non-staff account cannot resolve reports');

-- Mira AI data consent -----------------------------------------------------
select ok(not private.has_ai_data_consent('00000000-0000-4000-8000-00000000a001'),
  'Mira consent defaults to not allowed');
select is((select granted from private.record_ai_data_consent(
    '00000000-0000-4000-8000-00000000a001', true, 'mobile_mira_prompt', '2026-11-28')),
  true, 'Allow is recorded');
select ok(private.has_ai_data_consent('00000000-0000-4000-8000-00000000a001'),
  'Mira may send after Allow');
select is((select withdrawn_at is not null from private.record_ai_data_consent(
    '00000000-0000-4000-8000-00000000a001', false, 'mobile_settings', '2026-11-28')),
  true, 'revoking stamps withdrawn_at');
select ok(not private.has_ai_data_consent('00000000-0000-4000-8000-00000000a001'),
  'Mira refuses again after revoke');
select is((select count(*)::int from private.user_ai_data_consent_events
    where user_id = '00000000-0000-4000-8000-00000000a001'), 2,
  'each decision is kept as audit evidence');
select throws_ok($$ select private.record_ai_data_consent(
    '00000000-0000-4000-8000-00000000a001', true, 'web_banner', '2026-11-28') $$,
  '22023', 'invalid consent source', 'unknown consent sources are rejected');
select throws_ok($$ delete from private.user_ai_data_consent_events $$,
  '55000', 'AI data consent evidence is append-only', 'consent evidence is append-only');

select * from finish();
rollback;
