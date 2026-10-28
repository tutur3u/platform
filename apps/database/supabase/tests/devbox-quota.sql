begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select is(private.devbox_quota_day('2026-10-28 16:59:59Z'),'2026-10-28'::date,'before Vietnam midnight');
select is(private.devbox_quota_day('2026-10-28 17:00:00Z'),'2026-10-29'::date,'Vietnam midnight resets');
select is(private.devbox_quota_reset('2026-10-28 16:59:59Z'),'2026-10-28 17:00:00Z'::timestamptz,'reset instant');
select is(private.reap_devbox_quota_runs(now(),100000),0,'reaper durable default OFF');
select is((select enabled from private.devbox_quota_reaper_progress),false,'no reaper enablement');
update private.devbox_quota_reaper_progress set enabled=true;
select is(private.reap_devbox_quota_runs(now(),25),0,'global OFF fence overrides enabled progress');
select ok((select last_tick is null from private.devbox_quota_reaper_progress),'OFF fence leaves progress untouched');
update private.devbox_quota_reaper_progress set enabled=false;
select is((select personal_pools_enabled from private.devbox_control_settings),false,'personal pools OFF');
select ok(not has_function_privilege('anon','private.create_personal_devbox_run(uuid,uuid,jsonb)','EXECUTE'),'anonymous denied');
select ok(not has_function_privilege('authenticated','private.reap_devbox_quota_runs(timestamptz,integer)','EXECUTE'),'client reaper denied');
select ok(not private.authenticate_devbox_host_collector(repeat('a',64)),'unknown collector denied');
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-00000000f001','s2-quota@example.invalid',now()),
 ('00000000-0000-4000-8000-00000000f002','s2-admin@example.invalid',now());
insert into public.users(id) values ('00000000-0000-4000-8000-00000000f001'),('00000000-0000-4000-8000-00000000f002') on conflict do nothing;
insert into private.devbox_personal_pool_grants(user_id,bound_email,granted_by,security_signoff_by,reason)
 values('00000000-0000-4000-8000-00000000f001','s2-quota@example.invalid',
 '00000000-0000-4000-8000-00000000f002','00000000-0000-4000-8000-00000000f002','disposable quota test');
