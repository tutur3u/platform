-- Devbox claim mode admission (migration 20261023110000).
begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

create temp table fx as select id as actor from public.users limit 1;

-- Runners: all online with a fresh heartbeat.
insert into private.devbox_runners (id, actor_id, name, status, heartbeat_enabled, last_heartbeat_at, capabilities, enabled_features)
select x.id::uuid, fx.actor, x.name, 'online', true, now(), x.capabilities::jsonb, x.features::jsonb
from fx, (values
    -- T: trusted, fresh report, run/build enabled.
    ('10000000-0000-4000-8000-000000000001', 'trusted', '{"executionMode": "trusted"}', '{"run": true, "build": true}'),
    -- M: run-enabled legacy agent with no reported mode.
    ('10000000-0000-4000-8000-000000000002', 'missing', '{}', '{"run": true}'),
    -- S: reported trusted, but the report goes stale below.
    ('10000000-0000-4000-8000-000000000003', 'stale', '{"executionMode": "trusted"}', '{"run": true}'),
    -- J: Judge-only identity reporting its mode.
    ('10000000-0000-4000-8000-000000000004', 'judge', '{"executionMode": "judge-only", "judge": {"ready": true, "languages": ["python"]}}', '{"judge": true}'),
    -- L: legacy Judge agent without a mode.
    ('10000000-0000-4000-8000-000000000005', 'legacy-judge', '{"judge": {"ready": true, "languages": ["python"]}}', '{"judge": true}'),
    -- X: Judge feature but a fresh trusted report (misconfigured).
    ('10000000-0000-4000-8000-000000000006', 'trusted-judge', '{"executionMode": "trusted", "judge": {"ready": true, "languages": ["python"]}}', '{"judge": true}')
) as x(id, name, capabilities, features);

-- A report older than the freshness window counts as unreported.
update private.devbox_runners
set capabilities_updated_at = now() - interval '10 minutes'
where id = '10000000-0000-4000-8000-000000000003';

-- Queues one unpinned run of a workload, asks a runner to claim it, then
-- removes it so every probe sees an otherwise empty queue.
create function pg_temp.claims(p_runner uuid, p_workload text)
returns boolean
language plpgsql
as $$
declare
    v_lease uuid := gen_random_uuid();
    v_run uuid := gen_random_uuid();
    v_claimed boolean;
begin
    insert into private.devbox_leases (id, actor_id, status, keep, expires_at)
    select v_lease, actor, 'active', false, now() + interval '30 minutes' from fx;
    insert into private.devbox_runs (id, actor_id, lease_id, status, workload, command)
    select v_run, actor, v_lease, 'queued', p_workload,
        case when p_workload = 'judge' then array['__ttr_judge_v1__', '{}'] else array['echo', 'ok'] end
    from fx;
    select exists (
        select 1 from private.claim_next_devbox_run(p_runner) claimed
        where claimed.id = v_run
    ) into v_claimed;
    delete from private.devbox_runs where id = v_run;
    delete from private.devbox_leases where id = v_lease;
    return v_claimed;
end;
$$;

select ok(not private.devbox_require_reported_execution_mode(), 'flag defaults off');
select ok(
    (select capabilities_updated_at > now() - interval '5 seconds' from private.devbox_runners where id = '10000000-0000-4000-8000-000000000001'),
    'inserting capabilities stamps a server-side report time'
);

-- Flag OFF: identical to the previous claim behavior.
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000001', 'run'), 'off: trusted runner claims run');
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000002', 'run'), 'off: unreported runner claims run');
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000003', 'run'), 'off: stale runner claims run');
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000006', 'judge'), 'off: trusted-reporting Judge runner claims judge');
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000005', 'judge'), 'off: legacy Judge claims judge');

-- Enabling refuses while run-enabled runners lack a fresh trusted report.
select throws_like(
    $$ select private.set_devbox_require_reported_execution_mode(true) $$,
    'Run-enabled runners have not reported executionMode=trusted%',
    'enabling refuses with unready run-enabled runners'
);
select ok(not private.devbox_require_reported_execution_mode(), 'refused enable leaves the flag off');
select is(
    private.set_devbox_require_reported_execution_mode(true, true) -> 'unready_runners',
    '["10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"]'::jsonb,
    'forced enable reports exactly the unready runners'
);

-- Flag ON.
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000001', 'run'), 'on: fresh trusted runner claims run');
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000001', 'build'), 'on: fresh trusted runner claims build');
select ok(not pg_temp.claims('10000000-0000-4000-8000-000000000002', 'run'), 'on: unreported runner cannot claim run');
select ok(not pg_temp.claims('10000000-0000-4000-8000-000000000003', 'run'), 'on: stale report cannot claim run');
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000004', 'judge'), 'on: judge-only runner claims judge');
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000005', 'judge'), 'on: legacy Judge without a mode claims judge');
select ok(not pg_temp.claims('10000000-0000-4000-8000-000000000006', 'judge'), 'on: fresh trusted report cannot claim judge');
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000002', 'maintenance'), 'on: maintenance is unchanged');
select ok(
    private.devbox_runner_mode_admits('{"executionMode": "trusted"}', now(), 'playground'),
    'on: playground admission is unchanged'
);

-- A heartbeat that changes capabilities refreshes the report.
update private.devbox_runners
set capabilities = '{"executionMode": "trusted", "reportedAt": "fresh"}'::jsonb
where id = '10000000-0000-4000-8000-000000000003';
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000003', 'run'), 'on: refreshed trusted report claims again');

-- Disabling restores the previous behavior.
select private.set_devbox_require_reported_execution_mode(false);
select ok(pg_temp.claims('10000000-0000-4000-8000-000000000002', 'run'), 'off again: unreported runner claims run');

select ok(
    not has_function_privilege('authenticated', 'private.set_devbox_require_reported_execution_mode(boolean, boolean)', 'execute')
    and not has_function_privilege('anon', 'private.devbox_runner_mode_admits(jsonb, timestamptz, text)', 'execute')
    and not has_table_privilege('authenticated', 'private.devbox_control_settings', 'select'),
    'flag and admission functions stay service-role only'
);

select * from finish();
rollback;
