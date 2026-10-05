begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000008701');
insert into public.users(id) values('00000000-0000-4000-8000-000000008701') on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values('00000000-0000-4000-8000-000000008711','Provider series fixture',false,'00000000-0000-4000-8000-000000008701');
insert into public.workspace_members(ws_id,user_id,type) values('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008701','MEMBER') on conflict do nothing;
update public.workspace_default_permissions set enabled=true where ws_id='00000000-0000-4000-8000-000000008711' and permission='manage_calendar';
insert into public.workspace_default_permissions(ws_id,permission,enabled) select '00000000-0000-4000-8000-000000008711','manage_calendar',true where not exists(select 1 from public.workspace_default_permissions where ws_id='00000000-0000-4000-8000-000000008711' and permission='manage_calendar');
insert into public.calendar_auth_tokens(id,user_id,ws_id,provider,access_token,refresh_token,is_active) values('00000000-0000-4000-8000-000000008712','00000000-0000-4000-8000-000000008701','00000000-0000-4000-8000-000000008711','google','fixture-not-a-token','fixture-not-a-token',true);
insert into public.calendar_connections(id,ws_id,provider,calendar_id,calendar_name,auth_token_id,is_enabled,access_role,sync_outbound_enabled,sync_inbound_enabled) values('00000000-0000-4000-8000-000000008713','00000000-0000-4000-8000-000000008711','google','fixture-calendar','Fixture','00000000-0000-4000-8000-000000008712',true,'owner',true,true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
create function public.fixture_readonly_reconcile(action text,input jsonb) returns jsonb language sql as $$
 select public.calendar_provider_series_reconcile('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008701','00000000-0000-4000-8000-000000008713',action,input);
$$;
create function public.fixture_readonly_observation() returns jsonb language sql as $$
 select '{"masterId":"provider-master","etag":"v1","observationHash":"h1","rule":{"version":1,"frequency":"daily","interval":1,"timeZone":"Asia/Ho_Chi_Minh","end":{"type":"count","count":3}},"anchor":{"startLocal":"2026-10-05T09:00:00","endLocal":"2026-10-05T10:00:00","allDay":false},"payload":{"title":"Encrypted fixture","is_encrypted":true},"exceptions":[],"metadataJournal":{"version":1,"ciphertext":"encrypted-fixture"},"representedInstanceIds":[]}'::jsonb;
$$;

create function public.fixture_readonly_input() returns jsonb language sql as $$
 select '{"masterId":"provider-master","etag":"unsupported-v1","observationHash":"raw-hash","metadataJournal":{"version":1,"ciphertext":"encrypted-raw-rule"},"representedInstanceIds":["represented"]}'::jsonb;
$$;
insert into public.workspace_calendar_events(id,ws_id,provider,external_calendar_id,external_event_id,title,start_at,end_at,color) values
 ('00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008711','google','fixture-calendar','represented','Synthetic','2026-10-05T02:00:00Z','2026-10-05T03:00:00Z','BLUE'),
 ('00000000-0000-4000-8000-000000008742','00000000-0000-4000-8000-000000008711','google','other-calendar','represented','Synthetic','2026-10-05T02:00:00Z','2026-10-05T03:00:00Z','BLUE');
select ok(not has_table_privilege('service_role','private.calendar_provider_readonly_series','SELECT'),'encrypted state requires permission-checked public RPC');
select ok(not has_function_privilege('service_role','private.calendar_provider_series_reconcile_canonical(uuid,uuid,uuid,text,jsonb)','EXECUTE'),'service callers cannot bypass readonly dispatch');
select ok(not has_function_privilege('authenticated','public.calendar_provider_series_is_readonly(uuid,uuid,uuid,uuid)','EXECUTE'),'readonly lookup stays service only');
select is(public.fixture_readonly_reconcile('unsupported',public.fixture_readonly_input())->>'status','applied','first unsupported master gets encrypted read-only binding');
select is((select count(*)::integer from private.calendar_event_series),0,'unsupported rule does not invent a native approximation');
select ok((select locked from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008741'),'matching legacy instance is locked');
select ok((select scheduling_metadata->'provider_recurrence'->>'state'='unsupported' from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008741'),'legacy instance receives safe readonly marker');
select ok((select scheduling_metadata->'provider_recurrence' is null from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008742'),'other calendar alias stays untouched');
select ok(public.calendar_provider_series_is_readonly('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008701','00000000-0000-4000-8000-000000008741',null),'private aliases protect a cached instance');
select is(public.fixture_readonly_reconcile('unsupported',public.fixture_readonly_input())->>'status','deferred','stale unsupported read cannot replace encrypted journal');
select is(public.fixture_readonly_reconcile('unsupported',public.fixture_readonly_input()||'{"expectedBindingETag":"unsupported-v1","expectedBindingObservationHash":"stale-exception-snapshot"}')->>'status','deferred','same master ETag cannot overwrite a newer exception observation');
select is(public.fixture_readonly_reconcile('readonly-bindings','{}')->0->'metadata_journal'->>'ciphertext','encrypted-raw-rule','raw snapshot remains only an encrypted journal');
select throws_ok($$select public.fixture_readonly_reconcile('unsupported',public.fixture_readonly_input()||'{"metadataJournal":{}}')$$,'22023','Incomplete unsupported provider observation','plaintext journals rejected');
select throws_ok($$insert into private.calendar_google_color_operations(ws_id,event_id,operation_id,actor_id,generation,current_generation,identity,intent,request_hash,phase) values('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008741','00000000-0000-4000-8000-000000008751','00000000-0000-4000-8000-000000008701',1,1,'{}','{}',repeat('0',64),'reserved')$$,'42501','Unsupported provider recurrence is read only','late legacy operation admission cannot bypass publication');
select is(public.fixture_readonly_reconcile('snapshot',public.fixture_readonly_observation()||'{"expectedBindingETag":"unsupported-v1","representedInstanceIds":["represented"]}')->>'status','applied','first unsupported master becomes canonical after fresh supported observation');
select is((select count(*)::integer from private.calendar_provider_readonly_series),0,'supported recovery removes encrypted unsupported state');
select is((select projection_state from private.calendar_provider_series_bindings),'canonical','supported recovery restores binding state');
select is((select count(*)::integer from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000008741'),0,'supported recovery suppresses only verified legacy duplicate');
select lives_ok($$select public.calendar_provider_series_operation('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008701','reserve',jsonb_build_object('id','00000000-0000-4000-8000-000000008721','connectionId','00000000-0000-4000-8000-000000008713','seriesId',(select id from private.calendar_event_series),'nativeAction','update','intentHash','fixture-intent','stepCount',1,'journal','{"version":1,"ciphertext":"encrypted"}'::jsonb,'nativeInput',jsonb_build_object('requestId','00000000-0000-4000-8000-000000008721','expectedRevision',1,'scope','all')))$$,'pending canonical operation reservation succeeds');
select is(public.fixture_readonly_reconcile('unsupported',public.fixture_readonly_input()||'{"expectedBindingETag":"v1"}')->>'status','deferred','pending canonical provider operation fences unsupported transition');
select is((select count(*)::integer from private.calendar_provider_readonly_series),0,'pending canonical operation retains visible native state');
delete from private.calendar_provider_series_operations where id='00000000-0000-4000-8000-000000008721';
select is(public.fixture_readonly_reconcile('unsupported',public.fixture_readonly_input()||'{"expectedBindingETag":"v1"}')->>'status','applied','bound canonical series can transition to unsupported');
select ok((select deleted_at is not null from private.calendar_event_series),'stale native recurrence is hidden');
select is((select revision from private.calendar_event_series),2,'unsupported transition fences stale native revision');
select is(public.fixture_readonly_reconcile('unsupported',public.fixture_readonly_input()||'{"expectedBindingETag":"unsupported-v1","etag":"unsupported-v2"}')->>'status','applied','fresh unsupported snapshot refreshes journal');
select is((select revision from private.calendar_event_series),2,'repeated unsupported snapshot does not repeatedly bump hidden revision');
select ok(public.calendar_provider_series_is_readonly('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008701',null,(select id from private.calendar_event_series)),'canonical series identity remains authoritatively readonly');
select is(public.fixture_readonly_reconcile('snapshot',public.fixture_readonly_observation()||'{"expectedBindingETag":"unsupported-v2","etag":"v3","observationHash":"supported-restored"}')->>'status','applied','supported provider rule restores original canonical identity');
select ok((select deleted_at is null from private.calendar_event_series),'restored canonical series is visible');
select is((select count(*)::integer from private.calendar_event_series),1,'recovery never duplicates canonical identity');
-- An already prepared legacy mutation retains authority; unsupported publication waits.
insert into public.workspace_calendar_events(id,ws_id,provider,external_calendar_id,external_event_id,title,start_at,end_at,color) values('00000000-0000-4000-8000-000000008743','00000000-0000-4000-8000-000000008711','google','fixture-calendar','pending-instance','Synthetic','2026-10-05T02:00:00Z','2026-10-05T03:00:00Z','BLUE');
insert into private.calendar_google_color_operations(ws_id,event_id,operation_id,actor_id,generation,current_generation,identity,intent,request_hash,phase) values('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008743','00000000-0000-4000-8000-000000008752','00000000-0000-4000-8000-000000008701',1,1,'{}','{}',repeat('1',64),'prepared');
select is(public.fixture_readonly_reconcile('unsupported',public.fixture_readonly_input()||'{"masterId":"pending-master","representedInstanceIds":["pending-instance"]}')->>'status','deferred','pending ordinary provider operation defers readonly publication');
select is((select count(*)::integer from private.calendar_provider_readonly_series),0,'deferred publication does not retain a partial state');
select is(public.fixture_readonly_reconcile('unsupported',public.fixture_readonly_input()||'{"masterId":"removed-master","representedInstanceIds":[]}')->>'status','applied','unbound unsupported master is captured before deletion');
select is(public.fixture_readonly_reconcile('deleted','{"masterId":"removed-master","expectedBindingETag":"stale"}')->>'status','deferred','stale unsupported deletion keeps encrypted state');
select is(public.fixture_readonly_reconcile('deleted','{"masterId":"removed-master","expectedBindingETag":"unsupported-v1"}')->>'status','deleted','authoritative deletion clears unsupported-only master');
select is((select count(*)::integer from private.calendar_provider_readonly_series),0,'deleted unsupported master releases its encrypted state');
select throws_ok($$select public.calendar_provider_series_is_readonly('00000000-0000-4000-8000-000000008711','00000000-0000-4000-8000-000000008799',null,null)$$,'42501','Provider readonly lookup denied','actor membership checked before private state lookup');
update public.calendar_auth_tokens set is_active=false where id='00000000-0000-4000-8000-000000008712';
select throws_ok($$select public.fixture_readonly_reconcile('readonly-bindings','{}')$$,'42501','Provider source reconciliation denied','revoked provider credential cannot expose encrypted snapshots');
select * from finish();
rollback;
