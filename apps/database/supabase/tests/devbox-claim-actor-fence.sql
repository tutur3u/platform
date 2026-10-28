begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
-- A compatibility-only fixture lets the same behavior probes run on main.
alter table private.devbox_runners add column if not exists pool text not null default 'fleet';
insert into public.users(id) values
 ('71000000-0000-4000-8000-000000000001'),
 ('71000000-0000-4000-8000-000000000002'),
 ('71000000-0000-4000-8000-000000000003');
insert into public.workspace_members(ws_id,user_id,type) values
 ('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000001','MEMBER'),
 ('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000002','MEMBER');
insert into private.devbox_runners(id,actor_id,name,pool,status,heartbeat_enabled,last_heartbeat_at,capabilities,enabled_features) values
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','fleet-a','fleet','online',true,now(),'{"executionMode":"trusted"}','{"run":true,"build":true}'),
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','personal-b','personal','online',true,now(),'{"executionMode":"trusted"}','{"run":true,"build":true}');
-- Isolate each claim in a rolled-back subtransaction, preserving a single queue.
create function pg_temp.claims(p_runner uuid,p_actor uuid,p_workload text,p_pin uuid default null)
returns boolean language plpgsql as $$
declare l uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); result boolean;
begin
  begin
    insert into private.devbox_leases(id,actor_id,status,expires_at,runner_id)
      values(l,p_actor,'active',now()+interval '1 hour',p_pin);
    insert into private.devbox_runs(id,actor_id,lease_id,workload,command,runner_id)
      values(r,p_actor,l,p_workload,array['echo','ownership'],p_pin);
    result:=exists(select 1 from private.claim_next_devbox_run(p_runner) c where c.id=r);
    raise exception using errcode='P0004';
  exception when assert_failure then null; end;
  return result;
end $$;
select ok(not pg_temp.claims('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','run'),'personal runner never claims another root member run');
select ok(pg_temp.claims('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','run'),'personal runner claims own unpinned run');
select ok(pg_temp.claims('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','run'),'fleet runner claims current root member run');
select ok(not pg_temp.claims('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','maintenance'),'personal runner rejects unpinned foreign maintenance');
select ok(not pg_temp.claims('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','maintenance'),'personal maintenance requires an explicit pin');
select ok(pg_temp.claims('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','maintenance','72000000-0000-4000-8000-000000000002'),'personal owner can claim explicitly pinned maintenance');
select ok(pg_temp.claims('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','maintenance'),'infra maintenance remains available on fleet');
select ok(not pg_temp.claims('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','run'),'no grant is never fleet eligibility');
-- Queued before membership revocation; fleet cannot claim it afterwards.
insert into private.devbox_leases(id,actor_id,status,expires_at) values
 ('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','active',now()+interval '1 hour');
insert into private.devbox_runs(id,actor_id,lease_id,command) values
 ('74000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001',array['echo','before revoke']);
delete from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='71000000-0000-4000-8000-000000000002';
select is((select count(*) from private.claim_next_devbox_run('72000000-0000-4000-8000-000000000001')),0::bigint,'removed member queued run never reaches fleet');
select is((select status from private.devbox_runs where id='74000000-0000-4000-8000-000000000001'),'cancelled','access revocation cancels queued runs transactionally');
select is((select status from private.devbox_leases where id='73000000-0000-4000-8000-000000000001'),'released','access revocation releases active leases');
select is((select count(*) from private.claim_next_devbox_run('72000000-0000-4000-8000-000000000002')),0::bigint,'runner owner membership is rechecked in database');
update private.devbox_runners set pool='fleet' where id='72000000-0000-4000-8000-000000000002';
select ok(not pg_temp.claims('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','run'),'fleet runner with removed owner cannot claim another current member run');
update private.devbox_runners set pool='personal' where id='72000000-0000-4000-8000-000000000002';
-- Re-establish B for subsequent independent ownership cases.
insert into public.workspace_members(ws_id,user_id,type) values('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000002','MEMBER');
insert into private.devbox_leases(id,actor_id,status,expires_at) values
 ('73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','active',now()+interval '1 hour');
