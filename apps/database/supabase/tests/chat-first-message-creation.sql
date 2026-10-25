begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.users(id) values
 ('a6742000-0000-4000-8000-000000000001'),
 ('a6742000-0000-4000-8000-000000000002'),
 ('a6742000-0000-4000-8000-000000000003');
insert into public.workspaces(id,name,creator_id) values
 ('a6742000-0000-4000-8000-000000000011','First message fixture','a6742000-0000-4000-8000-000000000001'),
 ('a6742000-0000-4000-8000-000000000012','Other first message fixture','a6742000-0000-4000-8000-000000000001');
insert into public.workspace_members(ws_id,user_id,type)
select w, u, 'MEMBER'::public.workspace_member_type
from unnest(array['a6742000-0000-4000-8000-000000000011'::uuid,'a6742000-0000-4000-8000-000000000012']) w,
 unnest(array['a6742000-0000-4000-8000-000000000002'::uuid,'a6742000-0000-4000-8000-000000000003']) u;
insert into public.workspace_default_permissions(ws_id,permission,member_type,enabled)
select w,p,'MEMBER',true
from unnest(array['a6742000-0000-4000-8000-000000000011'::uuid,'a6742000-0000-4000-8000-000000000012']) w,
 unnest(array['view_chat'::public.workspace_role_permission,'create_chat'::public.workspace_role_permission]) p
on conflict(ws_id,permission,member_type) do update set enabled=true;

create function pg_temp.first_input(
 p_chat uuid default 'a6742000-0000-4000-8000-000000000021',
 p_key uuid default 'a6742000-0000-4000-8000-000000000031'
) returns jsonb language sql as $$
 select jsonb_build_object('id',p_chat,'creationRequestId',p_key,'type','ai',
 'title','First message','modelId','google/test','initialAiSettings',
 jsonb_build_object('modelId','google/test','creditSource','workspace','creditWsId',null,'thinkingMode','fast'))
$$;
create function pg_temp.first_send(
 p_input jsonb default pg_temp.first_input(),
 p_actor uuid default 'a6742000-0000-4000-8000-000000000002',
 p_ws uuid default 'a6742000-0000-4000-8000-000000000011',
 p_content text default 'Original first message'
) returns jsonb language sql as $$
 select private.chat_create_ai_first_message(p_ws,p_actor,p_input,p_content)
$$;
create temporary table first_receipts(kind text primary key, payload jsonb);
insert into first_receipts values ('new',pg_temp.first_send()),('duplicate',pg_temp.first_send());
select is((select payload->'creationReceipt' from first_receipts where kind='new'),
 (select payload->'creationReceipt' from first_receipts where kind='duplicate'),'duplicate creation receipt is identical');
select is((select payload->'message'->>'id' from first_receipts where kind='new'),
 (select payload->'message'->>'id' from first_receipts where kind='duplicate'),'duplicate user receipt is identical');
select is((select payload->>'replayed' from first_receipts where kind='duplicate'),'true','duplicate message is replayed');
select is((select count(*)::int from private.chat_conversations where id='a6742000-0000-4000-8000-000000000021'),1,'one client-ID conversation');
select is((select count(*)::int from private.chat_messages where conversation_id='a6742000-0000-4000-8000-000000000021'),1,'one user message');
select is((select count(*)::int from private.chat_conversation_members where conversation_id='a6742000-0000-4000-8000-000000000021'),1,'one owner');
select is((select count(*)::int from private.chat_audit_events where conversation_id='a6742000-0000-4000-8000-000000000021' and event_type='conversation.created'),1,'one creation audit');
select is((select metadata->>'clientRequestId' from private.chat_messages where conversation_id='a6742000-0000-4000-8000-000000000021'),
 'a6742000-0000-4000-8000-000000000031','original key owns the first user message');
select throws_ok($$select pg_temp.first_send(pg_temp.first_input(),'a6742000-0000-4000-8000-000000000003')$$,
 '42501','chat_creation_forbidden','foreign actor cannot adopt the ID');
