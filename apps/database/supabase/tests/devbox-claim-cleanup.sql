begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select ok(to_regprocedure('private.devbox_identity_grant_active(uuid)') is not null,'real 152050 shared predicate is installed');
select ok(exists(select 1 from pg_catalog.pg_trigger
    where tgrelid='private.devbox_personal_pool_grants'::regclass
        and tgname='cancel_devbox_runs_on_access_revocation'),
    '152100 attaches cancellation hook to the real 152050 grant table');
update private.devbox_control_settings set personal_pools_enabled = true where id;

insert into public.users(id) values
 ('81000000-0000-4000-8000-000000000001'),
 ('81000000-0000-4000-8000-000000000002'),
 ('81000000-0000-4000-8000-000000000003');
insert into public.workspace_members(ws_id,user_id,type) values
 ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000001','MEMBER');
insert into private.devbox_runners(id,actor_id,name,pool,status,heartbeat_enabled,last_heartbeat_at,capabilities,enabled_features) values
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','cleanup-fleet','fleet','online',true,now(),'{"executionMode":"trusted"}','{"run":true}'),
 ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','cleanup-personal','personal','online',true,now(),'{"executionMode":"trusted"}','{"run":true}');

-- Each probe creates two unauthorized runs strictly ahead of one root member's
-- run. Check cancellation and its durable reason after the same claim call.
create temp table queue_probe(id uuid, authorized boolean);
create function pg_temp.seed_queue() returns void language plpgsql as $$
declare i integer; actor uuid; lease uuid; run uuid;
begin
    truncate queue_probe;
    for i in 1..3 loop
        actor := case when i=3 then '81000000-0000-4000-8000-000000000001'::uuid
            else ('81000000-0000-4000-8000-'||lpad((i+1)::text,12,'0'))::uuid end;
        lease := gen_random_uuid(); run := gen_random_uuid();
        insert into private.devbox_leases(id,actor_id,expires_at)
            values(lease,actor,now()+interval '1 hour');
        insert into private.devbox_runs(id,actor_id,lease_id,command,created_at)
            values(run,actor,lease,array['echo','cleanup'],now()-make_interval(mins=>4-i));
        insert into queue_probe values(run,i=3);
    end loop;
end $$;
create function pg_temp.check_queue(p_case text) returns setof text language plpgsql as $$
declare claimed uuid;
begin
    select c.id into claimed from private.claim_next_devbox_run('82000000-0000-4000-8000-000000000001') c;
    return next is(claimed,(select id from queue_probe where authorized),p_case||': authorized run claimed past two unauthorized runs');
    return next is((select count(*) from private.devbox_runs r join queue_probe q using(id)
        where not q.authorized and r.status='cancelled' and r.completed_at is not null),2::bigint,p_case||': both unauthorized runs cancelled');
    return next is((select count(*) from private.devbox_run_events e join queue_probe q on q.id=e.run_id
        where not q.authorized and e.event_type='access_revoked' and e.metadata->>'reason'='actor_access_revoked'),2::bigint,p_case||': both cancellations have audit reasons');
    perform private.cancel_unauthorized_devbox_runs(25);
    return next is((select count(*) from private.devbox_run_events e join queue_probe q on q.id=e.run_id
        where not q.authorized and e.metadata->>'reason'='actor_access_revoked'),2::bigint,p_case||': cleanup retry does not repeat audit events');
    update private.devbox_runs set status='succeeded' where id=claimed;
end $$;

select is(private.devbox_actor_has_active_personal_grant('81000000-0000-4000-8000-000000000002'),false,'zero grant rows are inactive');
select lives_ok($$select private.cancel_unauthorized_devbox_runs(25)$$,'zero grants cleanup does not raise');
select pg_temp.seed_queue();
select * from pg_temp.check_queue('zero grants');

