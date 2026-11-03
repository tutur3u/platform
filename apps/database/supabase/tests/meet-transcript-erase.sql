begin;
create extension if not exists pgtap;
select no_plan();
select has_table('private','meet_erasure_plans','meet_erasure_plans exists');
select has_table('private','meet_erasure_issuances','meet_erasure_issuances exists');
select has_table('private','meet_content_apply_leases','meet_content_apply_leases exists');
select has_function('private','lock_meet_hold_barrier',array['uuid','boolean']);
select has_function('private','decide_meet_erasure_finality',array['uuid','uuid','uuid']);
select has_function('private','plan_meet_subject_erasure',array['uuid','uuid','uuid','uuid']);
select ok(not has_table_privilege('authenticated','private.meet_erasure_plans','SELECT'),'plans are private');
select ok(not has_table_privilege('service_role','private.meet_erasure_plans','UPDATE'),'plans are immutable to service role');


insert into public.users(id) values ('00000000-0000-4000-8000-000000000010');
insert into public.workspaces(id) values ('00000000-0000-4000-8000-000000000001');
insert into public.workspace_members(ws_id,user_id) values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010');
insert into public.workspace_meetings(id,ws_id,creator_id,name) values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','Fixture');
insert into private.meet_content_hold_scopes(ws_id,registry_ready) values ('00000000-0000-4000-8000-000000000001',true);
insert into public.meet_ai_sessions(id,meeting_id,user_id,ended_at,notes) values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010',now(),'{"secret":"notes"}');
insert into public.meet_ai_chunks(id,session_id,sequence,start_seconds,duration_seconds,status,transcript,usage) values
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003',0,0,8,'completed',E'erase me\nkeep me',
 '{"inputTokens":42,"segments":[{"speaker":{"accountId":"00000000-0000-4000-8000-000000000010","displayName":"Fixture"},"kind":"microphone","transcript":"erase me","startSeconds":0},{"speaker":null,"kind":"microphone","transcript":"keep me","startSeconds":2}]}');
