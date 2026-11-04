-- Selene R2 on 20261104123000: revocation scope, NULL actors, runner owner
-- immutability, loud prerequisite failures and the bounded sweep.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
update private.devbox_control_settings set personal_pools_enabled = true where id;

-- U1 root fleet owner; U2 personal grantee; U3 root member with a pending
-- grant row; U4 learner with a pending grant row; U5 never authorized.
insert into public.users(id) values
 ('91000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000002'),
 ('91000000-0000-4000-8000-000000000003'),
 ('91000000-0000-4000-8000-000000000004'),
 ('91000000-0000-4000-8000-000000000005');
insert into public.workspace_members(ws_id,user_id,type) values
 ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000001','MEMBER'),
 ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000003','MEMBER');
insert into private.devbox_runners(id,actor_id,name,pool,status,heartbeat_enabled,last_heartbeat_at,capabilities,enabled_features) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','r2-fleet','fleet','online',true,now(),'{"executionMode":"trusted"}','{"run":true,"build":true}'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','r2-personal','personal','online',true,now(),'{"executionMode":"trusted"}','{"run":true,"build":true}'),
 ('92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','r2-judge','fleet','online',true,now(),'{"executionMode":"judge-only","judge":{"ready":true,"languages":["python"]}}','{"judge":true}');
insert into private.devbox_personal_pool_grants(user_id,status,accepted_at,expires_at,suspended) values
 ('91000000-0000-4000-8000-000000000002','active',now(),now()+interval '1 hour',false),
 ('91000000-0000-4000-8000-000000000003','pending',null,now()+interval '1 hour',false),
 ('91000000-0000-4000-8000-000000000004','pending',null,now()+interval '1 hour',false);

-- One lease and one run per probe, recorded by label.
create temp table work(label text primary key, run_id uuid, lease_id uuid);
create function pg_temp.work(p_label text,p_actor uuid,p_workload text,p_status text,
    p_lease_runner uuid,p_run_runner uuid default null,p_keep boolean default false)
returns void language plpgsql as $$
declare l uuid:=gen_random_uuid(); r uuid:=gen_random_uuid();
begin
    insert into private.devbox_leases(id,actor_id,runner_id,keep,expires_at)
        values(l,p_actor,p_lease_runner,p_keep,now()+interval '1 hour');
    if p_workload is not null then
        insert into private.devbox_runs(id,actor_id,lease_id,runner_id,workload,status,command)
            values(r,p_actor,l,p_run_runner,p_workload,p_status,
                case p_workload when 'judge' then array['__ttr_judge_v1__','x']
                    when 'playground' then array['__ttr_playground_v1__','x']
                    else array['echo',p_label] end);
    else r := null;
    end if;
    insert into work values(p_label,r,l);
end $$;
create function pg_temp.run_status(p_label text) returns text language sql as
    $$ select r.status from private.devbox_runs r join work w on w.run_id=r.id where w.label=p_label $$;
create function pg_temp.lease_status(p_label text) returns text language sql as
    $$ select l.status from private.devbox_leases l join work w on w.lease_id=l.id where w.label=p_label $$;
create function pg_temp.revocations(p_actor uuid) returns bigint language sql as
    $$ select count(*) from private.devbox_run_events e join private.devbox_runs r on r.id=e.run_id
       where r.actor_id=p_actor and e.event_type='access_revoked' $$;

-- U3 (root) fleet work; U4 learner Judge/playground work and a keep lease.
select pg_temp.work('u3 fleet queued','91000000-0000-4000-8000-000000000003','run','queued',null);
select pg_temp.work('u3 fleet running','91000000-0000-4000-8000-000000000003','build','running',
    '92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001');
select pg_temp.work('u4 judge queued','91000000-0000-4000-8000-000000000004','judge','queued','92000000-0000-4000-8000-000000000003');
select pg_temp.work('u4 judge running','91000000-0000-4000-8000-000000000004','judge','running',
    '92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000003');
select pg_temp.work('u4 playground queued','91000000-0000-4000-8000-000000000004','playground','queued','92000000-0000-4000-8000-000000000003');
select pg_temp.work('u4 keep lease','91000000-0000-4000-8000-000000000004',null,null,null,null,true);