select is((select expires_at-created_at from private.devbox_personal_pool_grants),interval '30 days','grant defaults to thirty days');
select is((select cpu_minutes_daily from private.devbox_personal_pool_grants),480,'CPU default');
select is((select max_concurrent_runs from private.devbox_personal_pool_grants),2,'run default');
update private.devbox_control_settings set personal_pools_enabled=true;
select ok(private.accept_devbox_personal_grant('00000000-0000-4000-8000-00000000f001'),'accept fixture');
update private.devbox_personal_pool_grants set last_collected_at=now();
create temp table s2_token as select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000f001',now(),'quota-test',repeat('f',64),'tdba_ffffffff',array['devbox:run'],now()+interval '1 day') id;
select lives_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from s2_token),'{}'::jsonb||jsonb_build_object('command',array['true'],'timeoutSeconds',60,'idempotencyKey','quota-test-first'))$q$,'first admission');
insert into private.devbox_runs(actor_id,lease_id,command,workload) select actor_id,lease_id,array['true'],'judge' from private.devbox_runs limit 1;
select lives_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from s2_token),jsonb_build_object('command',array['true'],'timeoutSeconds',60))$q$,'learner work does not consume second personal slot');
select throws_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from s2_token),jsonb_build_object('command',array['true'],'timeoutSeconds',60))$q$,'P0001','DEVBOX_LIMIT_REACHED','third admission refused');
select lives_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from s2_token),jsonb_build_object('command',array['true'],'idempotencyKey','quota-test-first'))$q$,'retry returns existing run while slots are full');
select is((select count(*) from private.devbox_leases where actor_id='00000000-0000-4000-8000-00000000f001'),2::bigint,'failed admission leaves no orphan lease');
select throws_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from s2_token),jsonb_build_object('command',array['true'],'timeoutSeconds',7201))$q$,'P0001','DEVBOX_LIMIT_EXCEEDS_GRANT','over-grant timeout');
select throws_ok($q$select private.request_devbox_quota_raise('00000000-0000-4000-8000-00000000f001','cpu_minutes_daily',1921,'test',now()+interval '1 day')$q$,'22023','Raise exceeds safety ceiling','raise hard ceiling');
select lives_ok($q$select private.request_devbox_quota_raise('00000000-0000-4000-8000-00000000f001','cpu_minutes_daily',960,'test',now()+interval '1 day')$q$,'bounded proposal');
select is(private.devbox_quota_limit('00000000-0000-4000-8000-00000000f001','cpu_minutes_daily'),480::numeric,'pending raise grants nothing');
select throws_ok($q$select private.decide_devbox_quota_raise((select id from private.devbox_quota_raise_requests limit 1),'00000000-0000-4000-8000-00000000f001',true)$q$,'42501','Root admin required','agent cannot approve own raise');
insert into public.workspaces(id,name,creator_id) values('00000000-0000-0000-0000-000000000000','Quota test root','00000000-0000-4000-8000-00000000f002') on conflict do nothing;
insert into public.workspace_members(ws_id,user_id,type) values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-00000000f002','MEMBER') on conflict do nothing;
select ok(private.decide_devbox_quota_raise((select id from private.devbox_quota_raise_requests limit 1),'00000000-0000-4000-8000-00000000f002',true),'root decision approves');
select is(private.devbox_quota_limit('00000000-0000-4000-8000-00000000f001','cpu_minutes_daily'),960::numeric,'approved bounded raise applied');
update private.devbox_quota_raise_requests set created_at=now()-interval '1 day',expires_at=now()-interval '1 second';
select is(private.devbox_quota_limit('00000000-0000-4000-8000-00000000f001','cpu_minutes_daily'),480::numeric,'expired raise falls back');
update private.devbox_personal_pool_grants set cpu_minutes_daily=1;
update private.devbox_runs set status='running' where actor_id='00000000-0000-4000-8000-00000000f001';
select is((select count(*) from private.devbox_runs where status='running' and workload='run'),2::bigint,'soft cap leaves in-flight runs active');
update private.devbox_runs set status='cancelled' where actor_id='00000000-0000-4000-8000-00000000f001';
select throws_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from s2_token),jsonb_build_object('command',array['true'],'timeoutSeconds',60))$q$,'P0001','DEVBOX_LIMIT_REACHED','daily CPU budget blocks new work');
update private.devbox_personal_pool_grants set cpu_minutes_daily=480,egress_blocked_until=now()+interval '1 hour';
select throws_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from s2_token),jsonb_build_object('command',array['true'],'timeoutSeconds',60))$q$,'P0001','DEVBOX_LIMIT_REACHED','daily egress block enforced');
update private.devbox_leases set status='released',released_at=now() where id=(select lease_id from private.devbox_runs where idempotency_key='quota-test-first');
select is(private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from s2_token),jsonb_build_object('command',array['true'],'idempotencyKey','quota-test-first'))#>>'{lease,status}','released','retry reports persisted lease state');

select throws_ok($q$update private.devbox_runs set workload='playground' where workload='judge'$q$,
 '42501','Personal run allocation is immutable','judge workload immutable');
select throws_ok($q$update private.devbox_runs set lease_id=gen_random_uuid() where workload='judge'$q$,
 '42501','Personal run allocation is immutable','judge lease immutable');
select is((select extract(epoch from expires_at-created_at)::integer/60 from private.devbox_leases limit 1),
 10,'keep false lease lasts ten minutes');
insert into public.workspace_members(ws_id,user_id,type)
 values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-00000000f001','MEMBER');
select throws_ok($q$select private.decide_devbox_quota_raise((select id from private.devbox_quota_raise_requests limit 1),
 '00000000-0000-4000-8000-00000000f001',true)$q$,
 '42501','Self decision refused','even root members cannot decide own raise');
delete from public.workspace_members where user_id='00000000-0000-4000-8000-00000000f001';
insert into private.devbox_quota_stops(user_id,reason) values('00000000-0000-4000-8000-00000000f001','hard_cpu');
select ok(private.reinstate_devbox_quota_grant('00000000-0000-4000-8000-00000000f001',
 '00000000-0000-4000-8000-00000000f002'),'admin reinstates');
