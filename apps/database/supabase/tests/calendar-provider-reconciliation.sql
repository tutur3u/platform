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
insert into public.calendar_connections(id,ws_id,provider,calendar_id,calendar_name,auth_token_id,is_enabled,access_role,sync_outbound_enabled,sync_inbound_enabled) values('00000000-0000-4000-8000-000000009913','00000000-0000-4000-8000-000000009911','google','fixture-calendar','Fixture','00000000-0000-4000-8000-000000009912',true,'owner',true,true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
create function public.fixture_reconcile(action text,input jsonb) returns jsonb language sql as $$
 select public.calendar_provider_series_reconcile('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009913',action,input);
$$;
create function public.fixture_observation() returns jsonb language sql as $$
 select '{"masterId":"provider-master","etag":"v1","observationHash":"h1","rule":{"version":1,"frequency":"daily","interval":1,"timeZone":"Asia/Ho_Chi_Minh","end":{"type":"count","count":3}},"anchor":{"startLocal":"2026-10-05T09:00:00","endLocal":"2026-10-05T10:00:00","allDay":false},"payload":{"title":"Encrypted fixture","is_encrypted":true},"exceptions":[],"metadataJournal":{"version":1,"ciphertext":"encrypted-fixture"},"representedInstanceIds":[]}'::jsonb;
$$;
select ok(not has_function_privilege('authenticated','public.calendar_provider_series_reconcile(uuid,uuid,uuid,text,jsonb)','EXECUTE'),'untrusted clients cannot write observed provider snapshots');
insert into public.workspace_calendar_events(id,ws_id,provider,external_calendar_id,external_event_id,title,start_at,end_at,color) values
 ('00000000-0000-4000-8000-000000009941','00000000-0000-4000-8000-000000009911','google','fixture-calendar','represented','Synthetic','2026-10-05T02:00:00Z','2026-10-05T03:00:00Z','BLUE'),
 ('00000000-0000-4000-8000-000000009942','00000000-0000-4000-8000-000000009911','google','other-calendar','represented','Synthetic','2026-10-05T02:00:00Z','2026-10-05T03:00:00Z','BLUE'),
 ('00000000-0000-4000-8000-000000009943','00000000-0000-4000-8000-000000009911','google','fixture-calendar','unrepresented','Synthetic','2026-10-05T02:00:00Z','2026-10-05T03:00:00Z','BLUE');
create temp table observed as select public.fixture_reconcile('snapshot',public.fixture_observation()||'{"representedInstanceIds":["represented"]}'::jsonb) data;
select is((select count(*)::integer from public.workspace_calendar_events where id='00000000-0000-4000-8000-000000009941'),0,'represented imported instance is suppressed only after canonical publication');
select is((select count(*)::integer from public.workspace_calendar_events where id in ('00000000-0000-4000-8000-000000009942','00000000-0000-4000-8000-000000009943')),2,'other calendars and unrepresented identities are preserved');
select is((select data->>'status' from observed),'applied','complete observed master imports atomically');
select is((select count(*)::integer from private.calendar_event_series),1,'one canonical series per provider master');
select is((select data->'series'->'providerSource'->>'externalEventId' from observed),'provider-master','canonical snapshot exposes safe provider identity');
select is(public.fixture_reconcile('snapshot',public.fixture_observation()||'{"expectedBindingETag":"v1"}'::jsonb)->'series'->>'revision','1','same semantic snapshot does not bump revision');
select is(public.fixture_reconcile('snapshot',public.fixture_observation()||'{"expectedBindingETag":"v1","etag":"v2","observationHash":"h2","exceptions":[{"originalStartLocal":"2026-10-06T09:00:00","exception":{"cancelled":true},"payload":null}]}'::jsonb)->'series'->>'revision','2','changed provider snapshot bumps canonical revision');
select is((select count(*)::integer from private.calendar_event_series_exceptions),1,'canonical cancelled original slot is retained');
select is(public.fixture_reconcile('snapshot',public.fixture_observation()||'{"expectedBindingETag":"v1"}'::jsonb)->>'status','deferred','stale provider read cannot overwrite newer binding');
select throws_ok($$select public.fixture_reconcile('snapshot',public.fixture_observation()||'{"expectedBindingETag":"v2","metadataJournal":{}}'::jsonb)$$,'22023','Incomplete provider observation','plaintext or malformed retained provider metadata is denied');
select throws_ok($$select public.fixture_reconcile('snapshot',public.fixture_observation()||'{"expectedBindingETag":"v2","observationHash":"h3","exceptions":[{"originalStartLocal":"2026-10-06T09:00:00","exception":{"cancelled":true}},{"originalStartLocal":"2026-10-06T09:00:00","exception":{"cancelled":true}}]}'::jsonb)$$,'23505',null,'duplicate slots roll the entire publication back');
select is((select revision from private.calendar_event_series),2,'failed publication does not mutate revision');
select is((select count(*)::integer from private.calendar_event_series_exceptions),1,'failed publication retains previous complete exception snapshot');
select lives_ok($$select public.calendar_provider_series_operation('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009901','reserve',jsonb_build_object('id','00000000-0000-4000-8000-000000009921','connectionId','00000000-0000-4000-8000-000000009913','seriesId',(select data->'series'->>'id' from observed),'nativeAction','update','intentHash','fixture-intent','stepCount',1,'journal','{"version":1,"ciphertext":"encrypted"}'::jsonb,'nativeInput',jsonb_build_object('requestId','00000000-0000-4000-8000-000000009921','expectedRevision',2,'scope','all')))$$,'outbound reservation fences an imported canonical series');
select is(public.fixture_reconcile('snapshot',public.fixture_observation()||'{"expectedBindingETag":"v2","etag":"v3","observationHash":"h3"}'::jsonb)->>'status','deferred','unfinished provider write owns publication authority');
delete from private.calendar_provider_series_operations where id='00000000-0000-4000-8000-000000009921';
update public.calendar_auth_tokens set is_active=false where id='00000000-0000-4000-8000-000000009912';
select throws_ok($$select public.fixture_reconcile('bindings','{}')$$,'42501','Provider source reconciliation denied','credential revocation denies observed-series reads too');
update public.calendar_auth_tokens set is_active=true where id='00000000-0000-4000-8000-000000009912';
select is(public.fixture_reconcile('deleted','{"masterId":"provider-master","expectedBindingETag":"v1"}')->>'status','deferred','stale deletion cannot erase refreshed master');
select is(public.fixture_reconcile('deleted','{"masterId":"provider-master","expectedBindingETag":"v2"}')->>'status','deleted','authoritative removed master tombstones canonical series');
select ok((select deleted_at is not null from private.calendar_event_series),'deleted master is hidden from current recurrence reads');
select * from finish();
rollback;