create function pg_temp.untouched(p_case text) returns setof text language plpgsql as $$
begin
    return next is(pg_temp.run_status('u3 fleet queued'),'queued',p_case||': root fleet queued run untouched');
    return next is(pg_temp.run_status('u3 fleet running'),'running',p_case||': root fleet running run untouched');
    return next is(pg_temp.run_status('u4 judge queued'),'queued',p_case||': learner Judge queued run untouched');
    return next is(pg_temp.run_status('u4 judge running'),'running',p_case||': learner Judge running run untouched');
    return next is(pg_temp.run_status('u4 playground queued'),'queued',p_case||': learner playground run untouched');
    return next is(pg_temp.lease_status('u4 keep lease'),'active',p_case||': learner keep lease untouched');
    return next is(pg_temp.lease_status('u3 fleet queued'),'active',p_case||': root fleet lease untouched');
    return next is(pg_temp.revocations('91000000-0000-4000-8000-000000000003')
        + pg_temp.revocations('91000000-0000-4000-8000-000000000004'),0::bigint,p_case||': no revocation events');
end $$;

-- M1: editing a grant that was never active cancels nothing.
update private.devbox_personal_pool_grants set expires_at=now()+interval '2 hours'
    where user_id in ('91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000004');
select * from pg_temp.untouched('pending grant edited');
update private.devbox_personal_pool_grants set status='revoked'
    where user_id in ('91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000004');
select * from pg_temp.untouched('pending grant revoked');
-- M1: deleting a grant that was never active cancels nothing.
delete from private.devbox_personal_pool_grants
    where user_id in ('91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000004');
select * from pg_temp.untouched('pending grant deleted');

-- U2 personal run/build plus learner work and keep leases.
create function pg_temp.seed_u2(p_suffix text) returns void language plpgsql as $$
begin
    perform pg_temp.work('u2 personal queued run'||p_suffix,'91000000-0000-4000-8000-000000000002','run','queued','92000000-0000-4000-8000-000000000002');
    perform pg_temp.work('u2 personal queued build'||p_suffix,'91000000-0000-4000-8000-000000000002','build','queued',null,'92000000-0000-4000-8000-000000000002');
    perform pg_temp.work('u2 personal running'||p_suffix,'91000000-0000-4000-8000-000000000002','run','running',
        '92000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002');
    perform pg_temp.work('u2 personal keep'||p_suffix,'91000000-0000-4000-8000-000000000002',null,null,'92000000-0000-4000-8000-000000000002',null,true);
    perform pg_temp.work('u2 judge queued'||p_suffix,'91000000-0000-4000-8000-000000000002','judge','queued','92000000-0000-4000-8000-000000000003');
    perform pg_temp.work('u2 playground queued'||p_suffix,'91000000-0000-4000-8000-000000000002','playground','queued','92000000-0000-4000-8000-000000000003');
    perform pg_temp.work('u2 learner keep'||p_suffix,'91000000-0000-4000-8000-000000000002',null,null,null,null,true);
end $$;
create function pg_temp.personal_only(p_case text,p_suffix text) returns setof text language plpgsql as $$
begin
    return next is(pg_temp.run_status('u2 personal queued run'||p_suffix),'cancelled',p_case||': queued personal run cancelled');
    return next is(pg_temp.run_status('u2 personal queued build'||p_suffix),'cancelled',p_case||': queued personal build cancelled');
    return next is(pg_temp.run_status('u2 personal running'||p_suffix),'cancel_requested',p_case||': running personal run signalled');
    return next is((select count(*) from private.devbox_run_events e join work w on w.run_id=e.run_id
        where w.label like 'u2 personal %'||p_suffix and e.metadata->>'reason'='actor_access_revoked'),3::bigint,p_case||': each personal cancellation audited');
    return next is(pg_temp.lease_status('u2 personal queued run'||p_suffix),'released',p_case||': personal non-keep lease released');
    return next is(pg_temp.lease_status('u2 personal keep'||p_suffix),'active',p_case||': personal keep lease survives');
    return next is(pg_temp.run_status('u2 judge queued'||p_suffix),'queued',p_case||': Judge submission survives');
    return next is(pg_temp.lease_status('u2 judge queued'||p_suffix),'active',p_case||': Judge lease survives');
    return next is(pg_temp.run_status('u2 playground queued'||p_suffix),'queued',p_case||': playground run survives');
    return next is(pg_temp.lease_status('u2 learner keep'||p_suffix),'active',p_case||': learner keep lease survives');
    return next is((select count(*) from private.devbox_run_events e join work w on w.run_id=e.run_id
        where (w.label like 'u2 judge%'||p_suffix or w.label like 'u2 playground%'||p_suffix)),0::bigint,p_case||': learner work has no revocation events');
end $$;

select pg_temp.seed_u2(' a');
-- An edit that keeps the grant active cancels nothing.
update private.devbox_personal_pool_grants set expires_at=now()+interval '3 hours'
    where user_id='91000000-0000-4000-8000-000000000002';
