-- Devbox drain hardening (migration 20261023103000).
begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

create temp table results (name text, ok boolean);
create temp table fx as select id as actor from public.users limit 1;

-- Judge runners: A supports python and rust, B only python. Both ready.
insert into private.devbox_runners (id, actor_id, name, status, heartbeat_enabled, last_heartbeat_at, capabilities, enabled_features)
  select x.id::uuid, fx.actor, x.name, 'online', true, now(), x.caps::jsonb,
    '{"run": false, "build": false, "serve": false, "tunnel": false, "judge": true, "playground": false}'::jsonb
  from fx, (values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'judge-a', '{"judge": {"ready": true, "languages": ["python", "rust"]}, "executionMode": "judge-only"}'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'judge-b', '{"judge": {"ready": true, "languages": ["python"]}, "executionMode": "judge-only"}')
  ) x(id, name, caps);

-- Leases on A: a live idle lease, an expired one, a kept one, and the lease
-- of a queued Judge run that has already expired.
insert into private.devbox_leases (id, actor_id, runner_id, status, keep, expires_at)
  select x.id::uuid, actor, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active', x.keep, now() + x.ttl::interval
  from fx, (values
    ('d1111111-1111-4111-8111-111111111111', false, '30 minutes'),
    ('d2222222-2222-4222-8222-222222222222', false, '-5 minutes'),
    ('d3333333-3333-4333-8333-333333333333', true, '2 hours'),
    ('d4444444-4444-4444-8444-444444444444', false, '-1 minute')
  ) x(id, keep, ttl);
insert into private.devbox_runs (id, actor_id, lease_id, runner_id, status, workload, command)
  select 'e4444444-4444-4444-8444-444444444444', actor, 'd4444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'queued', 'judge', array['__ttr_judge_v1__','{}'] from fx;

-- Activity ignores expired leases and reports kept leases separately.
insert into results select 'activity_counts_live_leases',
  (select queued_runs = 1 and active_leases = 1 and kept_leases = 1
   from private.devbox_runner_activity() where runner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

select ok(private.set_devbox_runner_drain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true) is not null, 'drain_requested');

-- Queued Judge work whose lease expired can never be requeued: drain cancels it.
insert into results select 'expired_judge_cancelled',
  (select status = 'cancelled' from private.devbox_runs where id = 'e4444444-4444-4444-8444-444444444444');
insert into results select 'kept_lease_survives_drain',
  (select status = 'active' from private.devbox_leases where id = 'd3333333-3333-4333-8333-333333333333');
insert into results select 'drained_ignores_kept_leases',
  (select queued_runs = 0 and running_runs = 0 and active_leases = 0 and kept_leases = 1
   from private.devbox_runner_activity() where runner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- New Judge enqueues skip the draining runner: python lands on B, and rust
-- (supported only by draining A) has no runner.
create temp table enqueued as
  select private.enqueue_learn_coding_execution(gen_random_uuid(), actor, 'two-sum', 'print(1)',
    array['__ttr_judge_v1__','x'], 'python', 'test') as submission_id from fx;
insert into results select 'enqueue_skips_draining_runner',
  (select run.runner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   from enqueued join private.learn_coding_submissions s on s.id = enqueued.submission_id
   join private.devbox_runs run on run.id = s.run_id);
create temp table raised (name text, message text);
do $$
begin
  begin
    perform private.enqueue_learn_coding_execution(gen_random_uuid(), (select actor from fx), 'two-sum', 'fn main(){}',
      array['__ttr_judge_v1__','x'], 'rust', 'test');
  exception when others then insert into raised values ('enqueue_rust', sqlerrm); end;
  -- Direct pins to the draining runner are rejected for non-maintenance work,
  -- whether pinned through the lease or the run.
  insert into private.devbox_leases (id, actor_id, runner_id, status, keep, expires_at)
    select 'd5555555-5555-4555-8555-555555555555', actor, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active', false, now() + interval '10 minutes' from fx;
  begin
    insert into private.devbox_runs (actor_id, lease_id, status, workload, command)
      select actor, 'd5555555-5555-4555-8555-555555555555', 'queued', 'run', array['echo','hi'] from fx;
  exception when others then insert into raised values ('lease_pinned_run', sqlerrm); end;
  begin
    insert into private.devbox_runs (actor_id, lease_id, runner_id, status, workload, command)
      select actor, 'd1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'queued', 'build', array['echo','hi'] from fx;
  exception when others then insert into raised values ('run_pinned_run', sqlerrm); end;
end $$;
insert into results select 'enqueue_without_live_runner_rejected',
  exists (select 1 from raised where name = 'enqueue_rust' and message = 'No ready Judge runner is available');
insert into results select 'lease_pin_rejected',
  exists (select 1 from raised where name = 'lease_pinned_run' and message like 'Runner is draining%');
insert into results select 'run_pin_rejected',
  exists (select 1 from raised where name = 'run_pinned_run' and message like 'Runner is draining%');

-- Maintenance may still be pinned to, and claimed by, the draining runner.
insert into private.devbox_runs (id, actor_id, lease_id, status, workload, command)
  select 'e5555555-5555-4555-8555-555555555555', actor, 'd5555555-5555-4555-8555-555555555555', 'queued', 'maintenance', array['__ttr_restart_agent_v1__'] from fx;
insert into results select 'draining_claims_maintenance',
  exists (select 1 from private.claim_next_devbox_run('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') c where c.id = 'e5555555-5555-4555-8555-555555555555');

-- Once the drain clears, A accepts pinned work again.
select ok(private.set_devbox_runner_drain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false) is null, 'drain_cleared');
insert into private.devbox_runs (id, actor_id, lease_id, status, workload, command)
  select 'e6666666-6666-4666-8666-666666666666', actor, 'd5555555-5555-4555-8555-555555555555', 'queued', 'run', array['echo','hi'] from fx;
insert into results select 'pin_allowed_after_clear',
  exists (select 1 from private.devbox_runs where id = 'e6666666-6666-4666-8666-666666666666');

insert into results select 'privileges_service_role_only',
  not has_function_privilege('authenticated', 'private.reject_devbox_run_on_draining_runner()', 'execute')
  and not has_function_privilege('anon', 'private.devbox_runner_activity()', 'execute')
  and not has_function_privilege('authenticated', 'private.devbox_runner_activity()', 'execute')
  and has_function_privilege('service_role', 'private.devbox_runner_activity()', 'execute');

select ok(coalesce(ok, false), name) from results order by name;

select * from finish();
rollback;
