-- Regression coverage for 20261128170000_chat_user_blocks.sql,
-- 20261128170500_chat_content_reports.sql, 20261128171000_mira_ai_data_consent.sql
-- and 20261128172000_chat_blocks_shared_content.sql. Decision and scope:
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
   '00000000-0000-4000-8000-00000000a002', 'user', 'send me your password'),
  ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c001',
   '00000000-0000-4000-8000-00000000a001', 'user', 'my own words');

insert into private.chat_friend_requests(requester_user_id, recipient_user_id, status)
values ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a001', 'accepted');

-- c004: a group whose shared links, files and photos come from both a and b.
insert into public.workspace_default_permissions(ws_id, permission, member_type, enabled) values
  ('00000000-0000-4000-8000-00000000b001', 'view_chat', 'MEMBER', true)
on conflict(ws_id, permission, member_type) do update set enabled = excluded.enabled;
insert into private.chat_conversations(id, ws_id, type, direct_key, created_by) values
  ('00000000-0000-4000-8000-00000000c004', '00000000-0000-4000-8000-00000000b001',
   'group', null, '00000000-0000-4000-8000-00000000a001');
insert into private.chat_conversation_members(conversation_id, user_id) values
  ('00000000-0000-4000-8000-00000000c004', '00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000c004', '00000000-0000-4000-8000-00000000a002');
insert into private.chat_messages(id, conversation_id, sender_id, kind, content) values
  ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000c004',
   '00000000-0000-4000-8000-00000000a002', 'user', 'see https://blocked.example/x'),
  ('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000c004',
   '00000000-0000-4000-8000-00000000a001', 'user', 'mine https://own.example/y');
insert into private.chat_message_attachments(
  id, conversation_id, message_id, uploader_id, storage_path, filename, content_type
) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000c004',
   '00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000a002',
   'safety/e001.png', 'blocked.png', 'image/png'),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000c004',
   '00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000a002',
   'safety/e002.pdf', 'blocked.pdf', 'application/pdf'),
  ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000c004',
   '00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000a001',
   'safety/e003.pdf', 'own.pdf', 'application/pdf'),
  ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000c004',
   '00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000a002',
   'safety/e004.pdf', 'uploaded-by-blocked.pdf', 'application/pdf');

create function pg_temp.shared_ids(p_kind text, p_key text)
returns text[]
language sql
as $$
  select coalesce(array_agg(item ->> p_key order by item ->> p_key), '{}')
  from jsonb_array_elements(private.chat_list_shared_content(
    '00000000-0000-4000-8000-00000000b001',
    '00000000-0000-4000-8000-00000000c004',
    '00000000-0000-4000-8000-00000000a001') -> p_kind) item;
$$;

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
    'private.has_ai_data_consent(uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role',
    'private.chat_block_user(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role',
    'private.has_ai_data_consent(uuid,text)', 'EXECUTE'),
  'block, report and consent functions run only as service_role');
select ok(not has_function_privilege('authenticated',
    'private.external_chat_conversation_json(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon',
    'private.external_chat_conversation_json(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role',
    'private.external_chat_conversation_json(uuid,uuid)', 'EXECUTE')
  and (select prosecdef from pg_proc
    where oid = 'private.external_chat_conversation_json(uuid,uuid)'::regprocedure),
  'the redefined external-chat conversation JSON keeps definer rights and service_role-only execute');

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
select throws_ok($$
  update private.chat_messages set metadata = '{"spoof": true}'::jsonb
  where id = '00000000-0000-4000-8000-00000000d001' $$,
  '42501', 'chat_blocked', 'message metadata cannot be edited across a block');
select throws_ok($$
  update private.chat_messages set content = ''
  where id = '00000000-0000-4000-8000-00000000d001' $$,
  '42501', 'chat_blocked', 'blanking content without deleting is still an edit');
select lives_ok($$ select private.chat_delete_message(
    '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000c001',
    '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000d002') $$,
  'people can still delete their own messages in a blocked DM');
