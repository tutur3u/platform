-- Apply 20261026145000, 20261026145100, 20261026145200, then 20261026145300.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

insert into public.users (id)
values ('00000000-0000-4000-8000-00000000d001');

-- Runner A is healthy; runner B stopped heartbeating 30 minutes ago.
insert into private.devbox_runners (
    id, actor_id, name, status, heartbeat_enabled, last_heartbeat_at,
    capabilities, enabled_features
)
values
    ('00000000-0000-4000-8000-00000000d0a1',
        '00000000-0000-4000-8000-00000000d001', 'healthy', 'online', true,
        now(), '{"judge":{"ready":true,"languages":["python"]}}',
        '{"run":true,"judge":true}'),
    ('00000000-0000-4000-8000-00000000d0b1',
        '00000000-0000-4000-8000-00000000d001', 'lost', 'online', true,
        now() - interval '30 minutes', '{}', '{"run":true}');

insert into private.devbox_leases (id, actor_id, status, keep, expires_at)
values
    ('00000000-0000-4000-8000-00000000d100',
        '00000000-0000-4000-8000-00000000d001', 'active', true,
        now() + interval '1 hour'),
    ('00000000-0000-4000-8000-00000000d101',
        '00000000-0000-4000-8000-00000000d001', 'active', false,
        now() + interval '1 hour');

insert into private.devbox_runs (
    id, actor_id, lease_id, runner_id, status, workload, command,
    timeout_seconds, started_at, updated_at
)
values
    -- Timed out on the healthy runner.
    ('00000000-0000-4000-8000-00000000d201',
        '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d101',
        '00000000-0000-4000-8000-00000000d0a1', 'running', 'judge',
        array['__ttr_judge_v1__', 'stale'], 60,
        now() - interval '20 minutes', now() - interval '20 minutes'),
    -- Cancellation never acknowledged.
    ('00000000-0000-4000-8000-00000000d202',
        '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d100',
        '00000000-0000-4000-8000-00000000d0a1', 'cancel_requested', 'run',
        array['sleep', '1'], null,
        now() - interval '15 minutes', now() - interval '15 minutes'),
    -- Long-running serve without a timeout on a healthy runner stays.
    ('00000000-0000-4000-8000-00000000d203',
        '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d100',
        '00000000-0000-4000-8000-00000000d0a1', 'running', 'serve',
        array['bun', 'dev'], null,
        now() - interval '30 minutes', now() - interval '30 minutes'),
    -- Runner B lost its heartbeat.
    ('00000000-0000-4000-8000-00000000d204',
        '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d100',
        '00000000-0000-4000-8000-00000000d0b1', 'running', 'run',
        array['sleep', '1'], null,
        now() - interval '30 minutes', now() - interval '30 minutes'),
    -- Within its timeout.
    ('00000000-0000-4000-8000-00000000d205',
        '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d100',
        '00000000-0000-4000-8000-00000000d0a1', 'running', 'run',
        array['sleep', '1'], 3600,
        now() - interval '1 minute', now() - interval '1 minute'),
    -- Already terminal.
    ('00000000-0000-4000-8000-00000000d206',
        '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d100',
        '00000000-0000-4000-8000-00000000d0a1', 'succeeded', 'run',
        array['true'], 60,
        now() - interval '2 hours', now() - interval '2 hours');

select ok(
    not has_function_privilege('authenticated',
        'private.reap_stale_devbox_runs(uuid,integer)', 'EXECUTE'),
    'browser roles cannot invoke the reaper'
);