select throws_ok($$insert into private.devbox_runs(actor_id,lease_id,command) values('71000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000002',array['echo'])$$,'42501','Devbox lease not found.','foreign lease run insert rejected');
select throws_ok($$insert into private.devbox_env_revisions(actor_id,lease_id) values('71000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000002')$$,'42501','Devbox lease not found.','foreign lease env revision rejected');
select lives_ok($$insert into private.devbox_runs(id,actor_id,lease_id,command) values('74000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002',array['echo'])$$,'own lease insert allowed');
select throws_ok($$update private.devbox_runs set lease_id='73000000-0000-4000-8000-000000000002' where id='74000000-0000-4000-8000-000000000001'$$,'42501','Devbox lease not found.','updating run to foreign lease rejected');
select throws_ok($$insert into private.devbox_leases(actor_id,runner_id,expires_at) values('71000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000001',now()+interval '1 hour')$$,'42501','Devbox runner is not available to this actor.','non-root actor cannot pin foreign fleet lease');
select throws_ok($$insert into private.devbox_leases(actor_id,runner_id,expires_at) values('71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002',now()+interval '1 hour')$$,'42501','Devbox runner is not available to this actor.','root actor cannot pin another personal runner');
select throws_ok($$insert into private.devbox_runs(actor_id,lease_id,runner_id,command) values('71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002',array['echo'])$$,'42501','Devbox runner is not available to this actor.','run cannot bypass personal runner pin ownership');
select throws_ok($$update private.devbox_leases set actor_id='71000000-0000-4000-8000-000000000002' where id='73000000-0000-4000-8000-000000000002'$$,'42501','Devbox lease ownership is immutable.','lease owner transfer cannot invalidate child ownership');
select throws_ok($$update private.devbox_runs set runner_id='72000000-0000-4000-8000-000000000002' where id='74000000-0000-4000-8000-000000000002'$$,'42501','Devbox runner is not available to this actor.','run UPDATE rejects foreign personal runner ownership');
select throws_ok($$update private.devbox_leases set runner_id='72000000-0000-4000-8000-000000000002' where id='73000000-0000-4000-8000-000000000002'$$,'42501','Devbox runner is not available to this actor.','lease UPDATE rejects foreign personal runner ownership');
select is((select runner_id from private.devbox_runs where id='74000000-0000-4000-8000-000000000002'),null::uuid,'rejected run pin UPDATE leaves runner unchanged');
select is((select runner_id from private.devbox_leases where id='73000000-0000-4000-8000-000000000002'),null::uuid,'rejected lease pin UPDATE leaves runner unchanged');
select lives_ok($$insert into private.devbox_env_revisions(actor_id,lease_id) values('71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002')$$,'own env revision remains allowed');
-- Exercise the contributor revoke hook without enabling contributor access.
create temp table contributor_grants(actor_id uuid,revoked_at timestamptz,expires_at timestamptz);
do $$ begin
 if to_regprocedure('private.cancel_devbox_runs_on_access_revocation()') is not null then
   execute 'create trigger revoke_grant after update or delete on contributor_grants for each row execute function private.cancel_devbox_runs_on_access_revocation()';
 end if;
