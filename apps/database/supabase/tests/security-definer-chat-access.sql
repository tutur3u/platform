-- Run against the full migrated schema. Legacy public chat is server-only;
-- current private chat RPCs use separate tables and explicit actor admission.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(34);

select ok(has_table_privilege('service_role', 'public.workspace_chat_messages', 'SELECT'),
  'service_role retains the legacy chat read grant');
select ok(not has_table_privilege('authenticated', 'public.workspace_chat_messages', 'SELECT'),
  'authenticated has no legacy chat read grant');
select ok(not has_table_privilege('anon', 'public.workspace_chat_messages', 'SELECT'),
  'anon has no legacy chat read grant');
select ok(has_function_privilege('service_role',
  'private.chat_list_messages(uuid,uuid,uuid,integer,timestamptz)', 'EXECUTE'),
  'service_role can execute the current chat message RPC');
select ok(not has_function_privilege('authenticated',
  'private.chat_list_messages(uuid,uuid,uuid,integer,timestamptz)', 'EXECUTE'),
  'authenticated cannot execute the private chat message RPC');
select ok(not has_function_privilege('anon',
  'private.chat_list_messages(uuid,uuid,uuid,integer,timestamptz)', 'EXECUTE'),
  'anon cannot execute the private chat message RPC');

-- A belongs to both conversations; B is outside the workspace; C is a
-- workspace member with view_chat but outside the private group conversation.
-- No required-MFA metadata means these real Auth identities satisfy MFA.
select set_config('request.jwt.claims', '{}', true);
insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-4000-8000-00000000a301', 'definer-chat-member@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-00000000a302', 'definer-chat-outsider@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-00000000a303', 'definer-chat-nonparticipant@example.test', now(), '{}');
insert into public.users(id) values
  ('00000000-0000-4000-8000-00000000a301'),
  ('00000000-0000-4000-8000-00000000a302'),
  ('00000000-0000-4000-8000-00000000a303')
on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
  ('00000000-0000-4000-8000-00000000a311', 'Definer chat contract', false,
    '00000000-0000-4000-8000-00000000a301');
