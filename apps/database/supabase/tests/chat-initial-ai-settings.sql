-- Requires a freshly admitted isolated full-schema migration run. Not a source-only test.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.users(id) values
 ('b6277000-0000-4000-8000-000000000001'),
 ('b6277000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name,personal,creator_id) values
 ('b6277000-0000-4000-8000-000000000011','Initial settings fixture',false,'b6277000-0000-4000-8000-000000000001');
create function pg_temp.fixture_personal_ws_id() returns uuid language sql stable as $$
 select id from public.workspaces
 where creator_id='b6277000-0000-4000-8000-000000000002' and personal=true
$$;
insert into public.workspace_members(ws_id,user_id,type) values
 ('b6277000-0000-4000-8000-000000000011','b6277000-0000-4000-8000-000000000002','MEMBER');
insert into public.workspace_default_permissions(ws_id,permission,member_type,enabled) values
 ('b6277000-0000-4000-8000-000000000011','view_chat','MEMBER',true),
 ('b6277000-0000-4000-8000-000000000011','create_chat','MEMBER',true),
 ('b6277000-0000-4000-8000-000000000011','manage_chat','MEMBER',false),
 ('b6277000-0000-4000-8000-000000000011','admin','MEMBER',false)
on conflict(ws_id,permission,member_type) do update set enabled=excluded.enabled;

select ok(public.has_workspace_permission('b6277000-0000-4000-8000-000000000011','b6277000-0000-4000-8000-000000000002','create_chat'), 'fixture actor has create_chat');
select ok(not public.has_workspace_permission('b6277000-0000-4000-8000-000000000011','b6277000-0000-4000-8000-000000000002','manage_chat'), 'fixture actor has no manage_chat');
select ok(exists(select 1 from public.workspace_members where ws_id=pg_temp.fixture_personal_ws_id() and user_id='b6277000-0000-4000-8000-000000000002'), 'personal creator membership comes from bootstrap');

create function pg_temp.create_initial(p_initial jsonb, p_type text default 'ai') returns jsonb language sql as $$
 select private.chat_create_conversation(
 'b6277000-0000-4000-8000-000000000011', 'b6277000-0000-4000-8000-000000000002',
 jsonb_build_object('type',p_type,'title','Initial fixture','modelId','google/test') ||
 case when p_initial is null then '{}'::jsonb else jsonb_build_object('initialAiSettings',p_initial) end)
$$;
create temporary table initial_results(kind text primary key, receipt jsonb);
insert into initial_results values
 ('workspace',pg_temp.create_initial('{"modelId":"google/test","creditSource":"workspace","creditWsId":"b6277000-0000-4000-8000-000000000011","thinkingMode":"thinking"}')),
 ('personal',pg_temp.create_initial(jsonb_build_object('modelId','google/test','creditSource','personal','creditWsId',pg_temp.fixture_personal_ws_id(),'thinkingMode','fast'))),
 ('null',pg_temp.create_initial('{"modelId":"google/test","creditSource":"workspace","creditWsId":null,"thinkingMode":"fast"}')),
 ('legacy',pg_temp.create_initial(null)),
 ('channel',pg_temp.create_initial(null,'channel'));
select is((select count(*)::integer from initial_results),5,'all admitted creations committed');
select ok(not exists(
 select 1 from initial_results r
 join private.chat_conversations c on c.id=(r.receipt->>'id')::uuid
 join private.chat_conversation_ai_settings a on a.conversation_id=c.id
 where r.kind in ('workspace','personal','null') and
 r.receipt->'initialAiSettings' <> jsonb_build_object(
 'conversationId',c.id,'wsId',c.ws_id,'actorUserId',c.created_by,
 'modelId',a.model_id,'creditSource',a.credit_source,'creditWsId',a.credit_ws_id,'thinkingMode',a.thinking_mode)
),'initial receipt is read from committed conversation/settings rows');
select is((select receipt->'initialAiSettings'->>'thinkingMode' from initial_results where kind='workspace'),'thinking','thinking mode persists atomically');
select is((select receipt->'initialAiSettings'->>'creditSource' from initial_results where kind='personal'),'personal','personal source persists atomically');
select ok((select receipt->'initialAiSettings'->'creditWsId'='null'::jsonb from initial_results where kind='null'),'explicit nullable scope is retained');
select ok(not exists(select 1 from initial_results where kind in('legacy','channel') and receipt ? 'initialAiSettings'),'old clients do not receive a new receipt contract');
select ok(not exists(
 select 1 from initial_results r join private.chat_conversation_ai_settings a on a.conversation_id=(r.receipt->>'id')::uuid
 where r.kind in('legacy','channel') and (a.thinking_mode<>'fast' or a.credit_source<>'workspace' or a.credit_ws_id is not null)
),'old clients retain database defaults');
select is((select count(*)::integer from private.chat_conversation_members m join initial_results r on m.conversation_id=(r.receipt->>'id')::uuid where m.user_id='b6277000-0000-4000-8000-000000000002' and m.role='owner'),5,'creation retains owner membership');

create temporary table before_invalid as select count(*) as n from private.chat_conversations;
select throws_ok($$select pg_temp.create_initial(jsonb_build_object('modelId','google/test','creditSource','workspace','creditWsId',pg_temp.fixture_personal_ws_id(),'thinkingMode','fast'))$$,'42501','chat_invalid_credit_workspace','workspace credits cannot target personal or arbitrary workspace');
select throws_ok($$select pg_temp.create_initial('{"modelId":"google/test","creditSource":"personal","creditWsId":"b6277000-0000-4000-8000-000000000011","thinkingMode":"fast"}')$$,'42501','chat_invalid_credit_workspace','personal credits cannot target active workspace');
select throws_ok($$select pg_temp.create_initial('{"modelId":"google/test","creditSource":"workspace","creditWsId":null,"thinkingMode":"unknown"}')$$,'22023','chat_invalid_initial_ai_settings','invalid thinking mode fails before writes');
select throws_ok($$select pg_temp.create_initial('{"modelId":"google/test","creditSource":"workspace","thinkingMode":"fast"}')$$,'22023','chat_invalid_initial_ai_settings','missing nullable field is not defaulted');
select throws_ok($$select pg_temp.create_initial('{"modelId":"google/test","creditSource":"workspace","creditWsId":null,"thinkingMode":"fast"}','channel')$$,'22023','chat_invalid_initial_ai_settings','initial tuple is AI-only');
select is((select count(*) from private.chat_conversations),(select n from before_invalid),'rejected tuples leave no conversation/settings orphan');
create function pg_temp.reject_initial_audit() returns trigger language plpgsql as $$
begin
 if new.ws_id='b6277000-0000-4000-8000-000000000011' then
  raise exception 'synthetic_initial_audit_failure' using errcode='P0001';
 end if;
 return new;
end;
$$;
create trigger initial_fixture_audit_failure before insert on private.chat_audit_events
 for each row execute function pg_temp.reject_initial_audit();
select throws_ok($$select pg_temp.create_initial('{"modelId":"google/test","creditSource":"workspace","creditWsId":null,"thinkingMode":"fast"}')$$,'P0001','synthetic_initial_audit_failure','failure after settings insertion rolls back whole creation');
drop trigger initial_fixture_audit_failure on private.chat_audit_events;
select is((select count(*) from private.chat_conversations),(select n from before_invalid),'late transaction failure leaves no conversation');
select is((select count(*)::integer from private.chat_conversation_ai_settings a join private.chat_conversations c on c.id=a.conversation_id where c.ws_id='b6277000-0000-4000-8000-000000000011'),5,'late transaction failure leaves no additional settings row');
update public.workspace_default_permissions set enabled=false where ws_id='b6277000-0000-4000-8000-000000000011' and permission='create_chat' and member_type='MEMBER';
select throws_ok($$select pg_temp.create_initial(null)$$,'42501','chat_permission_required:create_chat','initialization does not weaken create admission');
select ok(not has_function_privilege('authenticated','private.chat_create_conversation(uuid,uuid,jsonb)','execute'),'authenticated direct RPC remains revoked');
select ok(not has_function_privilege('anon','private.chat_create_conversation(uuid,uuid,jsonb)','execute'),'anonymous direct RPC remains revoked');
select ok(has_function_privilege('service_role','private.chat_create_conversation(uuid,uuid,jsonb)','execute'),'service-only RPC access remains');
select ok((select prosecdef and proconfig @> array['search_path=private, public, pg_temp'] from pg_proc where oid='private.chat_create_conversation(uuid,uuid,jsonb)'::regprocedure),'security definer and fixed search path retained');
select * from finish();
rollback;