end $$;
insert into contributor_grants values('71000000-0000-4000-8000-000000000001',null,now()+interval '1 hour');
update contributor_grants set revoked_at=now();
select is((select status from private.devbox_runs where id='74000000-0000-4000-8000-000000000002'),'cancelled','contributor grant revocation cancels queued work');
select is((select count(*) from private.claim_next_devbox_run('72000000-0000-4000-8000-000000000001')),0::bigint,'revoked contributor work cannot fall through to fleet');
select ok(not has_function_privilege('anon','private.claim_next_devbox_run(uuid)','EXECUTE') and not has_function_privilege('authenticated','private.claim_next_devbox_run(uuid)','EXECUTE') and has_function_privilege('service_role','private.claim_next_devbox_run(uuid)','EXECUTE'),'claim execute remains service role only');
select ok(pg_temp.claims('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','run','72000000-0000-4000-8000-000000000002'),'owned personal pin remains claimable');
select throws_ok($$insert into private.devbox_runs(actor_id,lease_id,command) values('71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000009999',array['echo'])$$,'42501','Devbox lease not found.','unknown lease fails closed');
select throws_ok($$update private.devbox_env_revisions set actor_id='71000000-0000-4000-8000-000000000002' where lease_id='73000000-0000-4000-8000-000000000002'$$,'42501','Devbox lease not found.','env revision actor cannot move to a foreign lease');
select throws_ok($$select private.set_devbox_runner_feature('72000000-0000-4000-8000-000000000002','judge',true)$$,'42501','Personal runners support only run and build','personal runner cannot enable pooled workloads');
-- SR-340: membership removal signals in-flight work without claiming process stop.
insert into private.devbox_leases(id,actor_id,status,expires_at) values('73000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000002','active',now()+interval '1 hour');
insert into private.devbox_runs(id,actor_id,lease_id,runner_id,status,command)
values('74000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000005','72000000-0000-4000-8000-000000000002','running',array['sleep','3600']);
delete from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='71000000-0000-4000-8000-000000000002';
select is((select status from private.devbox_runs where id='74000000-0000-4000-8000-000000000003'),'cancel_requested','member removal signals running work');
select ok(exists(select 1 from private.devbox_run_events where run_id='74000000-0000-4000-8000-000000000003' and metadata->>'reason'='actor_access_revoked'),'revocation records a durable reason');
-- Fixture the future grant contract without exposing contributor APIs.
create table if not exists private.devbox_personal_pool_grants(actor_id uuid primary key, revoked_at timestamptz,expires_at timestamptz not null);
do $$ begin
 if to_regprocedure('private.cancel_devbox_runs_on_access_revocation()') is not null and not exists(
    select 1 from pg_trigger where tgrelid='private.devbox_personal_pool_grants'::regclass and tgname='cancel_devbox_runs_on_access_revocation') then
    execute 'create trigger cancel_devbox_runs_on_access_revocation after update or delete on private.devbox_personal_pool_grants for each row execute function private.cancel_devbox_runs_on_access_revocation()';
 end if;
end $$;
insert into private.devbox_personal_pool_grants(actor_id,expires_at) values('71000000-0000-4000-8000-000000000003',now()+interval '1 hour');
insert into private.devbox_runners(id,actor_id,name,pool,status,heartbeat_enabled,last_heartbeat_at,capabilities,enabled_features)
values('72000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000003','grantee','personal','online',true,now(),'{"executionMode":"trusted"}','{"run":true}');
select ok(pg_temp.claims('72000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000003','run'),'active grantee can claim only own personal work');
select ok(not pg_temp.claims('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','run'),'active grant never authorizes fleet execution');
select ok(not pg_temp.claims('72000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000003','maintenance','72000000-0000-4000-8000-000000000003'),'personal grants never authorize maintenance');
insert into private.devbox_leases(id,actor_id,status,expires_at) values('73000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000003','active',now()+interval '1 hour');
insert into private.devbox_runs(id,actor_id,lease_id,status,command) values
 ('74000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000003','queued',array['echo']),
 ('74000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000003','running',array['sleep']);
update private.devbox_personal_pool_grants set revoked_at=now() where actor_id='71000000-0000-4000-8000-000000000003';
select is((select status from private.devbox_runs where id='74000000-0000-4000-8000-000000000004'),'cancelled','canonical grant revoke cancels queued work');
select is((select status from private.devbox_runs where id='74000000-0000-4000-8000-000000000005'),'cancel_requested','canonical grant revoke signals running work');
select ok(not pg_temp.claims('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','run'),'revoked grant cannot fall through to fleet');
-- Claim-time backstop cancels unauthorized rows inserted after the removal event.
insert into private.devbox_leases(id,actor_id,status,expires_at) values('73000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000003','active',now()+interval '1 hour');
insert into private.devbox_runs(id,actor_id,lease_id,command) values('74000000-0000-4000-8000-000000000006','71000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000004',array['echo']);
select is((select count(*) from private.claim_next_devbox_run('72000000-0000-4000-8000-000000000001')),0::bigint,'claim denies unauthorized run owner');
select is((select status from private.devbox_runs where id='74000000-0000-4000-8000-000000000006'),'cancelled','claim backstop cancels unauthorized queued row');
select ok(exists(select 1 from private.devbox_run_events where run_id='74000000-0000-4000-8000-000000000006' and metadata->>'reason'='actor_access_revoked'),'claim cancellation has a reason');
-- Learners have no root membership or active personal grant.
select ok(not exists(select 1 from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='71000000-0000-4000-8000-000000000003'),'Judge learner is not a root member');
insert into private.devbox_runners(id,actor_id,name,pool,status,heartbeat_enabled,last_heartbeat_at,capabilities,enabled_features)
values
 ('72000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000001','judge-a','fleet','online',true,now(),'{"executionMode":"judge-only","judge":{"ready":true,"languages":["python"]}}','{"judge":true}'),
 ('72000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000001','judge-b','fleet','offline',true,now(),'{"executionMode":"judge-only","judge":{"ready":true,"languages":["python"]}}','{"judge":true}');
