-- Commit-run protocol enforcement (migration 20261024030400).
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

create temp table results (name text, ok boolean);
create temp table fx as select id as actor from public.users limit 1;

create function pg_temp.raises(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end $$;

-- T: trusted runner advertising v1. J: Judge runner advertising it.
-- N: trusted runner without the protocol.
insert into private.devbox_runners (id, actor_id, name, status, heartbeat_enabled, last_heartbeat_at, capabilities, enabled_features)
  select x.id::uuid, fx.actor, x.name, 'online', true, now(), x.caps::jsonb, x.features::jsonb
  from fx, (values
    ('b1111111-1111-4111-8111-111111111111', 'trusted-proto',
     '{"executionMode": "trusted", "protocols": {"commitRun": [1]}}',
     '{"run": true, "build": false, "serve": false, "tunnel": false, "judge": false, "playground": false}'),
    ('b2222222-2222-4222-8222-222222222222', 'judge-proto',
     '{"executionMode": "judge-only", "protocols": {"commitRun": [1]}, "judge": {"ready": true, "languages": ["python"]}}',
     '{"run": false, "build": false, "serve": false, "tunnel": false, "judge": true, "playground": false}'),
    ('b3333333-3333-4333-8333-333333333333', 'trusted-plain',
     '{"executionMode": "trusted"}',
     '{"run": true, "build": false, "serve": false, "tunnel": false, "judge": false, "playground": false}')
  ) x(id, name, caps, features);

insert into results select 'judge_advertisement_dropped',
  (select not (capabilities ? 'protocols') from private.devbox_runners where id = 'b2222222-2222-4222-8222-222222222222');
update private.devbox_runners set capabilities = capabilities || '{"protocols": {"commitRun": [1]}}'::jsonb
  where id = 'b2222222-2222-4222-8222-222222222222';
insert into results select 'judge_heartbeat_dropped',
  (select not (capabilities ? 'protocols') from private.devbox_runners where id = 'b2222222-2222-4222-8222-222222222222');
insert into results select 'trusted_advertisement_kept',
  (select capabilities ? 'protocols' from private.devbox_runners where id = 'b1111111-1111-4111-8111-111111111111');

insert into private.devbox_leases (id, actor_id, runner_id, status, expires_at)
  select x.id::uuid, fx.actor, x.runner::uuid, 'active', now() + interval '10 minutes'
  from fx, (values
    ('c1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111'),
    ('c2222222-2222-4222-8222-222222222222', 'b2222222-2222-4222-8222-222222222222'),
    ('c3333333-3333-4333-8333-333333333333', 'b3333333-3333-4333-8333-333333333333'),
    ('c4444444-4444-4444-8444-444444444444', null),
    ('c5555555-5555-4555-8555-555555555555', 'b1111111-1111-4111-8111-111111111111'),
    ('c6666666-6666-4666-8666-666666666666', 'b1111111-1111-4111-8111-111111111111')
  ) x(id, runner);

insert into results select 'unpinned_envelope_refused', pg_temp.raises(format(
  $sql$insert into private.devbox_runs (actor_id, lease_id, command) values (%L, 'c4444444-4444-4444-8444-444444444444', '{__ttr_commit_run_v1__,x}')$sql$,
  (select actor from fx)));
insert into results select 'judge_envelope_refused', pg_temp.raises(format(
  $sql$insert into private.devbox_runs (actor_id, lease_id, command) values (%L, 'c2222222-2222-4222-8222-222222222222', '{__ttr_commit_run_v1__,x}')$sql$,
  (select actor from fx)));
insert into results select 'unsupported_envelope_refused', pg_temp.raises(format(
  $sql$insert into private.devbox_runs (actor_id, lease_id, command) values (%L, 'c3333333-3333-4333-8333-333333333333', '{__ttr_commit_run_v1__,x}')$sql$,
  (select actor from fx)));

insert into private.devbox_runs (id, actor_id, lease_id, command)
  select x.id::uuid, fx.actor, x.lease::uuid, '{__ttr_commit_run_v1__,x}'
  from fx, (values
    ('d1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111'),
    ('d5555555-5555-4555-8555-555555555555', 'c5555555-5555-4555-8555-555555555555')
  ) x(id, lease);

-- Re-pinning after selection does not let an unsupported runner claim it.
update private.devbox_leases set runner_id = 'b3333333-3333-4333-8333-333333333333'
  where id = 'c1111111-1111-4111-8111-111111111111';
insert into results select 'unsupported_claim_refused',
  not exists (select 1 from private.claim_next_devbox_run('b3333333-3333-4333-8333-333333333333'));
insert into results select 'refused_run_not_offered',
  (select status = 'queued' from private.devbox_runs where id = 'd1111111-1111-4111-8111-111111111111')
  and (select expires_at <= now() from private.devbox_leases where id = 'c1111111-1111-4111-8111-111111111111');
insert into results select 'supported_claim_ok',
  exists (select 1 from private.claim_next_devbox_run('b1111111-1111-4111-8111-111111111111') c
          where c.id = 'd5555555-5555-4555-8555-555555555555');

-- Losing the protocol cancels queued envelope runs pinned to the runner.
insert into private.devbox_runs (id, actor_id, lease_id, command)
  select 'd6666666-6666-4666-8666-666666666666', actor, 'c6666666-6666-4666-8666-666666666666', '{__ttr_commit_run_v1__,y}' from fx;
update private.devbox_runners set capabilities = capabilities - 'protocols'
  where id = 'b1111111-1111-4111-8111-111111111111';
insert into results select 'downgrade_cancels_queued',
  (select status = 'cancelled' from private.devbox_runs where id = 'd6666666-6666-4666-8666-666666666666');
insert into results select 'no_anon_execute',
  not has_function_privilege('anon', 'private.devbox_runner_supports_commit_run(jsonb, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.backfill_devbox_run_event_seq(integer)', 'execute');

select ok(coalesce(ok, false), name) from results order by name;

select * from finish();
rollback;
