begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000008701');
insert into public.users(id) values('00000000-0000-4000-8000-000000008701') on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values('00000000-0000-4000-8000-000000008711','Isolated saga',false,'00000000-0000-4000-8000-000000008701');
insert into public.workspace_members(ws_id,user_id,type) values('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008701','MEMBER') on conflict do nothing;
update public.workspace_default_permissions set enabled=true where ws_id='00000000-0000-4000-8000-000000008711' and permission='manage_calendar';
insert into public.workspace_default_permissions(ws_id,permission,enabled) select '00000000-0000-4000-8000-000000008711','manage_calendar',true where not exists(select 1 from public.workspace_default_permissions where ws_id='00000000-0000-4000-8000-000000008711' and permission='manage_calendar');
insert into public.calendar_auth_tokens(id,user_id,ws_id,provider,access_token,refresh_token,is_active) values('00000000-0000-4000-8000-000000008721','00000000-0000-4000-8000-000000008701','00000000-0000-4000-8000-000000008711','google','synthetic-fixture','synthetic-fixture',true);
insert into public.calendar_connections(id,ws_id,provider,calendar_id,calendar_name,auth_token_id,is_enabled) values
 ('00000000-0000-4000-8000-000000008731','00000000-0000-4000-8000-000000008711','google','old-calendar','Old','00000000-0000-4000-8000-000000008721',true),
 ('00000000-0000-4000-8000-000000008732','00000000-0000-4000-8000-000000008711','google','new-calendar','New','00000000-0000-4000-8000-000000008721',true);
insert into public.workspace_calendar_events(id,ws_id,provider,external_calendar_id,external_event_id,title,start_at,end_at,color,scheduling_metadata) values
 ('00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008711','google','old-calendar','original-event','Synthetic','2026-10-02T10:00:00Z','2026-10-02T11:00:00Z','BLUE','{"custom":{"keep":true}}');
