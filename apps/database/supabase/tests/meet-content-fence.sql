begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
select has_table('private','meet_content_fences','durable meeting fence exists');
select has_column('private','meeting_documents','installed_doc_generation','saved copy has installed generation');
insert into auth.users(id) values(pg_temp.fid(88701));
insert into public.users(id) values(pg_temp.fid(88701)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
 (pg_temp.fid(88702),'Fence fixture',false,pg_temp.fid(88701));
insert into public.workspace_meetings(id,ws_id,creator_id,name) values
 (pg_temp.fid(88703),pg_temp.fid(88702),pg_temp.fid(88701),'Fence fixture');
select lives_ok($$select public.start_meet_ai_session(pg_temp.fid(88703),pg_temp.fid(88701),pg_temp.fid(88704))$$,'fenced start');
select is((select generation from private.meet_content_fences where meeting_id=pg_temp.fid(88703)),0::bigint,'start lazily creates generation zero');
insert into public.meet_ai_sessions(id,meeting_id,user_id,protocol,billing_ws_id,billing_host_id)
 values(pg_temp.fid(88710),pg_temp.fid(88703),pg_temp.fid(88701),'self_v1',pg_temp.fid(88702),pg_temp.fid(88701));
select throws_ok($$select public.reserve_meet_ai_chunk(pg_temp.fid(88711),pg_temp.fid(88710),0,0::numeric,8::numeric)$$,
 '55000','Legacy reservation cannot reserve self-capture chunks','merged reservation refuses self_v1');
select is((select count(*) from public.meet_ai_chunks where session_id=pg_temp.fid(88710)),0::bigint,'self reservation refusal writes no chunk');
select lives_ok($$select public.reserve_meet_ai_chunk(pg_temp.fid(88705),pg_temp.fid(88704),0,0::numeric,8::numeric)$$,'legacy reservation signature remains callable');
select is((select erasure_generation from public.meet_ai_chunks where id=pg_temp.fid(88705)),0::bigint,'reservation captures generation');
create temp table attempt as select attempt_id from public.meet_ai_chunks where id=pg_temp.fid(88705);
update private.meet_content_fences set generation=1 where meeting_id=pg_temp.fid(88703);
select ok(has_table_privilege('service_role','private.meet_content_fences','SELECT'),'service can read the generation');
select ok(not has_table_privilege('service_role','private.meet_content_fences','INSERT'),'service cannot insert fences');
select ok(not has_table_privilege('service_role','private.meet_content_fences','UPDATE'),'service cannot update fences');
select ok(not has_table_privilege('service_role','private.meet_content_fences','DELETE'),'service cannot delete fences');
select ok(not has_table_privilege('service_role','private.meet_content_fences','TRUNCATE'),'service cannot truncate fences');
grant usage on schema extensions to service_role;
set local role service_role;
select throws_ok($$delete from private.meet_content_fences$$,'42501','permission denied for table meet_content_fences','service cannot delete the advanced fence');
select throws_ok($$update private.meet_content_fences set generation=0,restore_hold=false,doc_hold=false$$,'42501','permission denied for table meet_content_fences','service cannot rewind the advanced fence');
select is(public.complete_meet_ai_chunk('00000000-0000-4000-8000-000000088705',
 (select attempt_id from public.meet_ai_chunks where id='00000000-0000-4000-8000-000000088705'),
 '{"transcript":"stale","usage":{},"cost_usd":1}'::jsonb),false,'service stale completion stays refused after direct mutation attempts');
reset role;
select is((select generation from private.meet_content_fences where meeting_id=pg_temp.fid(88703)),1::bigint,'permission refusals preserve erase generation');
select throws_ok($$select public.reserve_meet_ai_chunk(pg_temp.fid(88709),pg_temp.fid(88999),0,0::numeric,8::numeric)$$,'P0001','Session not found','missing session preserves the reservation conflict contract');

select is(public.complete_meet_ai_chunk(pg_temp.fid(88705),(select attempt_id from attempt),'{"transcript":"stale","usage":{},"cost_usd":1}'::jsonb),false,'late completion refused');
select is((select status from public.meet_ai_chunks where id=pg_temp.fid(88705)),'failed','stale attempt failed');
select is((select transcript from public.meet_ai_chunks where id=pg_temp.fid(88705)),null::text,'no stale transcript persisted');
select lives_ok($$select public.reserve_meet_ai_chunk(pg_temp.fid(88706),pg_temp.fid(88704),1,8::numeric,8::numeric)$$,'new reservation uses current generation');
select is(public.complete_meet_ai_chunk(pg_temp.fid(88706),gen_random_uuid(),'{"transcript":"wrong"}'),false,'wrong attempt cannot persist');
select is(public.complete_meet_ai_chunk(pg_temp.fid(88706),(select attempt_id from public.meet_ai_chunks where id=pg_temp.fid(88706)),'{"transcript":"fresh","usage":{},"cost_usd":0}'),true,'current chunk completes');
select is(public.complete_meet_ai_chunk(pg_temp.fid(88706),(select attempt_id from public.meet_ai_chunks where id=pg_temp.fid(88706)),'{"transcript":"different"}'),true,'persistence retry is idempotent');
select is((select transcript from public.meet_ai_chunks where id=pg_temp.fid(88706)),'fresh','retry never replaces completed output');
select is(public.claim_meet_ai_notes(pg_temp.fid(88704),0,now()),false,'stale snapshot cannot claim notes');
select is(public.claim_meet_ai_notes(pg_temp.fid(88704),1,now()),true,'current generation can claim');
update private.meet_content_fences set generation=2 where meeting_id=pg_temp.fid(88703);
select is(public.save_meet_ai_notes(pg_temp.fid(88704),1,now(),'{"notes":{"text":"stale"}}'),false,'generation change rejects notes save');
select is((select notes_status from public.meet_ai_sessions where id=pg_temp.fid(88704)),'pending','stale notes run returns to pending');
select is((select notes from public.meet_ai_sessions where id=pg_temp.fid(88704)),null::jsonb,'stale notes never saved');
select is(public.claim_meet_ai_notes(pg_temp.fid(88704),2,now()),true,'fresh snapshot claim');
select is(public.save_meet_ai_notes(pg_temp.fid(88704),2,now(),'{"notes":{"text":"fresh"},"notes_usage":{},"notes_cost_usd":0}'),true,'fresh notes save');
select is((private.read_meeting_document(pg_temp.fid(88703))->>'docGeneration')::bigint,0::bigint,'legacy reader returns generation plus original keys');
create temp table doc as select document_id from private.meeting_documents where meeting_id=pg_temp.fid(88703);
select lives_ok($$select private.checkpoint_meeting_document(pg_temp.fid(88703),(select document_id from doc),pg_temp.fid(88701),'[]','{"type":"doc","content":[]}',repeat('a',64),1)$$,'seven-argument checkpoint works at generation zero');
update private.meet_content_fences set doc_generation=1 where meeting_id=pg_temp.fid(88703);
select throws_ok($$select private.read_meeting_document(pg_temp.fid(88703))$$,'40001','Document erasing','cold reader refuses old installed copy');
select throws_ok($$select private.checkpoint_meeting_document(pg_temp.fid(88703),(select document_id from doc),pg_temp.fid(88701),'[]','{"type":"doc","content":[]}',repeat('b',64),2)$$,'40001','Document erasing','legacy checkpoint refused after erase');
update private.meeting_documents set installed_doc_generation=1 where meeting_id=pg_temp.fid(88703);
select is((private.read_meeting_document(pg_temp.fid(88703))->>'docGeneration')::bigint,1::bigint,'V8 reader returns the installed nonzero generation');
select is(private.checkpoint_meeting_document(pg_temp.fid(88703),(select document_id from doc),pg_temp.fid(88701),'[1]','{"type":"doc","content":[]}',repeat('b',64),2,1),2,'V8 eight-argument checkpoint accepts current generation');
select throws_ok($$select private.checkpoint_meeting_document(pg_temp.fid(88703),(select document_id from doc),pg_temp.fid(88701),'[2]','{"type":"doc","content":[]}',repeat('c',64),3,0)$$,'40001','Document erasing','V8 eight-argument checkpoint refuses stale generation');
select is(private.read_meeting_document(pg_temp.fid(88703))->'state','[1]'::jsonb,'V8 reader retains current checkpoint after stale refusal');

update private.meet_content_fences set doc_hold=true where meeting_id=pg_temp.fid(88703);
select throws_ok($$select private.read_meeting_document(pg_temp.fid(88703))$$,'40001','Document erasing','document hold blocks read');
update private.meet_content_fences set doc_hold=false,restore_hold=true where meeting_id=pg_temp.fid(88703);
select throws_ok($$select private.checkpoint_meeting_document(pg_temp.fid(88703),(select document_id from doc),pg_temp.fid(88701),'[]','{"type":"doc","content":[]}',repeat('b',64),2,1)$$,'40001','Document erasing','restore hold blocks checkpoint');
select ok(not has_table_privilege('authenticated','private.meet_content_fences','SELECT'),'no client fence reads');
select ok(not has_function_privilege('anon','public.start_meet_ai_session(uuid,uuid,uuid)','EXECUTE'),'no anonymous RPC access');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.proname in ('lock_meet_content_fence','start_meet_ai_session','reserve_meet_ai_chunk','complete_meet_ai_chunk','claim_meet_ai_notes','save_meet_ai_notes','read_meeting_document','checkpoint_meeting_document')
 and (not p.prosecdef or not p.proconfig @> array['search_path=pg_catalog, pg_temp','lock_timeout=2s','statement_timeout=10s'])), 'all RPCs have pinned definer settings and bounded timeouts');
