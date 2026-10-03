begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create extension if not exists dblink with schema extensions;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000009701');
-- The auth.users provisioning trigger may already create this public row.
insert into public.users(id) values ('00000000-0000-4000-8000-000000009701') on conflict (id) do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
 ('00000000-0000-4000-8000-000000009711','Isolated color operation',false,'00000000-0000-4000-8000-000000009701');
insert into public.calendar_auth_tokens(id,user_id,ws_id,provider,access_token,refresh_token,is_active) values
 ('00000000-0000-4000-8000-000000009721','00000000-0000-4000-8000-000000009701',
  '00000000-0000-4000-8000-000000009711','google','disposable-fixture','disposable-fixture',true);
insert into public.calendar_connections(id,ws_id,provider,calendar_id,calendar_name,auth_token_id,is_enabled) values
 ('00000000-0000-4000-8000-000000009731','00000000-0000-4000-8000-000000009711',
  'google','fixture-calendar','Fixture','00000000-0000-4000-8000-000000009721',true);
insert into public.workspace_calendar_events(id,ws_id,provider,google_calendar_id,google_event_id,
 external_calendar_id,external_event_id,title,start_at,end_at,color,scheduling_metadata) values
 ('00000000-0000-4000-8000-000000009741','00000000-0000-4000-8000-000000009711',
 'google','fixture-calendar','fixture-event','fixture-calendar','fixture-event','Fixture',
 '2026-10-01T10:00:00Z','2026-10-01T11:00:00Z','BLUE','{"custom":{"keep":true}}');
create function public.fixture_color_input(generation bigint default 1, op text default '00000000-0000-4000-8000-000000009751')
returns jsonb language sql as $$
 select jsonb_build_object('id',op,'generation',generation::text,'requestHash',repeat('a',64),
  'identity',jsonb_build_object('wsId','00000000-0000-4000-8000-000000009711',
   'eventId','00000000-0000-4000-8000-000000009741','connectionId','00000000-0000-4000-8000-000000009731',
   'authTokenId','00000000-0000-4000-8000-000000009721','calendarId','fixture-calendar','providerEventId','fixture-event'),
  'intent',jsonb_build_object('connectionId','00000000-0000-4000-8000-000000009731','kind','event','id','11'),
  'prepared',jsonb_build_object('baseETag','opaque:base','eventLabelVersion',0,'patch',jsonb_build_object(
   'colorId','11','extendedProperties',jsonb_build_object('private',jsonb_build_object('tuturuuuColorOperation',op)))));
$$;
create function public.fixture_color_call(action text, payload jsonb default public.fixture_color_input())
returns jsonb language sql as $$
 select public.calendar_google_color_operation(action,'00000000-0000-4000-8000-000000009711',
 '00000000-0000-4000-8000-000000009741','00000000-0000-4000-8000-000000009701',payload);
$$;


create function public.fixture_mutation_input(expected bigint default 0, action text default 'patch') returns jsonb language sql as $$
 select jsonb_build_object('id','00000000-0000-4000-8000-000000009761','expectedGeneration',expected::text,
 'requestHash',repeat('b',64),'prepared',jsonb_build_object('binding',jsonb_build_object(
 'operationId','00000000-0000-4000-8000-000000009761','generation',(expected+1)::text,
 'identity',public.fixture_color_input()->'identity','action',action,'baseETag','base-original'),
 'journal',jsonb_build_object('version',1,'ciphertext','encrypted-fixture')));
$$;
create function public.fixture_mutation_call(action text,payload jsonb) returns jsonb language sql as $$
 select public.calendar_google_mutation_operation(action,'00000000-0000-4000-8000-000000009711',
 '00000000-0000-4000-8000-000000009741','00000000-0000-4000-8000-000000009701',payload);
$$;
create function public.fixture_competing_admit() returns text language plpgsql as $$
 begin perform public.fixture_mutation_call('admit',public.fixture_mutation_input()); return 'unexpected-success';
 exception when others then return sqlstate; end;
$$;
insert into public.workspace_habits(id,ws_id,name) values('00000000-0000-4000-8000-000000009771',
 '00000000-0000-4000-8000-000000009711','Isolated habit');
insert into public.habit_calendar_events(habit_id,event_id,occurrence_date) values(
 '00000000-0000-4000-8000-000000009771','00000000-0000-4000-8000-000000009741','2026-10-02');
insert into public.workspace_habits(id,ws_id,name) values('00000000-0000-4000-8000-000000009772',
 '00000000-0000-4000-8000-000000009711','Second linked habit');
insert into public.habit_calendar_events(habit_id,event_id,occurrence_date) values(
 '00000000-0000-4000-8000-000000009772','00000000-0000-4000-8000-000000009741','2026-10-03');