create function public.fixture_saga_endpoint(destination boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('provider','google','workspaceCalendarId',null,'identity',jsonb_build_object(
  'wsId','00000000-0000-4000-8000-000000008711','eventId','00000000-0000-4000-8000-000000008741',
  'connectionId',case when destination then '00000000-0000-4000-8000-000000008732' else '00000000-0000-4000-8000-000000008731' end,
  'authTokenId','00000000-0000-4000-8000-000000008721','calendarId',case when destination then 'new-calendar' else 'old-calendar' end,
  'providerEventId',case when destination then 'tt00000000000040008000000000008751' else 'original-event' end));
$$;
create function public.fixture_saga_input() returns jsonb language sql as $$
 select jsonb_build_object('id','00000000-0000-4000-8000-000000008751','expectedGeneration','0','requestHash',repeat('a',64),
 'prepared',jsonb_build_object('binding',jsonb_build_object('operationId','00000000-0000-4000-8000-000000008751',
 'generation','1','action','move','mode','copy-delete','source',public.fixture_saga_endpoint(),'destination',public.fixture_saga_endpoint(true),'baseETag','original-etag'),
 'journal',jsonb_build_object('version',1,'ciphertext','synthetic-encrypted-journal')));
$$;
create function public.fixture_saga_call(action text,input jsonb default '{"id":"00000000-0000-4000-8000-000000008751","generation":"1"}') returns jsonb language sql as $$
 select public.calendar_provider_saga_operation(action,'00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008701',input);
$$;
create function public.fixture_saga_competitor() returns text language plpgsql as $$
 begin perform public.fixture_saga_call('admit',jsonb_set(public.fixture_saga_input(),'{id}','"00000000-0000-4000-8000-000000008752"') || jsonb_build_object('prepared',jsonb_set(jsonb_set(public.fixture_saga_input()->'prepared','{binding,operationId}','"00000000-0000-4000-8000-000000008752"'),'{binding,destination,identity,providerEventId}','"tt00000000000040008000000000008752"'))); return 'unexpected';
 exception when others then return sqlstate; end;
$$;
create function public.fixture_saga_create_input() returns jsonb language sql as $$
 select jsonb_build_object('id','00000000-0000-4000-8000-000000008753','expectedGeneration','0','requestHash',repeat('b',64),
 'prepared',jsonb_build_object('binding',jsonb_build_object('operationId','00000000-0000-4000-8000-000000008753','generation','1','action','create','mode','insert','source',null,'baseETag',null,
 'destination',jsonb_set(jsonb_set(public.fixture_saga_endpoint(true),'{identity,eventId}','"00000000-0000-4000-8000-000000008743"'),'{identity,providerEventId}','"tt00000000000040008000000000008753"')),
 'journal',jsonb_build_object('version',1,'ciphertext','synthetic-encrypted-create')),
 'placeholder','{"title":"encrypted-title","description":"encrypted-description","is_encrypted":true,"start_at":"2026-10-02T12:00:00Z","end_at":"2026-10-02T13:00:00Z","color":"BLUE","metadata":{}}'::jsonb);
$$;
create function public.fixture_saga_create_call(action text,input jsonb) returns jsonb language sql as $$
 select public.calendar_provider_saga_operation(action,'00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008743','00000000-0000-4000-8000-000000008701',input);
$$;
commit;
select dblink_connect('saga_competitor','dbname=postgres user=postgres password=postgres host=127.0.0.1');
begin;
select is(public.fixture_saga_call('inspect',public.fixture_saga_input())->>'generation','0','saga captures shared initial generation before provider work');
select is(public.fixture_saga_call('admit',public.fixture_saga_input())->>'phase','prepared','sealed dual-source intent admitted atomically');
select dblink_send_query('saga_competitor','select public.fixture_saga_competitor()');
do $$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
 loop exit when exists(select 1 from pg_stat_activity where query='select public.fixture_saga_competitor()' and wait_event_type='Lock');
 if clock_timestamp()>deadline then raise exception 'Saga competing backend did not wait on lock'; end if;
 perform pg_sleep(0.01); end loop;
end $$;
select is(dblink_is_busy('saga_competitor'),1,'independent saga writer blocks on exact event generation');
commit;
select is(result,'40001','stale second saga admission rejects after winning transaction commits') from dblink_get_result('saga_competitor') as result(result text);
select dblink_disconnect('saga_competitor');
begin;
select ok(not has_function_privilege('authenticated','public.calendar_provider_saga_operation(text,uuid,uuid,uuid,jsonb)','EXECUTE'),'customer clients cannot forge saga checkpoints');
select is((select count(*)::integer from private.calendar_provider_saga_scopes where ws_id='00000000-0000-4000-8000-000000008711'),2,'both source and destination locators retained');
select is(public.fixture_saga_call('dispatch')->>'phase','dispatched','saga dispatch precedes any provider effect');
select throws_ok($$select public.fixture_saga_call('cancel')$$,'40001',null,'dispatched saga cannot be canceled or lease-unlocked');
select throws_ok($$update public.workspace_calendar_events set title='unsafe' where id='00000000-0000-4000-8000-000000008741'$$,'40001',null,'other local writer cannot bypass pending saga generation');
select is(public.fixture_saga_call('checkpoint','{"id":"00000000-0000-4000-8000-000000008751","generation":"1","checkpoint":{"step":"target-created","targetEventId":"tt00000000000040008000000000008751","targetETag":"target-original"}}')->'checkpoint'->>'step','target-created','captured target identity and version persist before source delete');
select throws_ok($$select public.fixture_saga_call('checkpoint','{"id":"00000000-0000-4000-8000-000000008751","generation":"1","checkpoint":{"step":"target-created","targetEventId":"tt00000000000040008000000000008751","targetETag":"refreshed-target"}}')$$,'40001',null,'target compensation ETag cannot be refreshed');
select is(public.fixture_saga_call('checkpoint','{"id":"00000000-0000-4000-8000-000000008751","generation":"1","checkpoint":{"step":"source-deleted","targetEventId":"tt00000000000040008000000000008751","targetETag":"target-original"}}')->'checkpoint'->>'step','source-deleted','confirmed source deletion persists without releasing ledger');
update public.workspace_calendar_events set scheduling_metadata=scheduling_metadata||'{"latest_local":{"preserve":true}}' where id='00000000-0000-4000-8000-000000008741';
select is(public.fixture_saga_call('finalize',jsonb_build_object('id','00000000-0000-4000-8000-000000008751','generation','1','snapshot',jsonb_build_object(
 'outcome','applied','endpoint',public.fixture_saga_endpoint(true),'etag','target-original','providerEventId','tt00000000000040008000000000008751',
 'operationMarker','00000000-0000-4000-8000-000000008751','compatibilityColor','RED','metadata','{"google_color":{"version":1}}'::jsonb,
 'projection','{"title":"encrypted-title","description":"encrypted-description","location":"encrypted-location","is_encrypted":true,"start_at":"2026-10-02T12:00:00Z","end_at":"2026-10-02T13:00:00Z","locked":true}'::jsonb)))->>'phase','applied','destination projection and provider identity finalize atomically');
select is((select external_calendar_id from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008741'),'new-calendar','final row owns actual destination');
select is((select scheduling_metadata->'custom'->>'keep' from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008741'),'true','saga preserves existing local metadata');
select is((select scheduling_metadata->'latest_local'->>'preserve' from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008741'),'true','finalization merges latest local metadata');
select is((select identity->>'calendarId' from private.calendar_google_color_operations where event_id='00000000-0000-4000-8000-000000008741'),'new-calendar','current ledger identity follows finalized destination');
select is(public.apply_calendar_google_import((public.capture_calendar_google_import('00000000-0000-4000-8000-000000008711','old-calendar','00000000-0000-4000-8000-000000008721')->>'id')::uuid,
 jsonb_build_array((select to_jsonb(e)||'{"id":"00000000-0000-4000-8000-000000008749","external_calendar_id":"old-calendar","external_event_id":"original-event","google_calendar_id":"old-calendar","google_event_id":"original-event"}'::jsonb from public.workspace_calendar_events e where id='00000000-0000-4000-8000-000000008741')))->>'deferred','1','retired source snapshot is deferred instead of resurrecting a duplicate');
select ok(not exists(select 1 from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008749'),'retired source cannot invent a fresh local UUID');
delete from public.workspace_members where ws_id='00000000-0000-4000-8000-000000008711' and user_id='00000000-0000-4000-8000-000000008701';
select throws_ok($$select public.fixture_saga_call('read')$$,'42501',null,'revoked membership denies retained saga recovery despite active token');
insert into public.workspace_members(ws_id,user_id,type) values('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008701','MEMBER');
select throws_ok($$select public.fixture_saga_create_call('admit',jsonb_set(public.fixture_saga_create_input(),'{prepared,binding,baseETag}','"unexpected-source-version"'))$$,'22023',null,'creation cannot pretend to have an original source version');
select is(public.fixture_saga_create_call('admit',public.fixture_saga_create_input())->>'phase','prepared','encrypted placeholder and creation ledger admit together');
select ok(exists(select 1 from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008743' and is_encrypted and sync_status='syncing'),'creation placeholder is encrypted and pending before provider insert');
select is(public.fixture_saga_create_call('cancel','{"id":"00000000-0000-4000-8000-000000008753","generation":"1"}')->>'phase','canceled','unsent creation cancels without deleting a provider resource');
select ok(not exists(select 1 from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008743'),'unsent creation cancellation removes only owned placeholder');
select is(public.fixture_saga_create_call('read','{"id":"00000000-0000-4000-8000-000000008753"}')->>'generation','1','canceled creation retains its generation tombstone');
insert into private.workspace_calendars(id,ws_id,name,calendar_type) values('00000000-0000-4000-8000-000000008791','00000000-0000-4000-8000-000000008711','Native transfer','custom');
create function public.fixture_native_endpoint() returns jsonb language sql as $$
 select jsonb_build_object('provider','tuturuuu','wsId','00000000-0000-4000-8000-000000008711','eventId','00000000-0000-4000-8000-000000008741','workspaceCalendarId','00000000-0000-4000-8000-000000008791');
$$;
create function public.fixture_native_saga(action text,input jsonb) returns jsonb language sql as $$
 select public.calendar_provider_saga_operation(action,'00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008701',input);
$$;
select is(public.fixture_native_saga('admit',jsonb_build_object('id','00000000-0000-4000-8000-000000008754','expectedGeneration','1','requestHash',repeat('b',64),
 'prepared',jsonb_build_object('binding',jsonb_build_object('operationId','00000000-0000-4000-8000-000000008754','generation','2','action','move','mode','external-to-native',
 'source',public.fixture_saga_endpoint(true),'destination',public.fixture_native_endpoint(),'baseETag','target-original'),'journal','{"version":1,"ciphertext":"sealed-native"}'::jsonb)))->>'phase','prepared','native transfer admits the same retained generation');
select is(public.fixture_native_saga('dispatch','{"id":"00000000-0000-4000-8000-000000008754","generation":"2"}')->>'phase','dispatched','native transfer remains fenced during source deletion');
select throws_ok($$select public.calendar_native_generation_mutation('patch','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008701','{"expectedGeneration":"2","patch":{"locked":false}}')$$,'40001',null,'native writer cannot overwrite an external pending transfer');
select is(public.fixture_native_saga('checkpoint','{"id":"00000000-0000-4000-8000-000000008754","generation":"2","checkpoint":{"step":"source-deleted"}}')->'checkpoint'->>'step','source-deleted','native projection requires confirmed source absence');
select is(public.fixture_native_saga('finalize',jsonb_build_object('id','00000000-0000-4000-8000-000000008754','generation','2','snapshot',jsonb_build_object('outcome','applied','endpoint',public.fixture_native_endpoint(),'metadata','{}'::jsonb,'compatibilityColor','BLUE',
 'projection','{"title":"encrypted-native-title","description":"encrypted-native-description","is_encrypted":true,"start_at":"2026-10-02T12:00:00Z","end_at":"2026-10-02T13:00:00Z"}'::jsonb)))->>'phase','applied','native destination finalizes encrypted snapshot atomically');
select is(public.calendar_native_generation_mutation('inspect','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008701')->>'generation','2','native successor observes retained generation');
select is(public.calendar_native_generation_mutation('patch','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008701','{"expectedGeneration":"2","patch":{"title":"encrypted-next-title","is_encrypted":true}}')->>'title','encrypted-next-title','native successor edits through transaction-owned permit');
select throws_ok($$select public.calendar_native_generation_mutation('patch','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008701','{"expectedGeneration":"2","patch":{"locked":false}}')$$,'40001',null,'stale native successor cannot overwrite newer generation');
select is(public.apply_calendar_google_import((public.capture_calendar_google_import('00000000-0000-4000-8000-000000008711','new-calendar','00000000-0000-4000-8000-000000008721')->>'id')::uuid,
 jsonb_build_array((select to_jsonb(e)||'{"id":"00000000-0000-4000-8000-000000008748","provider":"google","external_calendar_id":"new-calendar","external_event_id":"tt00000000000040008000000000008751","google_calendar_id":"new-calendar","google_event_id":"tt00000000000040008000000000008751"}'::jsonb from public.workspace_calendar_events e where id='00000000-0000-4000-8000-000000008741')))->>'deferred','1','fresh retired provider source remains fenced after native successor generation');
select is((select provider::text from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008741'),'tuturuuu','retired provider import does not reclaim native destination');
select is(public.calendar_native_generation_mutation('delete','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008701','{"expectedGeneration":"3"}')->>'deleted','true','native successor deletion retains provider tombstone');
select is((select current_generation::text from private.calendar_google_color_operations where event_id='00000000-0000-4000-8000-000000008741'),'4','native deletion advances retained logical generation');
select ok(not has_function_privilege('authenticated','public.calendar_native_generation_mutation(text,uuid,uuid,uuid,jsonb)','EXECUTE'),'customer clients cannot forge native write permits');
-- Independent ledgerless writer changes the captured row without a native mutation timestamp.
insert into public.workspace_calendar_events(id,ws_id,provider,source_calendar_id,title,description,is_encrypted,start_at,end_at)
values('00000000-0000-4000-8000-000000008744','00000000-0000-4000-8000-000000008711','tuturuuu','00000000-0000-4000-8000-000000008791','encrypted-old','encrypted-description',true,'2026-10-02T10:00:00Z','2026-10-02T11:00:00Z');
create function public.fixture_native_outbound_input() returns jsonb language sql as $$
 select jsonb_build_object('id','00000000-0000-4000-8000-000000008755','expectedGeneration','0','requestHash',repeat('c',64),
 'nativeSnapshot',to_jsonb(e),
 'prepared',jsonb_build_object('binding',jsonb_build_object('operationId','00000000-0000-4000-8000-000000008755','generation','1','action','move','mode','insert','baseETag',null,
 'source',jsonb_build_object('provider','tuturuuu','wsId',e.ws_id::text,'eventId',e.id::text,'workspaceCalendarId',e.source_calendar_id::text),
 'destination',jsonb_set(jsonb_set(public.fixture_saga_endpoint(true),'{identity,eventId}',to_jsonb(e.id::text)),'{identity,providerEventId}','"tt00000000000040008000000000008755"')),
 'journal','{"version":1,"ciphertext":"sealed-native-outbound"}'::jsonb)) from public.workspace_calendar_events e where id='00000000-0000-4000-8000-000000008744';
$$;
create temporary table fixture_native_capture as select public.fixture_native_outbound_input() as input;
commit;
select dblink_connect('native_writer','dbname=postgres user=postgres password=postgres host=127.0.0.1');
-- The update holds the row lock before admission; generation remains zero.
select dblink_exec('native_writer','begin');
select dblink_exec('native_writer',$$update public.workspace_calendar_events set title='encrypted-fresh' where id='00000000-0000-4000-8000-000000008744'$$);
select dblink_send_query('native_writer','commit');
begin;
select throws_ok($$select public.calendar_provider_saga_operation('admit','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008744','00000000-0000-4000-8000-000000008701',(select input from fixture_native_capture))$$,'40001','Provider saga native snapshot changed','stale ledgerless native row rejects under the admission lock');
select ok(not exists(select 1 from private.calendar_google_color_operations where event_id='00000000-0000-4000-8000-000000008744'),'stale snapshot creates no retained operation or dispatch permission');
select is((select title from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008744'),'encrypted-fresh','concurrent native content survives stale admission');
select is((select external_updated_at from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008744'),((select input from fixture_native_capture)->'nativeSnapshot'->>'external_updated_at')::timestamptz,'native content changes are fenced without a provider timestamp change');
select throws_ok($$select public.calendar_provider_saga_operation('admit','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008744','00000000-0000-4000-8000-000000008701',public.fixture_native_outbound_input()-'nativeSnapshot')$$,'40001',null,'native admission requires a complete private snapshot');
select is(public.calendar_provider_saga_operation('admit','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008744','00000000-0000-4000-8000-000000008701',jsonb_set(public.fixture_native_outbound_input(),'{nativeSnapshot,start_at}','"2026-10-02T10:00:00Z"'))->>'phase','prepared','fresh native row admits first generation with normalized timestamps');
select ok(not ((select prepared from private.calendar_google_color_operations where event_id='00000000-0000-4000-8000-000000008744') ? 'nativeSnapshot'),'private native snapshot is never persisted in preparation');
select public.calendar_provider_saga_operation('cancel','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008744','00000000-0000-4000-8000-000000008701','{"id":"00000000-0000-4000-8000-000000008755","generation":"1"}');
select public.calendar_native_generation_mutation('delete','00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008744','00000000-0000-4000-8000-000000008701','{"expectedGeneration":"1"}');
select dblink_disconnect('native_writer');
update public.calendar_auth_tokens set is_active=false where id='00000000-0000-4000-8000-000000008721';
select throws_ok($$select public.fixture_native_saga('read','{"id":"00000000-0000-4000-8000-000000008754"}')$$,'42501',null,'revoked source/account denies even terminal saga recovery');
select * from finish();
rollback;
drop function if exists public.fixture_native_outbound_input();
drop table fixture_native_capture;
drop function if exists public.fixture_native_saga(text,jsonb);
drop function if exists public.fixture_native_endpoint();
drop function public.fixture_saga_competitor();
drop function public.fixture_saga_create_call(text,jsonb);
drop function public.fixture_saga_create_input();
drop function public.fixture_saga_call(text,jsonb);
drop function public.fixture_saga_input();
drop function public.fixture_saga_endpoint(boolean);
delete from public.workspaces where id='00000000-0000-4000-8000-000000008711';
delete from public.workspace_members where user_id='00000000-0000-4000-8000-000000008701';
delete from auth.users where id='00000000-0000-4000-8000-000000008701';
delete from public.workspaces where personal and creator_id='00000000-0000-4000-8000-000000008701';
delete from public.users where id='00000000-0000-4000-8000-000000008701';