select ok((select relrowsecurity from pg_class where oid='private.meet_content_fences'::regclass),'fence RLS enabled');
select ok(position('FOR UPDATE' in upper(pg_get_functiondef('private.lock_meet_content_fence(uuid)'::regprocedure)))>0,'shared lock helper uses FOR UPDATE');
select ok(not exists(select 1 from pg_proc where proname in ('reserve_meet_ai_chunk','checkpoint_meeting_document','read_meeting_document','complete_meet_ai_chunk','claim_meet_ai_notes','save_meet_ai_notes') and not (proname='checkpoint_meeting_document' and pronargs=7) and position('lock_meet_content_fence' in prosrc)=0),'every content RPC takes fence before content locks');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.proname in ('lock_meet_content_fence','start_meet_ai_session','reserve_meet_ai_chunk','complete_meet_ai_chunk','claim_meet_ai_notes','save_meet_ai_notes','read_meeting_document','checkpoint_meeting_document')
 and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE') or not has_function_privilege('service_role',p.oid,'EXECUTE'))), 'every fenced RPC is service-only');
select ok(not exists(select 1 from pg_proc where proname in
 ('reserve_meet_ai_chunk','complete_meet_ai_chunk','claim_meet_ai_notes','save_meet_ai_notes','checkpoint_meeting_document','read_meeting_document')
 and position('for update' in lower(prosrc))>0
 and position('lock_meet_content_fence' in prosrc)>position('for update' in lower(prosrc))), 'lock-order query: fence precedes every content FOR UPDATE');
select * from finish();
rollback;
