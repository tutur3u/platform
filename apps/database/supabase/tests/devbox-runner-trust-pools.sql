-- Devbox trust pools and drain (migration 20261023100000).
begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

create temp table results (name text, ok boolean);
-- Fixture actor: any seeded user.
create temp table fx as select id as actor from public.users limit 1;

-- S2: new runners default to every feature off.
insert into private.devbox_runners (id, actor_id, name, status)
  select '11111111-1111-4111-8111-111111111111', actor, 'new', 'registered' from fx;
insert into results select 'defaults_all_off',
  (select enabled_features = '{"run": false, "build": false, "serve": false, "tunnel": false, "judge": false, "playground": false}'::jsonb
   from private.devbox_runners where id = '11111111-1111-4111-8111-111111111111');

-- Judge runner A and B: online, judge ready, judge enabled (set directly as an existing row).
insert into private.devbox_runners (id, actor_id, name, status, heartbeat_enabled, last_heartbeat_at, capabilities, enabled_features)
  select x.id::uuid, fx.actor, x.name, 'online', true, now(),
    '{"judge": {"ready": true, "languages": ["python"]}, "executionMode": "judge-only"}'::jsonb,
    '{"run": false, "build": false, "serve": false, "tunnel": false, "judge": true, "playground": false}'::jsonb
  from fx, (values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','judge-a'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','judge-b')) x(id, name);
-- Requeue negatives, each differing from B in one dimension: L lacks the
-- submission language, M is a legacy mixed runner (judge + run), X reports
-- trusted mode.
insert into private.devbox_runners (id, actor_id, name, status, heartbeat_enabled, last_heartbeat_at, capabilities, enabled_features)
  select x.id::uuid, fx.actor, x.name, 'online', true, now(), x.caps::jsonb, x.features::jsonb
  from fx, (values
    ('a1111111-1111-4111-8111-111111111111', 'judge-go', '{"judge": {"ready": true, "languages": ["go"]}, "executionMode": "judge-only"}',
      '{"run": false, "build": false, "serve": false, "tunnel": false, "judge": true, "playground": false}'),
    ('a2222222-2222-4222-8222-222222222222', 'mixed', '{"judge": {"ready": true, "languages": ["python"]}}',
      '{"run": true, "build": false, "serve": false, "tunnel": false, "judge": true, "playground": false}'),
    ('a3333333-3333-4333-8333-333333333333', 'judge-trusted-mode', '{"judge": {"ready": true, "languages": ["python"]}, "executionMode": "trusted"}',
      '{"run": false, "build": false, "serve": false, "tunnel": false, "judge": true, "playground": false}'),
    -- Split mutual-exclusion paths: J1 has Judge enabled but reports no mode;
    -- J2 has nothing enabled but reports judge-only.
    ('a4444444-4444-4444-8444-444444444444', 'judge-feature-only', '{"judge": {"ready": true, "languages": ["python"]}}',
      '{"run": false, "build": false, "serve": false, "tunnel": false, "judge": true, "playground": false}'),
    ('a5555555-5555-4555-8555-555555555555', 'judge-mode-only', '{"executionMode": "judge-only"}',
      '{"run": false, "build": false, "serve": false, "tunnel": false, "judge": false, "playground": false}')
  ) x(id, name, caps, features);
-- Trusted runner T reporting trusted mode.
insert into private.devbox_runners (id, actor_id, name, status, heartbeat_enabled, last_heartbeat_at, capabilities)
  select 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', actor, 'trusted', 'online', true, now(), '{"executionMode": "trusted"}'::jsonb from fx;