select is((select count(*) from private.devbox_quota_stops),0::bigint,'admin clears stop');
select ok(exists(select 1 from private.devbox_grant_events where event_type='quota_stop:admin_cleared'),'clear audited');
select is((select status from private.devbox_personal_pool_grants),'pending','fresh acceptance required');
select ok(private.accept_devbox_personal_grant('00000000-0000-4000-8000-00000000f001'),'accept reinstatement');
update private.devbox_quota_reaper_progress set enabled=true;
update private.devbox_personal_pool_grants set last_collected_at=null;
select is(private.reap_devbox_quota_runs(now(),25),0,'no collector means no silent stop');
select is((select status from private.devbox_personal_pool_grants),'active','unregistered collector cannot suspend');

update private.devbox_personal_pool_grants set last_collected_at=now(),egress_blocked_until=null,max_concurrent_runs=1;

select throws_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',null,
 jsonb_build_object('command',array['true'],'timeoutSeconds',60))$q$,'42501','Devbox access token required','tokenless session refusal is atomic');
select is((select count(*) from private.devbox_leases),2::bigint,'session refusal creates no orphan lease');
create temp table fresh_token as select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000f001',now(),'fresh-test',repeat('d',64),'tdba_dddddddd',array['devbox:run'],now()+interval '1 day') id;
select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from fresh_token),
 jsonb_build_object('command',array['true'],'timeoutSeconds',60,'idempotencyKey','quota-future-workload'));
-- Simulate a future non-judge workload admitted through another trusted path.
alter table private.devbox_runs disable trigger devbox_identity_guard_run;
alter table private.devbox_runs disable trigger devbox_quota_guard_run;
update private.devbox_runs set workload='serve' where idempotency_key='quota-future-workload';
alter table private.devbox_runs enable trigger devbox_quota_guard_run;
alter table private.devbox_runs enable trigger devbox_identity_guard_run;
select throws_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from fresh_token),
 jsonb_build_object('command',array['true'],'timeoutSeconds',60))$q$,'P0001','DEVBOX_LIMIT_REACHED','serve consumes concurrency');
alter table private.devbox_runs disable trigger devbox_quota_guard_run;
update private.devbox_runs set status='running',started_at=clock_timestamp()-interval '2 minutes' where workload='serve';
alter table private.devbox_runs enable trigger devbox_quota_guard_run;
update private.devbox_quota_reaper_progress set last_tick=null,cursor_user_id=null;
select is(private.reap_devbox_quota_runs(now(),25),0,'runtime grace preserves run');
alter table private.devbox_runs disable trigger devbox_quota_guard_run;
update private.devbox_runs set started_at=clock_timestamp()-interval '7 minutes' where workload='serve';
alter table private.devbox_runs enable trigger devbox_quota_guard_run;
update private.devbox_quota_reaper_progress set last_tick=null,cursor_user_id=null;
select is(private.reap_devbox_quota_runs(now(),25),1,'non-judge overrun reaped after grace');
select is((select status from private.devbox_personal_pool_grants),'active','one overrun preserves grant');
select is((select count(*) from private.devbox_quota_stops),0::bigint,'one overrun creates no permanent stop');
select lives_ok($q$select private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f001',(select id from fresh_token),
 jsonb_build_object('command',array['true'],'timeoutSeconds',60))$q$,'admission after scoped failure');
select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000f001',now(),'expiry-test',repeat('e',64),'tdba_eeeeeeee',array['devbox:run'],now()+interval '1 day');
alter table private.devbox_personal_pool_grants disable trigger devbox_identity_cascade_grant;
alter table private.devbox_personal_pool_grants disable trigger devbox_identity_guard_grant;
update private.devbox_personal_pool_grants set created_at=now()-interval '1 day',expires_at=now()-interval '1 second';
alter table private.devbox_personal_pool_grants enable trigger devbox_identity_guard_grant;
alter table private.devbox_personal_pool_grants enable trigger devbox_identity_cascade_grant;
update private.devbox_quota_reaper_progress set last_tick=null,cursor_user_id=null;
select is(private.reap_devbox_quota_runs(now(),25),0,'reaper delegates expiry lifecycle');
select is((select status from private.devbox_personal_pool_grants),'expired','grant expired through lifecycle');
select is((select count(*) from private.devbox_runs where status='queued'),0::bigint,'expiry cancels queued runs');
select is((select count(*) from private.devbox_leases where status='active'),0::bigint,'expiry releases leases');
select is((select count(*) from private.devbox_access_tokens where revoked_at is null),0::bigint,'expiry revokes tokens');
select * from finish();
rollback;