alter function private.devbox_identity_grant_active(uuid) rename to devbox_identity_grant_active_test_saved;
select is(private.devbox_actor_has_active_personal_grant('81000000-0000-4000-8000-000000000002'),false,'missing shared predicate fails closed');
select pg_temp.seed_queue();
select * from pg_temp.check_queue('missing predicate');
alter function private.devbox_identity_grant_active_test_saved(uuid) rename to devbox_identity_grant_active;

alter table private.devbox_personal_pool_grants rename to devbox_personal_pool_grants_test_saved;
select is(private.devbox_actor_has_active_personal_grant('81000000-0000-4000-8000-000000000002'),false,'missing grant table fails closed');
select lives_ok($$select private.cancel_unauthorized_devbox_runs(25)$$,'missing grant table cleanup does not raise');
select pg_temp.seed_queue();
select * from pg_temp.check_queue('missing table');
alter table private.devbox_personal_pool_grants_test_saved rename to devbox_personal_pool_grants;

-- An authorization denial from the predicate is a per-actor inactive result,
-- without catching failures in cancellation or its audit insertion.
alter function private.devbox_identity_grant_active(uuid) rename to devbox_identity_grant_active_test_saved;
create function private.devbox_identity_grant_active(uuid) returns boolean language plpgsql as $$
begin raise exception 'Actor is no longer authorized.' using errcode='42501'; end $$;
revoke all on function private.devbox_identity_grant_active(uuid) from public, anon, authenticated;
grant execute on function private.devbox_identity_grant_active(uuid) to service_role;
select pg_temp.seed_queue();
select * from pg_temp.check_queue('authorization denial');
drop function private.devbox_identity_grant_active(uuid);
alter function private.devbox_identity_grant_active_test_saved(uuid) rename to devbox_identity_grant_active;

insert into private.devbox_personal_pool_grants(user_id,status,accepted_at,expires_at,suspended)
 values('81000000-0000-4000-8000-000000000002','active',now(),now()+interval '1 hour',false);
select is(private.devbox_actor_has_active_personal_grant('81000000-0000-4000-8000-000000000002'),true,'active shared grant is delegated by user_id');
create function pg_temp.personal_run(p_status text default 'queued') returns uuid language plpgsql as $$
declare lease uuid:=gen_random_uuid(); run uuid:=gen_random_uuid();
begin
    insert into private.devbox_leases(id,actor_id,expires_at)
        values(lease,'81000000-0000-4000-8000-000000000002',now()+interval '1 hour');
    insert into private.devbox_runs(id,actor_id,lease_id,status,command)
        values(run,'81000000-0000-4000-8000-000000000002',lease,p_status,array['echo','personal']);
    return run;
end $$;
create temp table personal_probe as select pg_temp.personal_run() id;
select is((select id from private.claim_next_devbox_run('82000000-0000-4000-8000-000000000002')),
    (select id from personal_probe),'active grant permits own personal claim');
update private.devbox_runs set status='succeeded' where id in(select id from personal_probe);
truncate personal_probe;
insert into personal_probe select pg_temp.personal_run();
insert into personal_probe select pg_temp.personal_run('running');
update private.devbox_personal_pool_grants set status='revoked' where user_id='81000000-0000-4000-8000-000000000002';
select is((select array_agg(r.status order by r.status) from private.devbox_runs r join personal_probe p using(id)),array['cancel_requested','cancelled'],'revoked user_id grant cancels queued work and signals running work');
select is((select count(*) from private.devbox_run_events e join personal_probe p on p.id=e.run_id where e.metadata->>'reason'='actor_access_revoked'),2::bigint,'revocation audits both affected runs');
select is((select count(*) from private.claim_next_devbox_run('82000000-0000-4000-8000-000000000002')),0::bigint,'revoked grant denies personal claim');

