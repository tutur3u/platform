begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(8);
-- Real committed sessions live only in the disposable validation database.
-- Run this fixture as supabase_admin inside the isolated local database;
-- the normal pgTAP postgres role cannot authenticate dblink through local trust.
create extension if not exists dblink with schema extensions;
select dblink_connect('reap_enqueue', format('dbname=%L user=%L host=127.0.0.1', current_database(), current_user));
select dblink_connect('reap_sweep', format('dbname=%L user=%L host=127.0.0.1', current_database(), current_user));
select dblink_exec('reap_enqueue', $remote$
    set statement_timeout = '10s';
    begin;
    insert into public.users(id) values ('00000000-0000-4000-8000-00000000d301');
    insert into private.devbox_runners(id, actor_id, name, status, heartbeat_enabled, last_heartbeat_at)
    values ('00000000-0000-4000-8000-00000000d302', '00000000-0000-4000-8000-00000000d301', 'lease-race', 'online', true, now());
    insert into private.devbox_leases(id, actor_id, status, keep, expires_at)
    values ('00000000-0000-4000-8000-00000000d310', '00000000-0000-4000-8000-00000000d301', 'active', false, now() + interval '1 hour');
    insert into private.devbox_runs(id, actor_id, lease_id, runner_id, status, command, timeout_seconds, started_at)
    values ('00000000-0000-4000-8000-00000000d320', '00000000-0000-4000-8000-00000000d301',
        '00000000-0000-4000-8000-00000000d310', '00000000-0000-4000-8000-00000000d302', 'running', array['sleep','1'], 1, now() - interval '1 hour');
    commit;
    begin;
    insert into private.devbox_runs(id, actor_id, lease_id, status, command)
    values ('00000000-0000-4000-8000-00000000d321', '00000000-0000-4000-8000-00000000d301',
        '00000000-0000-4000-8000-00000000d310', 'queued', array['echo','sibling']);
$remote$);
select dblink_exec('reap_sweep', 'set statement_timeout = ''10s''');
create temp table race_sessions as select
    (select pid from dblink('reap_enqueue','select pg_backend_pid()') as r(pid integer)) as enqueue_pid,
    (select pid from dblink('reap_sweep','select pg_backend_pid()') as r(pid integer)) as sweep_pid;
create function pg_temp.await_devbox_block(p_waiter integer, p_holder integer)
returns boolean language plpgsql as $$
declare deadline timestamptz := clock_timestamp() + interval '2 seconds';
begin
    loop
        if p_holder = any(pg_blocking_pids(p_waiter)) then return true; end if;
        if clock_timestamp() >= deadline then return false; end if;
        perform pg_sleep(0.01);
    end loop;
end;
$$;
select dblink_send_query('reap_sweep', $$select private.reap_stale_devbox_runs('00000000-0000-4000-8000-00000000d302',25)$$);
select ok((select pg_temp.await_devbox_block(sweep_pid, enqueue_pid) from race_sessions),
    'reaper waits for the lease share lock held by enqueue');
select dblink_exec('reap_enqueue','commit');
select is((select n from dblink_get_result('reap_sweep') as r(n integer)),1,
    'reaper finishes the stale run after enqueue commits');
select * from dblink_get_result('reap_sweep') as r(n integer);
select is((select status from private.devbox_leases where id='00000000-0000-4000-8000-00000000d310'),
    'active','fresh post-lock snapshot preserves the newly committed queued sibling');

-- Reaper wins: an enqueue waiting on the lease must reject its released state.
select dblink_exec('reap_enqueue', $remote$
    update private.devbox_runs set status='cancelled' where id='00000000-0000-4000-8000-00000000d321';
    insert into private.devbox_runs(id, actor_id, lease_id, runner_id, status, command, timeout_seconds, started_at)
    values ('00000000-0000-4000-8000-00000000d322', '00000000-0000-4000-8000-00000000d301',
        '00000000-0000-4000-8000-00000000d310', '00000000-0000-4000-8000-00000000d302', 'cancel_requested', array['sleep','1'], 1, now() - interval '1 hour');
$remote$);
select dblink_exec('reap_sweep','begin');
select is((select n from dblink('reap_sweep', $$select private.reap_stale_devbox_runs('00000000-0000-4000-8000-00000000d302',25)$$) as r(n integer)),
    1,'reaper finalizes cancellation before releasing the final lease');
select dblink_send_query('reap_enqueue', $remote$
    insert into private.devbox_runs(id, actor_id, lease_id, status, command)
    values ('00000000-0000-4000-8000-00000000d323', '00000000-0000-4000-8000-00000000d301',
        '00000000-0000-4000-8000-00000000d310', 'queued', array['echo','too late']) returning id
$remote$);
select ok((select pg_temp.await_devbox_block(enqueue_pid, sweep_pid) from race_sessions),
    'enqueue waits for the reaper lease update lock');
select dblink_exec('reap_sweep','commit');
select * from dblink_get_result('reap_enqueue',false) as r(id uuid);
select matches(dblink_error_message('reap_enqueue'),'Devbox lease is no longer active',
    'enqueue rejects the lease released while it waited');
select * from dblink_get_result('reap_enqueue',false) as r(id uuid);
select is((select status from private.devbox_runs where id='00000000-0000-4000-8000-00000000d322'),
    'cancelled','current cancel-requested status is finalized as cancelled');
select ok(not exists(select 1 from private.devbox_runs where id='00000000-0000-4000-8000-00000000d323'),
    'no queued run is admitted on the released lease');
select dblink_exec('reap_enqueue', $remote$
    delete from private.devbox_runs where actor_id='00000000-0000-4000-8000-00000000d301';
    delete from private.devbox_leases where actor_id='00000000-0000-4000-8000-00000000d301';
    delete from private.devbox_runners where actor_id='00000000-0000-4000-8000-00000000d301';
$remote$);
select dblink_disconnect('reap_enqueue');
select dblink_disconnect('reap_sweep');

select * from finish();
rollback;