select is(
    private.reap_stale_devbox_runs('00000000-0000-4000-8000-00000000d0a1', 100),
    2,
    'runner-scoped reap fails timed-out and unacknowledged cancel runs'
);
select is(
    (select status from private.devbox_runs
        where id = '00000000-0000-4000-8000-00000000d201'),
    'failed', 'timed-out run is failed'
);
select is(
    (select status from private.devbox_runs
        where id = '00000000-0000-4000-8000-00000000d202'),
    'cancelled', 'unacknowledged cancellation is finalised as cancelled'
);
select is(
    (select array_agg(status order by id) from private.devbox_runs
        where id in ('00000000-0000-4000-8000-00000000d203',
            '00000000-0000-4000-8000-00000000d204',
            '00000000-0000-4000-8000-00000000d205',
            '00000000-0000-4000-8000-00000000d206')),
    array['running', 'running', 'running', 'succeeded'],
    'healthy, out-of-scope and terminal runs are untouched'
);
select is(
    (select status from private.devbox_leases
        where id = '00000000-0000-4000-8000-00000000d101'),
    'released', 'non-kept lease of a reaped run is released'
);
select is(
    (select status from private.devbox_leases
        where id = '00000000-0000-4000-8000-00000000d100'),
    'active', 'kept lease survives reaping'
);
select is(
    (select count(*)::integer from private.devbox_run_events
        where event_type = 'reaped'),
    2, 'each reaped run records one reaper event'
);
select is(
    private.reap_stale_devbox_runs('00000000-0000-4000-8000-00000000d0a1', 100),
    0, 'repeating the reap is a no-op'
);

select is(
    private.reap_stale_devbox_runs(null, 100),
    1, 'global sweep fails runs on an unreachable runner'
);
select is(
    (select status from private.devbox_runs
        where id = '00000000-0000-4000-8000-00000000d204'),
    'failed', 'unreachable runner run is failed'
);

-- Bounded: three more stranded runs, one per call.
insert into private.devbox_runs (
    actor_id, lease_id, runner_id, status, command, started_at, updated_at
)
select '00000000-0000-4000-8000-00000000d001',
    '00000000-0000-4000-8000-00000000d100',
    '00000000-0000-4000-8000-00000000d0b1', 'running', array['sleep', '1'],
    now() - interval '1 hour', now() - interval '1 hour'
from generate_series(1, 3);
select is(private.reap_stale_devbox_runs(null, 1), 1, 'limit caps one call');
select is(private.reap_stale_devbox_runs(null, 0), 1,
    'non-positive limits still make bounded progress');

-- A stranded Judge run no longer blocks the runner's only sandbox slot.
insert into private.devbox_runs (
    id, actor_id, lease_id, runner_id, status, workload, command,
    timeout_seconds, started_at, updated_at, created_at
)
values
    ('00000000-0000-4000-8000-00000000d207',
        '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d100',
        '00000000-0000-4000-8000-00000000d0a1', 'running', 'judge',
        array['__ttr_judge_v1__', 'stranded'], 60,
        now() - interval '40 minutes', now() - interval '40 minutes',
        now() - interval '40 minutes'),
    ('00000000-0000-4000-8000-00000000d208',
        '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d100', null, 'queued', 'judge',
        array['__ttr_judge_v1__', 'next'], 60, null, now(), now());
select is(
    (select id from private.claim_next_devbox_run(
        '00000000-0000-4000-8000-00000000d0a1')),
    '00000000-0000-4000-8000-00000000d208'::uuid,
    'claim reaps stranded capacity before admitting the next Judge run'
);
select is(
    (select status from private.devbox_runs
        where id = '00000000-0000-4000-8000-00000000d207'),
    'failed', 'stranded Judge run is failed by the claim path'
);
select is(
    (select status from private.devbox_runs
        where id = '00000000-0000-4000-8000-00000000d203'),
    'running', 'claim path leaves healthy long-running runs alone'
);

-- One claim must reap at most 25 runs and never sweep another runner.
insert into private.devbox_runs (
    actor_id, lease_id, runner_id, status, command, timeout_seconds, started_at, updated_at
)
select '00000000-0000-4000-8000-00000000d001',
    '00000000-0000-4000-8000-00000000d100',
    '00000000-0000-4000-8000-00000000d0a1', 'running', array['sleep', '1'], 1,
    now() - interval '1 hour', now() - interval '1 hour'