-- Re-activate for each independent invalidating field update.
create function pg_temp.invalidate_grant(p_field text) returns setof text language plpgsql as $$
declare run uuid; running_run uuid;
begin
    update private.devbox_personal_pool_grants set status='active',suspended=false,
        accepted_at=now(),expires_at=now()+interval '1 hour'
        where user_id='81000000-0000-4000-8000-000000000002';
    run := pg_temp.personal_run();
    running_run := pg_temp.personal_run('running');
    if p_field='suspended' then
        update private.devbox_personal_pool_grants set suspended=true where user_id='81000000-0000-4000-8000-000000000002';
    elsif p_field='pending' then
        update private.devbox_personal_pool_grants set status='pending' where user_id='81000000-0000-4000-8000-000000000002';
    elsif p_field='unaccepted' then
        update private.devbox_personal_pool_grants set accepted_at=null where user_id='81000000-0000-4000-8000-000000000002';
    elsif p_field='future acceptance' then
        update private.devbox_personal_pool_grants set accepted_at=now()+interval '1 minute' where user_id='81000000-0000-4000-8000-000000000002';
    elsif p_field='expired' then
        update private.devbox_personal_pool_grants set expires_at=now()-interval '1 minute' where user_id='81000000-0000-4000-8000-000000000002';
    end if;
    return next is(private.devbox_actor_has_active_personal_grant('81000000-0000-4000-8000-000000000002'),false,p_field||': shared predicate inactive');
    return next is((select status from private.devbox_runs where id=run),'cancelled',p_field||': queued run cancelled');
    return next ok(exists(select 1 from private.devbox_run_events where run_id=run and metadata->>'reason'='actor_access_revoked'),p_field||': cancellation audited');
    return next is((select status from private.devbox_runs where id=running_run),'cancel_requested',p_field||': running run signalled');
    return next ok(exists(select 1 from private.devbox_run_events where run_id=running_run and metadata->>'reason'='actor_access_revoked'),p_field||': running cancellation audited');
end $$;
select * from pg_temp.invalidate_grant('suspended');
select * from pg_temp.invalidate_grant('pending');
select * from pg_temp.invalidate_grant('unaccepted');
select * from pg_temp.invalidate_grant('future acceptance');
select * from pg_temp.invalidate_grant('expired');
select is((select count(*) from private.claim_next_devbox_run('82000000-0000-4000-8000-000000000002')),0::bigint,'inactive grant never claims personal work');
-- Disabling the shared switch denies claims even with an otherwise active grant.
update private.devbox_personal_pool_grants set status='active',suspended=false,
    accepted_at=now(),expires_at=now()+interval '1 hour'
    where user_id='81000000-0000-4000-8000-000000000002';
truncate personal_probe;
insert into personal_probe select pg_temp.personal_run();
update private.devbox_control_settings set personal_pools_enabled=false where id;
select is(private.devbox_actor_has_active_personal_grant('81000000-0000-4000-8000-000000000002'),false,'shared switch disables an active grant');
select is((select count(*) from private.claim_next_devbox_run('82000000-0000-4000-8000-000000000002')),0::bigint,'disabled switch refuses personal claim');
select is((select r.status from private.devbox_runs r join personal_probe p using(id)),'cancelled','disabled switch cancels queued personal work');
select ok(exists(select 1 from private.devbox_run_events e join personal_probe p on p.id=e.run_id
    where e.metadata->>'reason'='actor_access_revoked'),'disabled switch cancellation has an audit reason');
update private.devbox_control_settings set personal_pools_enabled=true where id;
delete from private.devbox_personal_pool_grants where user_id='81000000-0000-4000-8000-000000000002';
truncate personal_probe;
insert into personal_probe select pg_temp.personal_run();
select is((select count(*) from private.claim_next_devbox_run('82000000-0000-4000-8000-000000000002')),0::bigint,'no grant row denies own queued personal run');
select is((select r.status from private.devbox_runs r join personal_probe p using(id)),'cancelled','no grant row cancels personal run instead of rescanning');
select * from finish();
rollback;
