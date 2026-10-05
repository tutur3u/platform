begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000009901');
insert into public.users(id) values('00000000-0000-4000-8000-000000009901') on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values('00000000-0000-4000-8000-000000009911','Provider series fixture',false,'00000000-0000-4000-8000-000000009901');
insert into public.workspace_members(ws_id,user_id,type) values('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009901','MEMBER') on conflict do nothing;
update public.workspace_default_permissions set enabled=true where ws_id='00000000-0000-4000-8000-000000009911' and permission='manage_calendar';
insert into public.workspace_default_permissions(ws_id,permission,enabled) select '00000000-0000-4000-8000-000000009911','manage_calendar',true where not exists(select 1 from public.workspace_default_permissions where ws_id='00000000-0000-4000-8000-000000009911' and permission='manage_calendar');
insert into public.calendar_auth_tokens(id,user_id,ws_id,provider,access_token,refresh_token,is_active) values('00000000-0000-4000-8000-000000009912','00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009911','google','fixture-not-a-token','fixture-not-a-token',true);
insert into public.calendar_connections(id,ws_id,provider,calendar_id,calendar_name,auth_token_id,is_enabled,access_role,sync_outbound_enabled) values('00000000-0000-4000-8000-000000009913','00000000-0000-4000-8000-000000009911','google','fixture-calendar','Fixture','00000000-0000-4000-8000-000000009912',true,'owner',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
create function public.fixture_provider_op(action text,input jsonb default '{}') returns jsonb language sql as $$
 select public.calendar_provider_series_operation('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009901',action,input||jsonb_build_object('id','00000000-0000-4000-8000-000000009921'));
$$;
create function public.fixture_provider_reserve() returns jsonb language sql as $$
 select jsonb_build_object('connectionId','00000000-0000-4000-8000-000000009913','nativeAction','create','intentHash','fixture-intent','stepCount',1,'journal',jsonb_build_object('version',1,'ciphertext','fixture-encrypted-journal'),
 'nativeInput','{"requestId":"00000000-0000-4000-8000-000000009921","intentHash":"fixture-native","rule":{"version":1,"frequency":"daily","interval":1,"timeZone":"Asia/Ho_Chi_Minh","end":{"type":"count","count":3}},"anchor":{"startLocal":"2026-10-05T09:00:00","endLocal":"2026-10-05T10:00:00","allDay":false},"payload":{"title":"Fixture"}}'::jsonb);
$$;
create temp table operation as select public.fixture_provider_op('reserve',public.fixture_provider_reserve()) data;
select is((select data->>'phase' from operation),'prepared','reservation precedes provider effects');
select is((select count(*)::integer from private.calendar_event_series),0,'reservation does not publish an uncreated provider series');
select is(public.fixture_provider_op('reserve',public.fixture_provider_reserve()),(select data from operation),'reservation is idempotent');
select throws_ok($$select public.fixture_provider_op('reserve',public.fixture_provider_reserve()||'{"intentHash":"changed"}')$$,'22023',null,'request identity binds plaintext intent');
update operation set data=public.fixture_provider_op('claim');
select is((select data->>'phase' from operation),'running','worker leases unfinished operation');
select throws_ok($$select public.fixture_provider_op('claim')$$,'40001',null,'competing worker cannot claim live lease');
select throws_ok($$select public.fixture_provider_op('finalize',jsonb_build_object('lease',(select data->>'lease' from operation)))$$,'40001',null,'publication requires every durable provider checkpoint');
select throws_ok($$select public.fixture_provider_op('checkpoint','{"lease":"00000000-0000-4000-8000-000000009999","checkpoint":{"step":0,"result":{"eventId":"master","etag":"v1"}}}')$$,'40001',null,'stale worker cannot checkpoint');
select throws_ok($$select public.fixture_provider_op('checkpoint',jsonb_build_object('lease',(select data->>'lease' from operation),'checkpoint','{"step":1,"result":{"eventId":"master","etag":"v1"}}'::jsonb))$$,'22023',null,'checkpoint sequence cannot skip a remote effect');
update operation set data=public.fixture_provider_op('checkpoint',jsonb_build_object('lease',data->>'lease','checkpoint','{"step":0,"result":{"eventId":"master","etag":"v1"}}'::jsonb));
update operation set data=public.fixture_provider_op('finalize',jsonb_build_object('lease',data->>'lease'));
select is((select data->>'phase' from operation),'applied','completed provider effects publish canonical series');
select is((select count(*)::integer from private.calendar_event_series),1,'one canonical master is committed');
select is((select master_id from private.calendar_provider_series_bindings),'master','immutable provider master identity is retained');
select is(public.fixture_provider_op('finalize','{}'),(select data from operation),'completed publication is idempotent');
select throws_ok($$select public.calendar_series_operation('00000000-0000-4000-8000-000000009911','delete',jsonb_build_object('requestId','00000000-0000-4000-8000-000000009922','intentHash','delete','seriesId',(select series_id from private.calendar_provider_series_bindings),'expectedRevision',1,'scope','all'),'00000000-0000-4000-8000-000000009901')$$,'40001',null,'native writes cannot bypass provider recovery');
select is((public.calendar_provider_series_operation('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009901','binding',jsonb_build_object('seriesId',(select series_id from private.calendar_provider_series_bindings)))->>'master_id'),'master','authorized source binding lookup');
select is((select data->'result'->'providerSource'->>'externalEventId' from operation),'master','canonical result exposes only safe provider identity');
create function public.fixture_provider_tail(action text,input jsonb default '{}') returns jsonb language sql as $$
 select public.calendar_provider_series_operation('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009901',action,input||jsonb_build_object('id','00000000-0000-4000-8000-000000009931'));
$$;
create temp table tail_operation as select public.fixture_provider_tail('reserve',jsonb_build_object(
 'connectionId','00000000-0000-4000-8000-000000009913','seriesId',(select series_id from private.calendar_provider_series_bindings where master_id='master'),
 'nativeAction','update','intentHash','tail-intent','stepCount',2,'journal','{"version":1,"ciphertext":"fixture-tail-journal"}'::jsonb,
 'nativeInput',(public.fixture_provider_reserve()->'nativeInput')||jsonb_build_object(
 'requestId','00000000-0000-4000-8000-000000009931','seriesId',(select series_id from private.calendar_provider_series_bindings where master_id='master'),'expectedRevision',1,'scope','future','originalStartLocal','2026-10-06T09:00:00',
 'previousRule',(public.fixture_provider_reserve()->'nativeInput'->'rule')||'{"end":{"type":"until","date":"2026-10-05"}}'::jsonb,
 'rule',(public.fixture_provider_reserve()->'nativeInput'->'rule')||'{"end":{"type":"count","count":2}}'::jsonb,
 'anchor','{"startLocal":"2026-10-06T09:00:00","endLocal":"2026-10-06T10:00:00","allDay":false}'::jsonb))) data;
update tail_operation set data=public.fixture_provider_tail('claim');
update tail_operation set data=public.fixture_provider_tail('checkpoint',jsonb_build_object('lease',data->>'lease','checkpoint','{"step":0,"result":{"eventId":"master","etag":"v2"}}'::jsonb));
select is((select count(*)::integer from private.calendar_event_series),1,'partial remote trim does not publish a partial local split');
select throws_ok($$select public.fixture_provider_tail('finalize',jsonb_build_object('lease',(select data->>'lease' from tail_operation)))$$,'40001',null,'future split requires replacement creation checkpoint');
update tail_operation set data=public.fixture_provider_tail('checkpoint',jsonb_build_object('lease',data->>'lease','checkpoint','{"step":1,"result":{"eventId":"tail","etag":"v3"}}'::jsonb));
update tail_operation set data=public.fixture_provider_tail('finalize',jsonb_build_object('lease',data->>'lease'));
select is((select count(*)::integer from private.calendar_event_series),2,'final publication creates exactly one canonical tail');
select is((select etag from private.calendar_provider_series_bindings where master_id='master'),'v2','trimmed master retains new provider revision');
select is((select data->'result'->'series'->'providerSource'->>'externalEventId' from tail_operation),'tail','tail canonical result retains replacement master identity');
select is(public.fixture_provider_tail('finalize'),(select data from tail_operation),'future publication retry does not duplicate tail');

-- New plans create first; finalize binds the fresh replacement receipt and keeps
-- the trimmed original's revision. Existing trim-first assertions above remain.
create function public.fixture_provider_fresh(action text,input jsonb default '{}') returns jsonb language sql as $$
 select public.calendar_provider_series_operation('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009901',action,input||jsonb_build_object('id','00000000-0000-4000-8000-000000009941'));
$$;
create temp table fresh_operation as select public.fixture_provider_fresh('reserve',jsonb_build_object(
 'connectionId','00000000-0000-4000-8000-000000009913','seriesId',(select series_id from private.calendar_provider_series_bindings where master_id='tail'),
 'nativeAction','update','intentHash','fresh-intent','stepCount',2,'journal','{"version":1,"ciphertext":"fixture-fresh-journal"}'::jsonb,
 'nativeInput',(public.fixture_provider_reserve()->'nativeInput')||jsonb_build_object(
 'requestId','00000000-0000-4000-8000-000000009941','seriesId',(select series_id from private.calendar_provider_series_bindings where master_id='tail'),'expectedRevision',1,'scope','future','providerCreateFirst',true,'originalStartLocal','2026-10-07T09:00:00',
 'previousRule',(public.fixture_provider_reserve()->'nativeInput'->'rule')||'{"end":{"type":"until","date":"2026-10-06"}}'::jsonb,
 'rule',(public.fixture_provider_reserve()->'nativeInput'->'rule')||'{"end":{"type":"count","count":1}}'::jsonb,
 'anchor','{"startLocal":"2026-10-07T09:00:00","endLocal":"2026-10-07T10:00:00","allDay":false}'::jsonb))) data;
update fresh_operation set data=public.fixture_provider_fresh('claim');
update fresh_operation set data=public.fixture_provider_fresh('checkpoint',jsonb_build_object('lease',data->>'lease','checkpoint','{"step":0,"kind":"create","result":{"eventId":"fresh-tail","etag":"fresh-v1"}}'::jsonb));
select is((select count(*)::integer from private.calendar_event_series),2,'fresh remote creation does not publish native split before original trim');
select throws_ok($$select public.fixture_provider_fresh('finalize',jsonb_build_object('lease',(select data->>'lease' from fresh_operation)))$$,'40001',null,'fresh replacement alone cannot finalize incomplete split');
update fresh_operation set data=public.fixture_provider_fresh('checkpoint',jsonb_build_object('lease',data->>'lease','checkpoint','{"step":1,"kind":"create","result":{"eventId":"tail","etag":"trimmed-tail-v2"}}'::jsonb));
select throws_ok($$select public.fixture_provider_fresh('finalize',jsonb_build_object('lease',(select data->>'lease' from fresh_operation)))$$,'22023','Invalid provider checkpoint roles','wrong checkpoint roles cannot bind replacement');
select is((select count(*)::integer from private.calendar_event_series),2,'rejected receipt roles roll back native publication atomically');
update private.calendar_provider_series_operations set checkpoints=jsonb_set(checkpoints,'{1,kind}','"trim"') where id='00000000-0000-4000-8000-000000009941';
update fresh_operation set data=public.fixture_provider_fresh('finalize',jsonb_build_object('lease',data->>'lease'));
select is((select data->'result'->'series'->'providerSource'->>'externalEventId' from fresh_operation),'fresh-tail','create-first replacement binds first receipt identity');
select is((select etag from private.calendar_provider_series_bindings where master_id='tail'),'trimmed-tail-v2','original binding takes trim receipt revision');
select is(public.fixture_provider_fresh('finalize'),(select data from fresh_operation),'create-first finalization recovery remains idempotent');
update public.calendar_auth_tokens set is_active=false where id='00000000-0000-4000-8000-000000009912';
select throws_ok($$select public.fixture_provider_op('read')$$,'42501',null,'revoked provider credentials deny recovery');
select ok(not has_table_privilege('authenticated','private.calendar_provider_series_operations','SELECT'),'encrypted operation journals are not directly readable');
select ok(not has_function_privilege('authenticated','public.calendar_provider_series_operation(uuid,uuid,text,jsonb)','EXECUTE'),'provider dispatcher accepts only verified service actors');
select ok(not has_function_privilege('service_role','private.calendar_series_operation(uuid,text,jsonb,uuid)','EXECUTE'),'private native implementation cannot be called directly');
select * from finish();
rollback;