select is(pg_temp.run_status('u2 personal queued run a'),'queued','active grant edit keeps personal work');
select is(pg_temp.revocations('91000000-0000-4000-8000-000000000002'),0::bigint,'active grant edit records no revocation');
-- M1: active -> inactive cancels only personal run/build work.
update private.devbox_personal_pool_grants set suspended=true where user_id='91000000-0000-4000-8000-000000000002';
select * from pg_temp.personal_only('active grant suspended',' a');
-- Re-activation is not a revocation.
update private.devbox_personal_pool_grants set suspended=false where user_id='91000000-0000-4000-8000-000000000002';
select is((select count(*) from private.devbox_run_events e join work w on w.run_id=e.run_id
    where w.label like '% a' and e.event_type='access_revoked'),3::bigint,'inactive -> active records no new revocation');
-- M1: deleting an ACTIVE grant is a revocation.
select pg_temp.seed_u2(' b');
delete from private.devbox_personal_pool_grants where user_id='91000000-0000-4000-8000-000000000002';
select * from pg_temp.personal_only('active grant deleted',' b');
select * from pg_temp.untouched('after personal revocations');

-- Decision 4 also scopes root-member removal: learner and keep leases stay.
select pg_temp.work('u3 judge queued','91000000-0000-4000-8000-000000000003','judge','queued','92000000-0000-4000-8000-000000000003');
select pg_temp.work('u3 keep lease','91000000-0000-4000-8000-000000000003',null,null,null,null,true);
delete from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='91000000-0000-4000-8000-000000000003';
select is(pg_temp.run_status('u3 fleet queued'),'cancelled','root removal cancels queued fleet work');
select is(pg_temp.run_status('u3 fleet running'),'cancel_requested','root removal signals running fleet work');
select is(pg_temp.lease_status('u3 fleet queued'),'released','root removal releases non-keep fleet lease');
select is(pg_temp.run_status('u3 judge queued'),'queued','root removal leaves learner Judge work');
select is(pg_temp.lease_status('u3 judge queued'),'active','root removal leaves learner Judge lease');
select is(pg_temp.lease_status('u3 keep lease'),'active','root removal leaves keep lease');

-- L1: a NULL actor never passes the ownership check.
select pg_temp.work('u1 fleet lease','91000000-0000-4000-8000-000000000001',null,null,null);
select throws_ok($$select private.check_devbox_write_ownership(null,(select lease_id from work where label='u1 fleet lease'),null,'run')$$,
    '42501',null,'NULL actor cannot use an existing lease');
select throws_ok($$select private.check_devbox_write_ownership(null,null,'92000000-0000-4000-8000-000000000003','judge')$$,
    '42501',null,'NULL actor cannot use a dedicated Judge runner');
select throws_ok($$select private.check_devbox_write_ownership(null,null,null,'run')$$,
    '42501',null,'NULL actor is denied without any reference');

-- L2: runner owner and pool are immutable.
select throws_ok($$update private.devbox_runners set actor_id='91000000-0000-4000-8000-000000000003' where id='92000000-0000-4000-8000-000000000001'$$,
    '42501','Devbox runner owner and pool are immutable.','runner actor_id change raises');
select throws_ok($$update private.devbox_runners set pool='fleet' where id='92000000-0000-4000-8000-000000000002'$$,
    '42501','Devbox runner owner and pool are immutable.','runner pool change raises');
select lives_ok($$update private.devbox_runners set actor_id=actor_id, pool=pool, updated_at=now() where id='92000000-0000-4000-8000-000000000001'$$,
    'unchanged owner and pool may be rewritten');
select is((select actor_id from private.devbox_runners where id='92000000-0000-4000-8000-000000000001'),
    '91000000-0000-4000-8000-000000000001'::uuid,'runner owner is unchanged');
select ok(pg_get_functiondef('private.check_devbox_write_ownership(uuid,uuid,uuid,text)'::regprocedure) ~* 'for key share',
    'runner reference check takes a key-share lock only');

-- Decision 3: the claim stays fail-closed and names its denial reason.
select ok(pg_get_functiondef('private.claim_next_devbox_run(uuid)'::regprocedure) ~ 'runner_owner_not_authorized',
    'claim logs runner_owner_not_authorized');
insert into private.devbox_runners(id,actor_id,name,pool,status,heartbeat_enabled,last_heartbeat_at,capabilities,enabled_features) values
 ('92000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000005','r2-orphan','fleet','online',true,now(),'{"executionMode":"judge-only","judge":{"ready":true,"languages":["python"]}}','{"judge":true}');
select is((select count(*) from private.claim_next_devbox_run('92000000-0000-4000-8000-000000000005')),0::bigint,
    'Judge runner whose owner left the root workspace claims nothing');

