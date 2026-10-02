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

-- Prepared for the next isolated DB admission; not part of the 35-assertion proof.
create function pg_temp.import_capture() returns uuid language sql as $$
 select (public.capture_calendar_google_import(
 '00000000-0000-4000-8000-000000009711','fixture-calendar',
 '00000000-0000-4000-8000-000000009721')->>'id')::uuid;
$$;
create function pg_temp.import_event() returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object(
 'ws_id','00000000-0000-4000-8000-000000009711','provider','google',
 'google_calendar_id','fixture-calendar','external_calendar_id','fixture-calendar',
 'google_event_id','fixture-event','external_event_id','fixture-event',
 'title','Fresh provider state','start_at','2026-10-01T10:00:00Z',
 'end_at','2026-10-01T11:00:00Z','color','RED',
 'scheduling_metadata','{"google_color":{"version":1,"color_id":"11"}}'::jsonb));
$$;
create temp table captures(name text primary key,id uuid);
select ok((select bool_and(relrowsecurity) from pg_class
 where oid in ('private.calendar_google_color_operations'::regclass,
 'private.calendar_google_color_write_permits'::regclass,
 'private.calendar_google_import_reads'::regclass,
 'private.calendar_google_deferred_imports'::regclass)), 'all protocol tables enable RLS');
select ok(not has_table_privilege('authenticated','private.calendar_google_deferred_imports','INSERT'), 'clients cannot forge deferred imports');
select ok(not has_table_privilege('service_role','private.calendar_google_import_reads','INSERT'), 'capture storage only accessible through owning RPC');
select ok(not has_function_privilege('authenticated','public.apply_calendar_google_import(uuid,jsonb,jsonb)','EXECUTE'), 'clients cannot forge guarded application');
insert into captures values('old',pg_temp.import_capture());
select is(pg_temp.color_call('reserve',pg_temp.color_input(0))->>'generation','1','operation reserves after old provider read');
insert into captures values('pending',pg_temp.import_capture());
select is(public.apply_calendar_google_import((select id from captures where name='pending'),pg_temp.import_event())->>'deferred','1','pending operation defers rather than overwrites');
select is((select count(*) from private.calendar_google_deferred_imports),1::bigint,'deferral identity is durable');
select is(pg_temp.color_call('cancel')->>'phase','canceled','unsent operation is canceled safely');
select is(public.apply_calendar_google_import((select id from captures where name='old'),pg_temp.import_event())->>'deferred','1','completed operation still fences older snapshot');
insert into captures values('fresh',pg_temp.import_capture());
select is(public.apply_calendar_google_import((select id from captures where name='fresh'),pg_temp.import_event())->>'updated','1','fresh replay applies through guarded capability');
select is((select scheduling_metadata->'custom'->>'keep' from public.workspace_calendar_events
 where id='00000000-0000-4000-8000-000000009741'),'true','import preserves unrelated metadata atomically');
select is((select count(*) from private.calendar_google_deferred_imports),0::bigint,'only committed replay clears journal');
select is(pg_temp.color_call('inspect')->>'generation','2','guarded import advances retained generation');
select is(public.apply_calendar_google_import((select id from captures where name='fresh'),pg_temp.import_event())->>'deferred','1','second instance with same old read cannot overwrite latest import');
insert into captures values('delete',pg_temp.import_capture());
select is(public.apply_calendar_google_import((select id from captures where name='delete'),'[]','["fixture-event"]')->>'deleted','1','fresh tombstone deletes through retained history');
select is(public.apply_calendar_google_import((select id from captures where name='delete'),pg_temp.import_event())->>'deferred','1','older snapshot cannot resurrect tombstoned event');
insert into captures values('restore',pg_temp.import_capture());
select is(public.apply_calendar_google_import((select id from captures where name='restore'),pg_temp.import_event())->>'inserted','1','genuinely fresh provider read may restore resource');
select is((select id::text from public.workspace_calendar_events where external_event_id='fixture-event'),
 '00000000-0000-4000-8000-000000009741','restore retains protected logical ID');
update public.calendar_auth_tokens set is_active=false where id='00000000-0000-4000-8000-000000009721';
select throws_ok($$select public.apply_calendar_google_import((select id from captures where name='restore'),pg_temp.import_event())$$,
 '42501',null,'revoked token prevents apply after provider read');
select is((select count(*) from private.calendar_google_color_write_permits),0::bigint,'no transaction capability remains');
select * from finish();
rollback;