commit;
-- The fixture is committed because the second independent SQL connection must
-- see it. The owning isolated lifecycle destroys this entire disposable stack.
-- Independent backend validates actual lock ordering. Local trust-auth stacks
-- run this fixture as their disposable DB bootstrap role.
select dblink_connect('competitor','dbname=postgres user=postgres password=postgres host=127.0.0.1');
begin;
select is(public.fixture_color_call('reserve',public.fixture_color_input(0))->>'generation','1','color admission holds first generation');
select is(public.fixture_mutation_call('inspect',jsonb_build_object('identity',public.fixture_color_input()->'identity'))->'operation'->'intent'->>'kind',
 'event','common inspection reports color operation kind for recovery dispatch');
select dblink_send_query('competitor','select public.fixture_competing_admit()');
-- Assert actual backend lock contention, not a timing-only in-process mock.
do $$ declare deadline timestamptz := clock_timestamp()+interval '3 seconds'; begin
 loop
  exit when exists(select 1 from pg_stat_activity where query='select public.fixture_competing_admit()' and wait_event_type='Lock');
  if clock_timestamp()>deadline then raise exception 'Second session did not block on admission'; end if;
  perform pg_sleep(0.01);
 end loop;
end $$;
select is(dblink_is_busy('competitor'),1,'second SQL session is blocked until first generation commits');
commit;
select is(result,'40001','competing session rejects stale admission after lock releases')
 from dblink_get_result('competitor') as result(result text);
select dblink_disconnect('competitor');
begin;
select is(public.fixture_color_call('cancel')->>'phase','canceled','unsent color admission canceled');
select is(public.fixture_mutation_call('admit',public.fixture_mutation_input(1))->>'phase','prepared','encrypted preparation is atomically admitted');
select is((select intent->>'kind' from private.calendar_google_color_operations where ws_id='00000000-0000-4000-8000-000000009711' and event_id='00000000-0000-4000-8000-000000009741'),'mutation','generic operations share existing import/color ledger');
select ok(not has_function_privilege('authenticated','public.calendar_google_mutation_operation(text,uuid,uuid,uuid,jsonb)','EXECUTE'),'customer clients cannot admit or forge mutation snapshots');
select throws_ok($$select public.fixture_mutation_call('admit',public.fixture_mutation_input(1)||'{"id":"00000000-0000-4000-8000-000000009762"}')$$,
 '40001',null,'no successor can replace a pending encrypted operation');
update public.workspace_calendar_events set scheduling_metadata=scheduling_metadata||'{"new_local_metadata":{"preserve":true}}'
 where id='00000000-0000-4000-8000-000000009741';
select is(public.fixture_mutation_call('dispatch','{"id":"00000000-0000-4000-8000-000000009761","generation":"2"}')->>'phase','dispatched','dispatch recorded before external effect');
select throws_ok($$select public.fixture_color_call('reserve',public.fixture_color_input(2,'00000000-0000-4000-8000-000000009762'))$$,
 '40001',null,'color admission cannot bypass dispatched generic mutation');
select throws_ok($$select public.fixture_mutation_call('cancel','{"id":"00000000-0000-4000-8000-000000009761","generation":"2"}')$$,
 '40001',null,'sent mutation cannot be canceled or lease-unlocked');
select is(public.fixture_mutation_call('finalize',jsonb_build_object('id','00000000-0000-4000-8000-000000009761',
 'generation','2','snapshot',jsonb_build_object('deleted',false,'outcome','applied','etag','provider-next',
 'operationMarker','00000000-0000-4000-8000-000000009761','compatibilityColor','RED',
 'metadata','{"google_color":{"version":1,"color_id":"11"}}'::jsonb,
 'projection','{"title":"ciphertext-title","description":"ciphertext-description","location":"ciphertext-location","is_encrypted":true,"start_at":"2026-10-01T12:00:00Z","end_at":"2026-10-01T13:00:00Z","locked":false}'::jsonb)))->>'phase','applied','authoritative encrypted projection commits atomically');
