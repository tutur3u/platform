begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into public.users(id) values ('00000000-0000-4000-8000-000000009701');
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
create function pg_temp.color_input(generation bigint default 1, op text default '00000000-0000-4000-8000-000000009751')
returns jsonb language sql as $$
 select jsonb_build_object('id',op,'generation',generation::text,'requestHash',repeat('a',64),
  'identity',jsonb_build_object('wsId','00000000-0000-4000-8000-000000009711',
   'eventId','00000000-0000-4000-8000-000000009741','connectionId','00000000-0000-4000-8000-000000009731',
   'authTokenId','00000000-0000-4000-8000-000000009721','calendarId','fixture-calendar','providerEventId','fixture-event'),
  'intent',jsonb_build_object('connectionId','00000000-0000-4000-8000-000000009731','kind','event','id','11'),
  'prepared',jsonb_build_object('baseETag','opaque:base','eventLabelVersion',0,'patch',jsonb_build_object(
   'colorId','11','extendedProperties',jsonb_build_object('private',jsonb_build_object('tuturuuuColorOperation',op)))));
$$;
create function pg_temp.color_call(action text, payload jsonb default pg_temp.color_input())
returns jsonb language sql as $$
 select public.calendar_google_color_operation(action,'00000000-0000-4000-8000-000000009711',
 '00000000-0000-4000-8000-000000009741','00000000-0000-4000-8000-000000009701',payload);
$$;
select ok(not has_table_privilege('authenticated','private.calendar_google_color_operations','INSERT'), 'client cannot create protocol state');
select ok(not has_table_privilege('authenticated','private.calendar_google_color_operations','UPDATE'), 'client cannot forge protocol state');
select ok(not has_table_privilege('service_role','private.calendar_google_color_write_permits','INSERT'), 'even server caller cannot forge private transaction permit directly');
select ok(not has_function_privilege('authenticated','public.calendar_google_color_operation(text,uuid,uuid,uuid,jsonb)','EXECUTE'), 'RPC is not exposed to client role');
select ok(has_function_privilege('service_role','public.calendar_google_color_operation(text,uuid,uuid,uuid,jsonb)','EXECUTE'), 'existing server role owns narrow RPC');
-- Verify actual GRANT state, not policy text. No fixture grants.
select ok(not has_table_privilege('authenticated','public.workspace_calendar_events','INSERT'), 'existing protected table denies client insert');
select ok(not has_table_privilege('authenticated','public.workspace_calendar_events','UPDATE'), 'existing protected table denies client update');
select ok(not has_table_privilege('authenticated','public.workspace_calendar_events','DELETE'), 'existing protected table denies client delete');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(pg_temp.color_call('reserve',pg_temp.color_input(0))->>'phase','reserved','reserve durable operation before dispatch');
select is(pg_temp.color_call('read')->>'generation','1','reservation advances persistent generation');
select throws_ok($$select pg_temp.color_call('reserve',pg_temp.color_input(1,'00000000-0000-4000-8000-000000009752'))$$,
 '40001',null,'competing intent cannot replace pending operation');
select throws_ok($$select pg_temp.color_call('prepare', pg_temp.color_input() - 'prepared')$$,'22023',null,'missing prepared precondition is rejected');
select is(pg_temp.color_call('prepare')->'prepared'->>'baseETag','opaque:base','precondition stored before dispatch');
select is(pg_temp.color_call('prepare',jsonb_set(pg_temp.color_input(),'{prepared,baseETag}','"changed"'))->'prepared'->>'baseETag',
 'opaque:base','resume cannot refresh immutable precondition');
select is(pg_temp.color_call('dispatch')->>'phase','dispatched','dispatch state persisted before network');
select throws_ok($$select pg_temp.color_call('cancel')$$,'40001',null,'possibly dispatched intent cannot be force-cleared');
select lives_ok($$update public.workspace_calendar_events set scheduling_metadata=scheduling_metadata || '{"concurrent":{"keep":true}}'
 where id='00000000-0000-4000-8000-000000009741'$$,'independent metadata update remains usable');
select throws_ok($$update public.workspace_calendar_events set color='RED' where id='00000000-0000-4000-8000-000000009741'$$,
 '40001',null,'unconditional color write cannot bypass generation');
select throws_ok($$delete from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000009741'$$,
 '40001',null,'competing delete cannot bypass reservation');
select throws_ok($$select pg_temp.color_call('finalize',pg_temp.color_input() || jsonb_build_object('outcome','applied','snapshot',
 jsonb_build_object('etag','opaque:after','operationMarker','00000000-0000-4000-8000-000000009751',
 'compatibilityColor','INVALID_FIXTURE_COLOR','metadata','{"google_color":{"version":1,"inherited":false,"color_id":"11"}}'::jsonb)))$$,
 '23503',null,'failed event commit rolls back projection and completion together');
select is(pg_temp.color_call('read')->>'phase','dispatched','DB failure leaves operation recoverable');
select is((select color from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000009741'),
 'BLUE','DB failure leaves prior event color intact');
update public.calendar_auth_tokens set is_active=false where id='00000000-0000-4000-8000-000000009721';
select throws_ok($$select pg_temp.color_call('read')$$,'42501',null,'token loss is reauthorized on recovery');
update public.calendar_auth_tokens set is_active=true where id='00000000-0000-4000-8000-000000009721';
select set_config('tuturuuu.calendar_google_operation','00000000-0000-4000-8000-000000009751',true);
select throws_ok($$update public.workspace_calendar_events set color='RED' where id='00000000-0000-4000-8000-000000009741'$$,
 '40001',null,'forged session token cannot create a write capability');
select is(pg_temp.color_call('finalize', pg_temp.color_input() || jsonb_build_object('outcome','applied','snapshot',
 jsonb_build_object('etag','opaque:after','operationMarker','00000000-0000-4000-8000-000000009751',
 'compatibilityColor','RED','metadata','{"google_color":{"version":1,"inherited":false,"color_id":"11","background":"#ff0000"}}'::jsonb)))->>'phase',
 'applied','atomic finalize records provider projection and completion');
select is((select scheduling_metadata->'custom'->>'keep' from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000009741'),
 'true','finalize preserves original independent metadata');
select is((select scheduling_metadata->'concurrent'->>'keep' from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000009741'),
 'true','finalize preserves concurrent independent metadata');
select is((select sync_status from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000009741'),'synced','sync status committed with projection');
select throws_ok($$update public.workspace_calendar_events set color='BLUE' where id='00000000-0000-4000-8000-000000009741'$$,
 '40001',null,'generation guard survives completion and blocks stale imported A');
select is(pg_temp.color_call('reserve',pg_temp.color_input(1,'00000000-0000-4000-8000-000000009752'))->>'generation',
 '2','successor advances generation');
select throws_ok($$select pg_temp.color_call('finalize')$$,'40001',null,'delayed old finalize cannot overwrite successor');
select is(pg_temp.color_call('cancel',pg_temp.color_input(2,'00000000-0000-4000-8000-000000009752'))->>'phase',
 'canceled','definitely-unsent successor safely cancels');
select is(pg_temp.color_call('read',pg_temp.color_input(2,'00000000-0000-4000-8000-000000009752'))->>'generation',
 '2','cancellation retains generation');
set local role authenticated;
select throws_ok($$select pg_temp.color_call('read')$$,'42501',null,'forged direct client RPC denied');
reset role;
select is((select count(*) from private.calendar_google_color_write_permits),0::bigint,'no capability left after transaction');
select * from finish();
rollback;