-- Valid envelope but no linked submission: even a root actor is denied.
insert into private.devbox_leases(id,actor_id,status,expires_at) values
 ('73000000-0000-4000-8000-000000000006','71000000-0000-4000-8000-000000000001','active',now()+interval '1 hour');
insert into private.devbox_runs(id,actor_id,lease_id,workload,command) values
 ('74000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000006','judge',array['__ttr_judge_v1__','x']);
select is((select count(*) from private.claim_next_devbox_run('72000000-0000-4000-8000-000000000004')),0::bigint,'Judge envelope without linked submission is not claimable');
update private.devbox_runs set status='cancelled' where id='74000000-0000-4000-8000-000000000007';
create temp table learner_jobs_enqueued as
 select private.enqueue_learn_coding_execution(
   gen_random_uuid(),'71000000-0000-4000-8000-000000000003','two-sum','print(1)',
   array['__ttr_judge_v1__','x'],'python','test') as submission_id;
create temp table learner_jobs as
 select s.run_id, r.lease_id from learner_jobs_enqueued enqueued
 join private.learn_coding_submissions s on s.id=enqueued.submission_id
 join private.devbox_runs r on r.id=s.run_id;
select is((select count(*) from learner_jobs),1::bigint,'non-root learner enqueue passes lease and run ownership INSERT triggers');
select ok(exists(select 1 from private.claim_next_devbox_run('72000000-0000-4000-8000-000000000004') c join learner_jobs j on j.run_id=c.id),'non-root learner Judge claim passes run ownership UPDATE trigger');
select ok(exists(select 1 from private.devbox_runs r join learner_jobs j on j.run_id=r.id join private.devbox_leases l on l.id=r.lease_id where r.status='running' and r.runner_id='72000000-0000-4000-8000-000000000004' and l.runner_id=r.runner_id and r.actor_id=l.actor_id),'learner claim preserves run and lease actor and runner ownership');
update private.devbox_runs set status='completed' where id in (select run_id from learner_jobs);
create temp table learner_requeue_enqueued as
 select private.enqueue_learn_coding_execution(
   gen_random_uuid(),'71000000-0000-4000-8000-000000000003','two-sum','print(2)',
   array['__ttr_judge_v1__','x'],'python','test') as submission_id;
create temp table learner_requeue as
 select s.run_id, r.lease_id from learner_requeue_enqueued enqueued
 join private.learn_coding_submissions s on s.id=enqueued.submission_id
 join private.devbox_runs r on r.id=s.run_id;
select ok(exists(select 1 from private.devbox_runs r join learner_requeue j on j.run_id=r.id join private.devbox_leases l on l.id=r.lease_id where r.status='queued' and r.runner_id='72000000-0000-4000-8000-000000000004' and l.runner_id=r.runner_id),'learner requeue starts with both pins on first Judge runner');
select ok(private.set_devbox_runner_drain('72000000-0000-4000-8000-000000000004',true) is not null,'first learner Judge runner is draining');
update private.devbox_runners set status='online' where id='72000000-0000-4000-8000-000000000005';
select ok(exists(select 1 from private.claim_next_devbox_run('72000000-0000-4000-8000-000000000005') c join learner_requeue j on j.run_id=c.id),'second Judge runner claims non-root learner requeue');
select ok(exists(select 1 from private.devbox_runs r join learner_requeue j on j.run_id=r.id join private.devbox_leases l on l.id=r.lease_id where r.status='running' and r.runner_id='72000000-0000-4000-8000-000000000005' and l.runner_id=r.runner_id and r.actor_id=l.actor_id and l.actor_id='71000000-0000-4000-8000-000000000003'),'moved_lease passes ownership UPDATE trigger and retains learner actor');
select * from finish();
rollback;