select throws_ok($$select pg_temp.first_send(pg_temp.first_input(),'a6742000-0000-4000-8000-000000000002','a6742000-0000-4000-8000-000000000012')$$,
 '42501','chat_creation_forbidden','other workspace cannot adopt the ID');
select throws_ok($$select pg_temp.first_send(jsonb_set(pg_temp.first_input(),'{type}','"channel"'))$$,
 '22023','chat_invalid_first_message','first-message creation is AI-only');
select throws_ok($$select pg_temp.first_send(jsonb_set(pg_temp.first_input(),'{initialAiSettings,thinkingMode}','"thinking"'))$$,
 '22023','chat_creation_payload_mismatch','settings mismatch is rejected');
select throws_ok($$select pg_temp.first_send(pg_temp.first_input('a6742000-0000-4000-8000-000000000022'))$$,
 '22023','chat_creation_payload_mismatch','same key cannot create another ID');
select throws_ok($$select pg_temp.first_send(pg_temp.first_input('a6742000-0000-4000-8000-000000000021','a6742000-0000-4000-8000-000000000032'))$$,
 '22023','chat_creation_payload_mismatch','same ID cannot adopt another key');
select throws_ok($$select pg_temp.first_send(pg_temp.first_input(),'a6742000-0000-4000-8000-000000000002','a6742000-0000-4000-8000-000000000011','Changed text')$$,
 '22023','chat_idempotency_payload_mismatch','same key cannot write different text');
select is((select count(*)::int from private.chat_messages where conversation_id='a6742000-0000-4000-8000-000000000021'),1,'denials add no message');
update private.chat_conversation_ai_settings set thinking_mode='thinking'
 where conversation_id='a6742000-0000-4000-8000-000000000021';
select is(pg_temp.first_send()->'creationReceipt',
 (select payload->'creationReceipt' from first_receipts where kind='new'),'mutable settings edits preserve the initial receipt');
select is((select thinking_mode from private.chat_conversation_ai_settings where conversation_id='a6742000-0000-4000-8000-000000000021'),'thinking','replay does not overwrite later settings');
create function pg_temp.fail_first_message() returns trigger language plpgsql as $$
begin
 if new.conversation_id='a6742000-0000-4000-8000-000000000024' then
  raise exception 'synthetic_first_message_failure' using errcode='P0001';
 end if;
 return new;
end $$;
create trigger first_message_failure before insert on private.chat_messages
 for each row execute function pg_temp.fail_first_message();
select throws_ok($$select pg_temp.first_send(pg_temp.first_input('a6742000-0000-4000-8000-000000000024','a6742000-0000-4000-8000-000000000034'))$$,
 'P0001','synthetic_first_message_failure','message failure rolls back creation');
select is((select count(*)::int from private.chat_conversations where id='a6742000-0000-4000-8000-000000000024'),0,'no conversation orphan');
select is((select count(*)::int from private.chat_creation_requests where conversation_id='a6742000-0000-4000-8000-000000000024'),0,'no creation-key orphan');
delete from private.chat_conversations where id='a6742000-0000-4000-8000-000000000021';
select is((select count(*)::int from private.chat_creation_requests where conversation_id='a6742000-0000-4000-8000-000000000021'),1,'minimal creation tombstone survives conversation deletion');
select throws_ok($$select pg_temp.first_send()$$,'42501','chat_creation_unavailable','old creation does not resurrect a deleted chat');
select ok(not has_table_privilege('authenticated','private.chat_creation_requests','select'),'browser cannot read creation receipts');
select ok(not has_table_privilege('service_role','private.chat_creation_requests','update'),'service writes cannot mutate creation snapshots');
select ok(not has_function_privilege('authenticated','private.chat_create_ai_first_message(uuid,uuid,jsonb,text)','execute'),'browser cannot execute first-message RPC');
select ok(not has_function_privilege('anon','private.chat_create_ai_first_message(uuid,uuid,jsonb,text)','execute'),'anonymous cannot execute first-message RPC');
select ok(has_function_privilege('service_role','private.chat_create_ai_first_message(uuid,uuid,jsonb,text)','execute'),'service role can execute first-message RPC');
select * from finish();
rollback;