select is((select scheduling_metadata->'new_local_metadata'->>'preserve' from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000009741'),'true','latest unrelated metadata survives generic finalization');
select is((select title from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000009741'),'ciphertext-title','only encrypted projection reaches local event');
select is(public.fixture_mutation_call('admit',public.fixture_mutation_input(2,'delete'))->>'generation','3','conditional deletion retains next generation');
select is(public.fixture_mutation_call('dispatch','{"id":"00000000-0000-4000-8000-000000009761","generation":"3"}')->>'phase','dispatched','delete dispatch persisted');
select is(public.fixture_mutation_call('finalize','{"id":"00000000-0000-4000-8000-000000009761","generation":"3","snapshot":{"deleted":true,"outcome":"applied"}}')->>'phase','applied','confirmed tombstone finalizes atomically');
select is((select count(*) from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000009741'),0::bigint,'local event deleted');
select is((select count(*) from public.habit_calendar_events where event_id='00000000-0000-4000-8000-000000009741'),0::bigint,'habit linkage cascades in same transaction');
select is((select count(*) from public.habit_skipped_occurrences where habit_id='00000000-0000-4000-8000-000000009771' and occurrence_date='2026-10-02' and revoked_at is null),1::bigint,'habit skip persists before event deletion');
select is((select count(*) from public.habit_skipped_occurrences where habit_id in ('00000000-0000-4000-8000-000000009771','00000000-0000-4000-8000-000000009772') and revoked_at is null),2::bigint,'all linked habits skipped before cascade');
select is((select completion->>'skippedHabitId' from private.calendar_google_color_operations where ws_id='00000000-0000-4000-8000-000000009711' and event_id='00000000-0000-4000-8000-000000009741'),'00000000-0000-4000-8000-000000009771','tombstone preserves deletion summary after links disappear');
select is(public.fixture_mutation_call('read','{"id":"00000000-0000-4000-8000-000000009761"}')->>'phase','applied','authorized terminal recovery survives local row deletion');
select is((select current_generation from private.calendar_google_color_operations where ws_id='00000000-0000-4000-8000-000000009711' and event_id='00000000-0000-4000-8000-000000009741'),3::bigint,'tombstone retains provider generation');
select is((select count(*) from private.calendar_google_color_write_permits),0::bigint,'no capability survives finalization');
select is(public.fixture_mutation_call('result','{"id":"00000000-0000-4000-8000-000000009761"}')->>'skippedHabitId',
 '00000000-0000-4000-8000-000000009771','terminal response retains atomic deletion summary');
select ok(not (public.fixture_mutation_call('result','{"id":"00000000-0000-4000-8000-000000009761"}') ? 'projection'),
 'deletion result exposes no provider projection or sealed intent');
update public.calendar_auth_tokens set is_active=false where id='00000000-0000-4000-8000-000000009721';
select throws_ok($$select public.fixture_mutation_call('read','{"id":"00000000-0000-4000-8000-000000009761"}')$$,
 '42501',null,'terminal deletion recovery still enforces fresh token authorization');
-- Install a second guarded fixture row so this FK assertion exercises a
-- real protected event, not only a workspace whose first event was deleted.
insert into public.workspace_calendar_events(id,ws_id,provider,google_calendar_id,google_event_id,
 external_calendar_id,external_event_id,title,start_at,end_at) values
 ('00000000-0000-4000-8000-000000009791','00000000-0000-4000-8000-000000009711',
 'google','fixture-calendar','fixture-cascade','fixture-calendar','fixture-cascade','Fixture',
 '2026-10-01T10:00:00Z','2026-10-01T11:00:00Z');
insert into private.calendar_google_color_operations
 (ws_id,event_id,operation_id,actor_id,generation,current_generation,identity,intent,request_hash,phase,prepared)
 select ws_id,'00000000-0000-4000-8000-000000009791','00000000-0000-4000-8000-000000009792',actor_id,
 generation,current_generation,
 jsonb_set(jsonb_set(identity,'{eventId}','"00000000-0000-4000-8000-000000009791"'),'{providerEventId}','"fixture-cascade"'),intent,request_hash,'prepared',prepared
 from private.calendar_google_color_operations where event_id='00000000-0000-4000-8000-000000009741';
select lives_ok($$delete from public.workspaces where id='00000000-0000-4000-8000-000000009711'$$,
 'workspace FK cascades do not require an event mutation permit');
select * from finish();
rollback;

-- The committed fixture permits independent backend visibility. Remove only
-- these fixture objects/rows before subsequent tests or schema typegen.
begin;
drop function public.fixture_competing_admit();
drop function public.fixture_mutation_call(text,jsonb);
drop function public.fixture_mutation_input(bigint,text);
drop function public.fixture_color_call(text,jsonb);
drop function public.fixture_color_input(bigint,text);
delete from public.workspaces where id='00000000-0000-4000-8000-000000009711';
delete from public.workspace_members where user_id='00000000-0000-4000-8000-000000009701';
delete from auth.users where id='00000000-0000-4000-8000-000000009701';
delete from public.workspaces where creator_id='00000000-0000-4000-8000-000000009701';
delete from public.users where id='00000000-0000-4000-8000-000000009701';
commit;