-- M2: the sweep is off the claim path and scans a capped window.
create function pg_temp.sweep(p_limit integer) returns jsonb language plpgsql as $$
declare v jsonb;
begin
    execute 'select to_jsonb(private.cancel_unauthorized_devbox_runs($1))' into v using p_limit;
    return v;
exception when others then
    return jsonb_build_object('error', sqlstate);
end $$;
update private.devbox_runs set status='cancelled' where status='queued';
create temp table sweep_probe(id uuid, authorized boolean);
create function pg_temp.seed_sweep() returns void language plpgsql as $$
declare i integer; a uuid; l uuid; r uuid;
begin
    truncate sweep_probe;
    for i in 1..8 loop
        a := case when i<=5 then '91000000-0000-4000-8000-000000000001'::uuid else '91000000-0000-4000-8000-000000000005'::uuid end;
        l := gen_random_uuid(); r := gen_random_uuid();
        insert into private.devbox_leases(id,actor_id,expires_at) values(l,a,now()+interval '1 hour');
        insert into private.devbox_runs(id,actor_id,lease_id,command,created_at)
            values(r,a,l,array['echo','sweep'],now()-make_interval(days=>20-i));
        insert into sweep_probe values(r,i<=5);
    end loop;
end $$;
select pg_temp.seed_sweep();
select is((select count(*) from private.claim_next_devbox_run('92000000-0000-4000-8000-000000000003')),0::bigint,'Judge runner poll claims no run work');
select is((select count(*) from private.devbox_runs r join sweep_probe p using(id) where not p.authorized and r.status='queued'),3::bigint,
    'claim poll does not run the sweep');
select is(pg_temp.sweep(5),'{"scanned": 5, "cancelled": 0}'::jsonb,'sweep scans only its capped window of oldest rows');
select is((select count(*) from private.devbox_runs r join sweep_probe p using(id) where not p.authorized and r.status='queued'),3::bigint,
    'rows beyond the scan cap are left for the next sweep');
select is(pg_temp.sweep(8),'{"scanned": 8, "cancelled": 3}'::jsonb,'a wider window cancels the unauthorized rows');
select is((select count(*) from private.devbox_runs r join sweep_probe p using(id) where p.authorized and r.status='queued'),5::bigint,
    'authorized rows stay queued');
select is((select count(*) from private.devbox_run_events e join sweep_probe p on p.id=e.run_id
    where not p.authorized and e.metadata->>'reason'='actor_access_revoked'),3::bigint,'sweep cancellations are audited');
select is(pg_temp.sweep(8),'{"scanned": 5, "cancelled": 0}'::jsonb,'a repeat sweep converges');
select is(pg_temp.sweep(0)->>'error','22023','sweep rejects a zero limit');
select is(pg_temp.sweep(1001)->>'error','22023','sweep rejects a limit above 1000');
select is(pg_temp.sweep(null)->>'error','22023','sweep rejects a NULL limit');
select ok(not has_function_privilege('anon','private.cancel_unauthorized_devbox_runs(integer)','EXECUTE')
    and not has_function_privilege('authenticated','private.cancel_unauthorized_devbox_runs(integer)','EXECUTE')
    and has_function_privilege('service_role','private.cancel_unauthorized_devbox_runs(integer)','EXECUTE'),
    'sweep execute is service role only');

-- S2: a missing prerequisite fails loudly instead of cancelling work.
update private.devbox_runs set status='cancelled' where status='queued';
select pg_temp.seed_sweep();
alter function private.devbox_identity_grant_active(uuid) rename to devbox_identity_grant_active_r2_saved;
select throws_ok($$select private.devbox_actor_has_active_personal_grant('91000000-0000-4000-8000-000000000005')$$,
    '42883',null,'missing shared predicate raises');
select is(pg_temp.sweep(8)->>'error','42883','sweep raises when the predicate is missing');
alter function private.devbox_identity_grant_active_r2_saved(uuid) rename to devbox_identity_grant_active;
alter table private.devbox_personal_pool_grants rename to devbox_personal_pool_grants_r2_saved;
select throws_ok($$select private.devbox_actor_has_active_personal_grant('91000000-0000-4000-8000-000000000005')$$,
    '42P01',null,'missing grant table raises');
alter table private.devbox_personal_pool_grants_r2_saved rename to devbox_personal_pool_grants;
select is((select count(*) from private.devbox_runs r join sweep_probe p using(id) where not p.authorized and r.status='queued'),3::bigint,
    'no work was cancelled while the prerequisite was missing');
select ok(exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.devbox_personal_pool_grants'::regclass
    and tgname='cancel_devbox_runs_on_grant_revocation' and not tgisinternal),'grant revocation hook is attached');
select * from finish();
rollback;