insert into public.workspace_members(ws_id, user_id, type) values
  ('00000000-0000-4000-8000-00000000a311', '00000000-0000-4000-8000-00000000a301', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000a311', '00000000-0000-4000-8000-00000000a303', 'MEMBER')
on conflict do nothing;
insert into public.workspace_default_permissions(ws_id, permission, member_type, enabled) values
  ('00000000-0000-4000-8000-00000000a311', 'view_chat', 'MEMBER', true),
  ('00000000-0000-4000-8000-00000000a311', 'admin', 'MEMBER', false)
on conflict(ws_id, permission, member_type) do update set enabled=excluded.enabled;

insert into public.workspace_chat_channels(id, ws_id, name, created_by) values
  ('00000000-0000-4000-8000-00000000a321', '00000000-0000-4000-8000-00000000a311',
    'Legacy contract channel', '00000000-0000-4000-8000-00000000a301');
insert into public.workspace_chat_participants(channel_id, user_id) values
  ('00000000-0000-4000-8000-00000000a321', '00000000-0000-4000-8000-00000000a301');
insert into public.workspace_chat_messages(id, channel_id, user_id, content) values
  ('00000000-0000-4000-8000-00000000a331', '00000000-0000-4000-8000-00000000a321',
    '00000000-0000-4000-8000-00000000a301', 'Seeded legacy server-only message');

insert into private.chat_conversations(id, ws_id, type, title, created_by) values
  ('00000000-0000-4000-8000-00000000a341', '00000000-0000-4000-8000-00000000a311',
    'group', 'Private contract group', '00000000-0000-4000-8000-00000000a301');
insert into private.chat_conversation_members(conversation_id, user_id, role) values
  ('00000000-0000-4000-8000-00000000a341', '00000000-0000-4000-8000-00000000a301', 'owner');
insert into private.chat_messages(id, conversation_id, sender_id, content) values
  ('00000000-0000-4000-8000-00000000a351', '00000000-0000-4000-8000-00000000a341',
    '00000000-0000-4000-8000-00000000a301', 'Seeded private RPC message');

select is((select count(*)::int from public.workspace_members
  where ws_id='00000000-0000-4000-8000-00000000a311'
    and user_id in ('00000000-0000-4000-8000-00000000a301', '00000000-0000-4000-8000-00000000a303')
    and type='MEMBER'), 2, 'A and C have real workspace memberships');
select ok(not exists(select 1 from public.workspace_members
  where ws_id='00000000-0000-4000-8000-00000000a311'
    and user_id='00000000-0000-4000-8000-00000000a302'),
  'B has no workspace membership');
select ok(not exists(select 1 from private.chat_conversation_members
  where conversation_id='00000000-0000-4000-8000-00000000a341'
    and user_id='00000000-0000-4000-8000-00000000a303'),
  'C has no private group membership');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a301"}', true);
select is(auth.uid(), '00000000-0000-4000-8000-00000000a301'::uuid,
  'authenticated member has the intended Auth identity');
select ok(public.account_required_mfa_satisfied(),
  'member satisfies the independent MFA prerequisite');
select ok(public.has_workspace_permission('00000000-0000-4000-8000-00000000a311',
  auth.uid(), 'view_chat'), 'member satisfies the workspace chat permission prerequisite');
select ok(public.user_is_in_channel('00000000-0000-4000-8000-00000000a321', auth.uid()),
  'member belongs to the seeded legacy channel');
select throws_ok($$select content from public.workspace_chat_messages
  where channel_id='00000000-0000-4000-8000-00000000a321'$$,
  '42501', 'permission denied for table workspace_chat_messages',
  'authenticated channel member cannot read legacy messages directly');
select throws_ok($$select private.chat_list_messages(
  '00000000-0000-4000-8000-00000000a311', '00000000-0000-4000-8000-00000000a341',
  '00000000-0000-4000-8000-00000000a301', 60, null)$$,
  '42501', 'permission denied for schema private',
  'authenticated member cannot call the server-only private RPC directly');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a302"}', true);
select is(auth.uid(), '00000000-0000-4000-8000-00000000a302'::uuid,
  'authenticated outsider has the intended Auth identity');
select ok(public.account_required_mfa_satisfied(),
  'outsider satisfies the independent MFA prerequisite');
select ok(not public.user_is_in_channel('00000000-0000-4000-8000-00000000a321', auth.uid()),
  'outsider does not belong to the legacy channel');
select throws_ok($$select content from public.workspace_chat_messages
  where channel_id='00000000-0000-4000-8000-00000000a321'$$,
  '42501', 'permission denied for table workspace_chat_messages',
  'authenticated outsider cannot read legacy messages directly');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a303"}', true);
select is(auth.uid(), '00000000-0000-4000-8000-00000000a303'::uuid,
  'authenticated nonparticipant has the intended Auth identity');
select ok(public.account_required_mfa_satisfied(),
  'nonparticipant satisfies the independent MFA prerequisite');
select ok(public.has_workspace_permission('00000000-0000-4000-8000-00000000a311',
  auth.uid(), 'view_chat'), 'nonparticipant has workspace view_chat permission');
select throws_ok($$select content from public.workspace_chat_messages
  where channel_id='00000000-0000-4000-8000-00000000a321'$$,
  '42501', 'permission denied for table workspace_chat_messages',
  'workspace membership does not grant direct legacy message reads');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(auth.uid(), null::uuid, 'anonymous session has no Auth identity');
select is(auth.role(), 'anon'::text, 'anonymous session has the intended JWT role');
select throws_ok($$select content from public.workspace_chat_messages
  where channel_id='00000000-0000-4000-8000-00000000a321'$$,
  '42501', 'permission denied for table workspace_chat_messages',
  'anon cannot read seeded legacy messages directly');
select throws_ok($$select private.chat_list_messages(
  '00000000-0000-4000-8000-00000000a311', '00000000-0000-4000-8000-00000000a341',
  '00000000-0000-4000-8000-00000000a301', 60, null)$$,
  '42501', 'permission denied for schema private',
  'anon cannot call the private RPC with a forged actor parameter');

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(auth.role(), 'service_role'::text, 'server call uses the service_role JWT role');
select is(auth.uid(), null::uuid, 'server call has no leftover authenticated actor');
select results_eq(
  $$select id, content from public.workspace_chat_messages
    where channel_id='00000000-0000-4000-8000-00000000a321'$$,
  $$values ('00000000-0000-4000-8000-00000000a331'::uuid,
    'Seeded legacy server-only message'::text)$$,
  'service_role reads the actual seeded legacy message');
select results_eq(
  $$select message->>'id', message->>'content'
    from jsonb_array_elements(private.chat_list_messages(
      '00000000-0000-4000-8000-00000000a311', '00000000-0000-4000-8000-00000000a341',
      '00000000-0000-4000-8000-00000000a301', 60, null)) as messages(message)$$,
  $$values ('00000000-0000-4000-8000-00000000a351'::text,
    'Seeded private RPC message'::text)$$,
  'service-role private RPC returns the seeded message for the legitimate member');
select throws_ok($$select private.chat_list_messages(
  '00000000-0000-4000-8000-00000000a311', '00000000-0000-4000-8000-00000000a341',
  '00000000-0000-4000-8000-00000000a302', 60, null)$$,
  '42501', 'chat_workspace_membership_required',
  'service-role private RPC rejects an actor outside the workspace');
select throws_ok($$select private.chat_list_messages(
  '00000000-0000-4000-8000-00000000a311', '00000000-0000-4000-8000-00000000a341',
  '00000000-0000-4000-8000-00000000a303', 60, null)$$,
  '42501', 'chat_conversation_forbidden',
  'service-role private RPC rejects a workspace member outside the group');
select is(private.chat_get_conversation(
  '00000000-0000-4000-8000-00000000a311', '00000000-0000-4000-8000-00000000a341',
  '00000000-0000-4000-8000-00000000a301')->>'id',
  '00000000-0000-4000-8000-00000000a341'::text,
  'service-role conversation lookup retains legitimate member access');
reset role;

select * from finish();
rollback;