select ok((select deleted_at is not null and content = '' from private.chat_messages
    where id = '00000000-0000-4000-8000-00000000d002'),
  'the blocked-DM delete is stored as the usual soft delete');
select throws_ok($$
  update private.chat_messages set deleted_at = null
  where id = '00000000-0000-4000-8000-00000000d002' $$,
  '42501', 'chat_blocked', 'a deleted DM message cannot be restored across a block');
select throws_ok($$
  update private.chat_messages set content = 'rewritten'
  where id = '00000000-0000-4000-8000-00000000d002' $$,
  '42501', 'chat_blocked', 'a deleted DM message cannot be rewritten across a block');
select throws_ok($$
  insert into private.chat_conversations(id, ws_id, type, direct_key, created_by)
  values ('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-00000000b001',
          'direct', 'a001:a002:second', '00000000-0000-4000-8000-00000000a001');
  insert into private.chat_conversation_members(conversation_id, user_id) values
    ('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-00000000a001');
  insert into private.chat_conversation_members(conversation_id, user_id) values
    ('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-00000000a002') $$,
  '42501', 'chat_target_not_invitable',
  'a new DM between a blocked pair is refused at member insert');
select lives_ok($$
  insert into private.chat_messages(conversation_id, sender_id, kind, content)
  values ('00000000-0000-4000-8000-00000000c002',
          '00000000-0000-4000-8000-00000000a002', 'user', 'group hello') $$,
  'group messages still store (they are hidden from the blocker on read)');
select is((private.chat_conversation_json(
    '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000a001')
  ->> 'unreadCount')::int, 0,
  'messages from a blocked sender do not count as unread for the blocker');
select is((private.external_chat_conversation_json(
    '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000a001')
  ->> 'unreadCount')::int, 0,
  'the external-chat inbox skips a blocked sender in unreadCount too');
select is((private.chat_conversation_json(
    '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000a002')
  ->> 'unreadCount')::int, 0,
  'the sender never counts their own message as unread');

select is(pg_temp.shared_ids('links', 'url'), array['https://own.example/y'],
  'shared links skip a link the blocked person sent');
select is(pg_temp.shared_ids('photos', 'id'), '{}'::text[],
  'shared photos skip a photo on the blocked person''s message');
select is(pg_temp.shared_ids('files', 'id'),
  array['00000000-0000-4000-8000-00000000e003'],
  'shared files skip files the blocked person sent or uploaded');
select is(jsonb_array_length(private.chat_list_shared_content(
    '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000c004',
    '00000000-0000-4000-8000-00000000a002') -> 'links'), 2,
  'the blocked person still sees every shared link (the block is one-sided)');

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
select is((private.chat_conversation_json(
    '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000a001')
  ->> 'unreadCount')::int, 1,
  'after unblocking, the group message counts as unread again');
select is((private.external_chat_conversation_json(
    '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000a001')
  ->> 'unreadCount')::int, 1,
  'after unblocking, the external-chat inbox counts the group message again');
select is(pg_temp.shared_ids('links', 'url'),
  array['https://blocked.example/x', 'https://own.example/y'],
  'after unblocking, the blocked person''s shared link shows again');
select is(pg_temp.shared_ids('photos', 'id'),
  array['00000000-0000-4000-8000-00000000e001'],
  'after unblocking, the shared photo shows again');
select is(pg_temp.shared_ids('files', 'id'),
  array['00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e003',
        '00000000-0000-4000-8000-00000000e004'],
  'after unblocking, every shared file shows again');
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
select ok(private.has_ai_data_consent('00000000-0000-4000-8000-00000000a001', '2026-11-28'),
  'Allow counts for the policy version it was given under');
select ok(not private.has_ai_data_consent('00000000-0000-4000-8000-00000000a001', '2027-01-01'),
  'Allow under another policy version does not count for the current one');
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