create function pg_temp.execute_fixture(k uuid,why text default 'participant_request',expected_digest bytea default null) returns jsonb language plpgsql as $$
declare t jsonb; g bigint; plan jsonb; exp timestamptz;
begin
 select generation into g from private.lock_meet_content_fence('00000000-0000-4000-8000-000000000002');
 t:=private.meet_erasure_target('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010',null,null);
 insert into private.meet_erasure_issuances(operation_key,ws_id,meeting_id,actor_user_id,actor_kind,expires_at)
 values(k,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','subject',clock_timestamp()+interval '1 hour') on conflict do nothing;
 select expires_at into exp from private.meet_erasure_issuances where operation_key=k;
 plan:=jsonb_build_object('v',1,'kind','meeting_erase','ws_id','00000000-0000-4000-8000-000000000001','meeting_id','00000000-0000-4000-8000-000000000002','operation_key',k,
 'actor_role','subject','subject',jsonb_build_object('tag',repeat('ab',32),'key_version',1),'generation_target',g+1,'doc_generation_target',null,
 'transcript',jsonb_build_object('chunks',t->'chunks','sessions',t->'sessions'),'document',null,'playground',null,'label_removal',null,'recording',null,'stores','["S-T","S-L","S-X:inventory"]'::jsonb);
 return private.erase_meet_transcript_contributions('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000010',
 decode(repeat('ab',32),'hex'),1::smallint,null,null,why,null,'none',null,false,k,sha256(convert_to(why,'UTF8')),g,coalesce(expected_digest,decode(t->>'digest','hex')),exp,true,plan,sha256(convert_to(plan::text,'UTF8')),1,decode('ab','hex'),'none',false);
end $$;
select is(private.count_meet_subject_segments('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010'),1,'self counts only own verified line');
select ok(private.plan_meet_subject_erasure('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010')::text not like '%erase me%','plan contains no content');
select throws_ok($$select private.check_meet_erase_workspace(null)$$,'42501','MEET_ERASE_UNAVAILABLE','EC-first boundary fails closed');
select throws_ok($$select pg_temp.execute_fixture('00000000-0000-4000-8000-000000000020','invalid')$$,'23514',null,'late audit failure rolls back all P1');
select is((select transcript from public.meet_ai_chunks where id='00000000-0000-4000-8000-000000000004'),E'erase me\nkeep me','audit failure preserved transcript');
select is((select generation from private.meet_content_fences where meeting_id='00000000-0000-4000-8000-000000000002'),0::bigint,'audit failure preserved generation');
update public.meet_ai_chunks set usage=usage||'{"unclassified":"secret"}' where id='00000000-0000-4000-8000-000000000004';
select throws_ok($$select pg_temp.execute_fixture('00000000-0000-4000-8000-000000000020')$$,'P0001','MEET_ERASE_UNCLASSIFIED','unknown usage refuses whole transaction');
update public.meet_ai_chunks set usage=usage-'unclassified' where id='00000000-0000-4000-8000-000000000004';


savepoint held_request;
select private.begin_meet_hold_transition('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000041');
insert into private.meet_content_holds(id,ws_id,meeting_id) values('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
select private.finish_meet_hold_transition('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000041',1);
select is(private.defer_meet_subject_erasure('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010'),private.defer_meet_subject_erasure('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010'),'C5 retries reuse the on_hold request');
select is((select status from private.meet_erasure_requests),'on_hold','hold defers rather than declines');
select throws_ok($$select pg_temp.execute_fixture('00000000-0000-4000-8000-000000000021')$$,'55000','MEET_ERASE_LEGAL_HOLD','9b prevents P1 under a hold');
select is((select count(*) from private.meet_transcript_erasures),0::bigint,'hold refusal leaves no audit or content change');
rollback to held_request;
create temp table preview_digest as select decode(private.meet_erasure_target('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010',null,null)->>'digest','hex') value;
update public.meet_ai_chunks set transcript='changed with same count' where id='00000000-0000-4000-8000-000000000004';
select throws_ok($$select pg_temp.execute_fixture('00000000-0000-4000-8000-000000000021','participant_request',(select value from preview_digest))$$,'P0001','MEET_ERASE_STALE','same-count content change makes preview stale');
update public.meet_ai_chunks set transcript=E'erase me\nkeep me' where id='00000000-0000-4000-8000-000000000004';
savepoint bound;
insert into public.meet_ai_chunks(id,session_id,sequence,start_seconds,duration_seconds,status,transcript,usage)
select gen_random_uuid(),'00000000-0000-4000-8000-000000000003',n,0,8,'completed','fixture',jsonb_build_object('segments',
 (select jsonb_agg(jsonb_build_object('speaker',jsonb_build_object('accountId','00000000-0000-4000-8000-000000000010'),'transcript','fixture','kind','microphone','startSeconds',0)) from generate_series(1,case when n=42 then 32 else 48 end))) from generate_series(1,42) n;
select throws_ok($$select pg_temp.execute_fixture('00000000-0000-4000-8000-000000000021')$$,'P0001','MEET_ERASE_TOO_LARGE','2001 lines refuse with zero P1 changes');
select is((select count(*) from private.meet_transcript_erasures),0::bigint,'oversized operation writes no audit');
update public.meet_ai_chunks set usage=jsonb_set(usage,'{segments}',(usage->'segments')-31) where sequence=42;
select is(pg_temp.execute_fixture('00000000-0000-4000-8000-000000000021')->>'linesErased','2000','exact 2000-line bound commits atomically');
rollback to bound;
select is(pg_temp.execute_fixture('00000000-0000-4000-8000-000000000020')->>'state','in_progress','P1 committed');
select is((select transcript from public.meet_ai_chunks where id='00000000-0000-4000-8000-000000000004'),'keep me','surviving speech retained');
select is((select usage->'segments'->0 from public.meet_ai_chunks where id='00000000-0000-4000-8000-000000000004'),'{"erased":true}'::jsonb,'marker is content-free and index stable');
select is((select usage->>'inputTokens' from public.meet_ai_chunks where id='00000000-0000-4000-8000-000000000004'),'42','billing retained');
select ok((select notes is null from public.meet_ai_sessions where id='00000000-0000-4000-8000-000000000003'),'notes cleared');
select is(pg_temp.execute_fixture('00000000-0000-4000-8000-000000000020')->>'replayed','true','same-key retry returns receipt');
select throws_ok($$select pg_temp.execute_fixture('00000000-0000-4000-8000-000000000020','other')$$,'P0001','MEET_ERASE_KEY_CONFLICT','different payload conflicts');
select is(private.decide_meet_erasure_finality('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020')->>'state','in_progress','committed never reverts to unknown');
select throws_ok($$update private.meet_erasure_plans set ledger_seq=2$$,'55000','MEET_ERASE_IMMUTABLE','plan immutable');
select is((select count(*) from private.meet_erasure_completions),0::bigint,'P1 never claims all-store completion');
select is((select state from private.meet_erasure_store_progress where store='S-X:inventory'),'pending','inventory pending fail closed');

-- Real independent backends: shared destructive batches, exclusive transitions.
create extension if not exists dblink;
select dblink_connect('v10a','dbname='||current_database()||' user='||current_user);
select dblink_connect('v10b','dbname='||current_database()||' user='||current_user);
select dblink_exec('v10a',$$insert into public.workspaces(id) values('10000000-0000-4000-8000-000000000001'); insert into private.meet_content_hold_scopes(ws_id,registry_ready) values('10000000-0000-4000-8000-000000000001',true)$$);
select dblink_exec('v10a','begin');
select * from dblink('v10a',$$select (private.lock_meet_hold_barrier('10000000-0000-4000-8000-000000000001',false)).ws_id$$) as t(id uuid);
select lives_ok($q$select * from dblink('v10b',$$select (private.lock_meet_hold_barrier('10000000-0000-4000-8000-000000000001',false)).ws_id$$) as t(id uuid)$q$,'shared batches coexist');
select throws_ok($q$select * from dblink('v10b',$$select (private.lock_meet_hold_barrier('10000000-0000-4000-8000-000000000001',true)).ws_id$$) as t(id uuid)$q$,'55P03',null,'exclusive hold transition waits for shared batch');
select dblink_exec('v10a','rollback');
select dblink_exec('v10a','begin');
select * from dblink('v10a',$$select (private.lock_meet_hold_barrier('10000000-0000-4000-8000-000000000001',true)).ws_id$$) as t(id uuid);
select throws_ok($q$select * from dblink('v10b',$$select (private.lock_meet_hold_barrier('10000000-0000-4000-8000-000000000001',false)).ws_id$$) as t(id uuid)$q$,'55P03',null,'shared batch waits for exclusive hold transition');
select dblink_exec('v10a','rollback');
select dblink_exec('v10a',$$delete from private.meet_content_hold_scopes where ws_id='10000000-0000-4000-8000-000000000001'; delete from public.workspaces where id='10000000-0000-4000-8000-000000000001'$$);
select dblink_disconnect('v10a');
select dblink_disconnect('v10b');
select throws_ok($$select private.admit_meet_erase_apply('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','S-X:inventory',gen_random_uuid(),clock_timestamp()+interval '1 minute')$$,'P0001','MEET_ERASE_EXPIRED','apply lease cannot exceed 30 seconds');
select lives_ok($$select private.admit_meet_erase_apply('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','S-X:inventory',gen_random_uuid(),clock_timestamp()+interval '10 seconds')$$,'apply admitted as a durable lease row');
select private.begin_meet_hold_transition('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000040');
select throws_ok($$select private.check_meet_destructive_batch('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')$$,'55000','MEET_ERASE_REGISTRY_UNREADY','pending transition blocks new destruction');
update private.meet_content_apply_leases set created_at=clock_timestamp()-interval '20 seconds',expires_at=clock_timestamp()-interval '10 seconds';
select throws_ok($$select private.finish_meet_hold_transition('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000040',1)$$,'P0001','MEET_ERASE_RECONCILIATION_REQUIRED','unsettled apply blocks projection even after expiry');
select * from finish();
rollback;