from generate_series(1, 30);
create temp table before_claim as
select count(*)::integer as failed from private.devbox_runs
where runner_id = '00000000-0000-4000-8000-00000000d0a1' and status = 'failed';
create temp table foreign_before as
select id, status from private.devbox_runs
where runner_id = '00000000-0000-4000-8000-00000000d0b1';
select count(*) from private.claim_next_devbox_run('00000000-0000-4000-8000-00000000d0a1');
select is((select count(*)::integer from private.devbox_runs
    where runner_id = '00000000-0000-4000-8000-00000000d0a1' and status = 'failed')
    - (select failed from before_claim), 25, 'one claim reaps exactly 25 of 30 stranded runs');
select is((select count(*)::integer from private.devbox_runs
    where runner_id = '00000000-0000-4000-8000-00000000d0a1'
        and status = 'running' and timeout_seconds = 1), 5, 'claim leaves the bounded remainder');
select ok(not exists (select 1 from foreign_before b join private.devbox_runs r on r.id = b.id
    where r.status <> b.status), 'claim self-reap leaves foreign-runner runs untouched');

-- A non-kept lease stays active while a queued or running sibling needs it.
insert into private.devbox_leases (id, actor_id, runner_id, status, keep, expires_at)
values ('00000000-0000-4000-8000-00000000d102',
    '00000000-0000-4000-8000-00000000d001',
    '00000000-0000-4000-8000-00000000d0a1', 'active', false, now() + interval '1 hour');
insert into private.devbox_runs (
    id, actor_id, lease_id, runner_id, status, workload, command,
    timeout_seconds, started_at, updated_at
)
values
    ('00000000-0000-4000-8000-00000000d209', '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d102', '00000000-0000-4000-8000-00000000d0a1',
        'running', 'run', array['sleep', '1'], 1, now() - interval '1 hour', now() - interval '1 hour'),
    ('00000000-0000-4000-8000-00000000d20a', '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000d102', '00000000-0000-4000-8000-00000000d0a1',
        'queued', 'run', array['echo', 'queued sibling'], null, null, now());
select is(private.reap_stale_devbox_runs('00000000-0000-4000-8000-00000000d0a1', 100),
    6, 'reap finishes stale siblings and the bounded remainder');
select is((select status from private.devbox_leases where id = '00000000-0000-4000-8000-00000000d102'),
    'active', 'queued sibling retains its non-kept lease');
select is((select id from private.claim_next_devbox_run('00000000-0000-4000-8000-00000000d0a1')),
    '00000000-0000-4000-8000-00000000d20a'::uuid, 'queued sibling is still claimable');
-- A second stale run shares the now-running sibling's lease.
insert into private.devbox_runs (
    id, actor_id, lease_id, runner_id, status, workload, command,
    timeout_seconds, started_at, updated_at
)
values ('00000000-0000-4000-8000-00000000d20b', '00000000-0000-4000-8000-00000000d001',
    '00000000-0000-4000-8000-00000000d102', '00000000-0000-4000-8000-00000000d0a1',
    'running', 'run', array['sleep', '1'], 1, now() - interval '1 hour', now() - interval '1 hour');
select is(private.reap_stale_devbox_runs('00000000-0000-4000-8000-00000000d0a1', 100),
    1, 'reap finishes the next stale sibling');
select is((select status from private.devbox_leases where id = '00000000-0000-4000-8000-00000000d102'),
    'active', 'running sibling retains its non-kept lease');
update private.devbox_runs set status = 'cancel_requested', updated_at = now() - interval '20 minutes'
where id = '00000000-0000-4000-8000-00000000d20a';
select private.reap_stale_devbox_runs('00000000-0000-4000-8000-00000000d0a1', 100);
select is((select status from private.devbox_leases where id = '00000000-0000-4000-8000-00000000d102'),
    'released', 'last active sibling being reaped releases the non-kept lease');

select * from finish();
rollback;
