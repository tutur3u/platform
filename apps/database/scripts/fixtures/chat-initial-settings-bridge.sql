-- Intentional committed synthetic bridge, separate from rollback-only pgTAP.
-- The control substitutes one validated UUID ownership marker, never customer input.
begin;
set timezone = 'UTC';
do $$ begin
  if exists(select 1 from public.users where id in
    ('b6277131-0000-4000-8000-000000000001','b6277131-0000-4000-8000-000000000002'))
    or exists(select 1 from public.workspaces where id='b6277131-0000-4000-8000-000000000011') then
    raise exception 'chat_bridge_fixture_collision';
  end if;
end $$;
insert into public.users(id) values
 ('b6277131-0000-4000-8000-000000000001'),
 ('b6277131-0000-4000-8000-000000000002');
create temporary table bridge_personal_workspaces as
 select id,creator_id from public.workspaces where personal=true and creator_id in
 ('b6277131-0000-4000-8000-000000000001','b6277131-0000-4000-8000-000000000002');
do $$ begin
 if (select count(*) from bridge_personal_workspaces)<>2 or exists(
  select 1 from bridge_personal_workspaces w where not exists(
   select 1 from public.workspace_members m where m.ws_id=w.id and m.user_id=w.creator_id
  )) then raise exception 'chat_bridge_personal_bootstrap_missing'; end if;
end $$;
update public.workspaces set name='chat-bridge-_CHAT_BRIDGE_MARKER_'
 where id in(select id from bridge_personal_workspaces);
insert into public.workspaces(id,name,personal,creator_id) values
 ('b6277131-0000-4000-8000-000000000011','chat-bridge-_CHAT_BRIDGE_MARKER_',false,'b6277131-0000-4000-8000-000000000001');
insert into public.workspace_members(ws_id,user_id,type) values
 ('b6277131-0000-4000-8000-000000000011','b6277131-0000-4000-8000-000000000002','MEMBER');
insert into public.workspace_default_permissions(ws_id,permission,member_type,enabled) values
 ('b6277131-0000-4000-8000-000000000011','view_chat','MEMBER',true),
 ('b6277131-0000-4000-8000-000000000011','create_chat','MEMBER',true),
 ('b6277131-0000-4000-8000-000000000011','manage_chat','MEMBER',false),
 ('b6277131-0000-4000-8000-000000000011','admin','MEMBER',false)
on conflict(ws_id,permission,member_type) do update set enabled=excluded.enabled;
create temporary table bridge_cases(ordinal integer, name text, input jsonb, receipt jsonb);
insert into bridge_cases(ordinal,name,input) values
 (1,'workspace','{"type":"ai","title":"SQL bridge","aiEnabled":true,"autoReply":true,"modelId":"google/test","initialAiSettings":{"modelId":"google/test","creditSource":"workspace","creditWsId":"b6277131-0000-4000-8000-000000000011","thinkingMode":"thinking"}}'),
 (2,'personal',jsonb_build_object('type','ai','title','SQL bridge','aiEnabled',true,'autoReply',true,'modelId','google/test','initialAiSettings',jsonb_build_object('modelId','google/test','creditSource','personal','creditWsId',(select id from bridge_personal_workspaces where creator_id='b6277131-0000-4000-8000-000000000002'),'thinkingMode','fast'))),
 (3,'null','{"type":"ai","title":"SQL bridge","aiEnabled":true,"autoReply":true,"modelId":"google/test","initialAiSettings":{"modelId":"google/test","creditSource":"workspace","creditWsId":null,"thinkingMode":"fast"}}'),
 (4,'legacy','{"type":"ai","title":"SQL bridge","aiEnabled":true,"autoReply":true,"modelId":"google/test"}');
update bridge_cases set receipt=private.chat_create_conversation(
 'b6277131-0000-4000-8000-000000000011','b6277131-0000-4000-8000-000000000002',input);
create temporary table bridge_permission as select
 public.has_workspace_permission('b6277131-0000-4000-8000-000000000011','b6277131-0000-4000-8000-000000000002','create_chat') as create_allowed,
 public.has_workspace_permission('b6277131-0000-4000-8000-000000000011','b6277131-0000-4000-8000-000000000002','manage_chat') as manage_allowed;
create temporary table bridge_denial(sqlstate text, added_rows integer);
update public.workspace_default_permissions set enabled=false
 where ws_id='b6277131-0000-4000-8000-000000000011' and permission='create_chat' and member_type='MEMBER';
do $$ declare before_count bigint; code text; begin
 select count(*) into before_count from private.chat_conversations
 where ws_id='b6277131-0000-4000-8000-000000000011';
 begin
  perform private.chat_create_conversation('b6277131-0000-4000-8000-000000000011',
   'b6277131-0000-4000-8000-000000000002','{"type":"ai"}');
  raise exception 'chat_bridge_expected_denial_missing';
 exception when insufficient_privilege then get stacked diagnostics code = returned_sqlstate;
 end;
 insert into bridge_denial select code,count(*)-before_count from private.chat_conversations
 where ws_id='b6277131-0000-4000-8000-000000000011';
end $$;
commit;
-- This SELECT is after the real COMMIT. Do not replace with fixture JSON.
select jsonb_build_object('version',1,'committedReadback',true,
 'migrationVersion',(select version from supabase_migrations.schema_migrations where version='20261018020000'),
 'createAllowed',(select create_allowed from bridge_permission),
 'manageAllowed',(select manage_allowed from bridge_permission),
 'deniedSqlstate',(select sqlstate from bridge_denial),
 'deniedCreatedRows',(select added_rows from bridge_denial),
 'fixtureWorkspaces',(select jsonb_agg(jsonb_build_object('id',w.id,'creatorId',w.creator_id,
  'personal',w.personal,'creatorMember',exists(select 1 from public.workspace_members m
   where m.ws_id=w.id and m.user_id=w.creator_id)) order by w.id)
  from public.workspaces w where w.name='chat-bridge-_CHAT_BRIDGE_MARKER_' and w.creator_id in
   ('b6277131-0000-4000-8000-000000000001','b6277131-0000-4000-8000-000000000002')),
 'cases',(select jsonb_agg(jsonb_build_object(
  'name',r.name,'actorId','b6277131-0000-4000-8000-000000000002',
  'wsId','b6277131-0000-4000-8000-000000000011',
  'personalWsId',(select id from bridge_personal_workspaces where creator_id='b6277131-0000-4000-8000-000000000002'),
  'input',r.input,'receipt',r.receipt,
  'readback',private.chat_conversation_json(c.id,c.created_by) ||
   case when r.input ? 'initialAiSettings' then jsonb_build_object('initialAiSettings',
    jsonb_build_object('conversationId',c.id,'wsId',c.ws_id,'actorUserId',c.created_by,
     'modelId',a.model_id,'creditSource',a.credit_source,'creditWsId',a.credit_ws_id,'thinkingMode',a.thinking_mode))
   else '{}'::jsonb end) order by r.ordinal)
  from bridge_cases r join private.chat_conversations c on c.id=(r.receipt->>'id')::uuid
  join private.chat_conversation_ai_settings a on a.conversation_id=c.id));