-- S2: mutual exclusion and mode narrowing.
create temp table raised (name text, message text);
do $$
declare v text;
begin
  begin perform private.set_devbox_runner_feature('a4444444-4444-4444-8444-444444444444', 'run', true);
  exception when others then insert into raised values ('run_on_judge_feature', sqlerrm); end;
  begin perform private.set_devbox_runner_feature('a5555555-5555-4555-8555-555555555555', 'run', true);
  exception when others then insert into raised values ('run_on_judge_mode', sqlerrm); end;
  begin perform private.set_devbox_runner_feature('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'judge', true);
  exception when others then insert into raised values ('judge_on_trusted_mode', sqlerrm); end;
  update private.devbox_runners set capabilities = '{}'::jsonb, enabled_features = enabled_features || '{"judge": false}'::jsonb where id = '11111111-1111-4111-8111-111111111111';
  perform private.set_devbox_runner_feature('11111111-1111-4111-8111-111111111111', 'run', true);
  begin perform private.set_devbox_runner_feature('11111111-1111-4111-8111-111111111111', 'playground', true);
  exception when others then insert into raised values ('playground_on_run', sqlerrm); end;
  perform private.set_devbox_runner_feature('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'run', true);
end $$;
insert into results select 'run_on_judge_feature_rejected', exists (select 1 from raised where name = 'run_on_judge_feature' and message like 'Trusted workloads require%');
insert into results select 'run_on_judge_mode_rejected', exists (select 1 from raised where name = 'run_on_judge_mode' and message like 'Trusted workloads require%');
insert into results select 'judge_on_trusted_mode_rejected', exists (select 1 from raised where name = 'judge_on_trusted_mode' and message like 'Judge and playground require%');
insert into results select 'playground_on_run_rejected', exists (select 1 from raised where name = 'playground_on_run' and message like 'Judge and playground require a runner identity separate from trusted workloads%');
insert into results select 'trusted_run_allowed', (select (enabled_features ->> 'run')::boolean from private.devbox_runners where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');

-- S3 fixtures: Judge run + lease pinned to A; a trusted run pinned to A; an idle lease on A.
insert into private.devbox_leases (id, actor_id, runner_id, status, keep, expires_at)
  select x.id::uuid, actor, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active', false, now() + interval '30 minutes'
  from fx, (values ('d1111111-1111-4111-8111-111111111111'),('d2222222-2222-4222-8222-222222222222'),('d3333333-3333-4333-8333-333333333333')) x(id);
insert into private.devbox_runs (id, actor_id, lease_id, runner_id, status, workload, command)
  select 'e1111111-1111-4111-8111-111111111111', actor, 'd1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'queued', 'judge', array['__ttr_judge_v1__','{}'] from fx;
insert into private.learn_coding_submissions (ws_id, user_id, challenge_slug, source, run_id, kind, language)
  select gen_random_uuid(), actor, 'two-sum', 'print(1)', 'e1111111-1111-4111-8111-111111111111', 'test', 'python' from fx;
insert into private.devbox_runs (id, actor_id, lease_id, runner_id, status, workload, command)
  select 'e2222222-2222-4222-8222-222222222222', actor, 'd2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'queued', 'run', array['echo','hi'] from fx;

insert into results select 'activity_before',
  (select queued_runs = 2 and running_runs = 0 and active_leases = 3 from private.devbox_runner_activity() where runner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into results select 'drain_timestamp',
  private.set_devbox_runner_drain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true) is not null;
insert into results select 'trusted_pinned_cancelled',
  (select status = 'cancelled' and completed_at is not null from private.devbox_runs where id = 'e2222222-2222-4222-8222-222222222222')
  and exists (select 1 from private.devbox_run_events where run_id = 'e2222222-2222-4222-8222-222222222222' and message like 'Runner is draining%');
insert into results select 'idle_lease_released',
  (select status = 'released' from private.devbox_leases where id = 'd3333333-3333-4333-8333-333333333333')
  and (select status = 'active' from private.devbox_leases where id = 'd1111111-1111-4111-8111-111111111111');
insert into results select 'judge_still_queued', (select status = 'queued' from private.devbox_runs where id = 'e1111111-1111-4111-8111-111111111111');

-- Claims the requeued run in a rolled-back subtransaction, so each negative
-- case is checked independently of the others.
create function pg_temp.claims_requeued(p_runner uuid) returns boolean language plpgsql as $$
declare v boolean;
begin
  begin
    v := exists (select 1 from private.claim_next_devbox_run(p_runner) c where c.id = 'e1111111-1111-4111-8111-111111111111');
    raise exception using errcode = 'P0004', message = 'undo claim';
  exception when assert_failure then null; end;
  return v;
end $$;
-- Draining A claims nothing; runners enqueue would not choose (trusted, no
-- language, mixed, trusted mode) ignore the requeued run; B claims it and
-- takes its lease.
insert into results select 'draining_claims_nothing', not exists (select 1 from private.claim_next_devbox_run('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
insert into results select 'trusted_runner_ignores_judge', not pg_temp.claims_requeued('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into results select 'requeue_skips_missing_language', not pg_temp.claims_requeued('a1111111-1111-4111-8111-111111111111');
insert into results select 'requeue_skips_mixed_runner', not pg_temp.claims_requeued('a2222222-2222-4222-8222-222222222222');
insert into results select 'requeue_skips_trusted_mode', not pg_temp.claims_requeued('a3333333-3333-4333-8333-333333333333');
insert into results select 'requeue_still_queued', (select status = 'queued' and runner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' from private.devbox_runs where id = 'e1111111-1111-4111-8111-111111111111');
insert into results select 'b_claims_requeued_judge', exists (select 1 from private.claim_next_devbox_run('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') c where c.id = 'e1111111-1111-4111-8111-111111111111');
insert into results select 'run_and_lease_moved',
  (select runner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and status = 'running' from private.devbox_runs where id = 'e1111111-1111-4111-8111-111111111111')
  and (select runner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' from private.devbox_leases where id = 'd1111111-1111-4111-8111-111111111111');
insert into results select 'a_drained',
  (select queued_runs = 0 and running_runs = 0 and active_leases = 0 from private.devbox_runner_activity() where runner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into results select 'drain_cleared',
  private.set_devbox_runner_drain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false) is null;
-- Function privileges stay service-role only.
insert into results select 'no_anon_execute', not has_function_privilege('anon', 'private.set_devbox_runner_drain(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'private.devbox_runner_activity()', 'execute');
insert into results select 'no_authenticated_execute', not has_function_privilege('authenticated', 'private.set_devbox_runner_drain(uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'private.devbox_runner_activity()', 'execute')
  and not has_function_privilege('authenticated', 'private.set_devbox_runner_feature(uuid, text, boolean)', 'execute');

select ok(coalesce(ok, false), name) from results order by name;

select * from finish();
rollback;
