begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(
  bool_and(
    has_function_privilege('service_role', f.oid, 'EXECUTE')
    and not has_function_privilege('anon', f.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', f.oid, 'EXECUTE')
    and not exists (select 1 from aclexplode(f.proacl) where grantee = 0)
    and f.prosecdef
    and f.proconfig = array['search_path=pg_catalog, pg_temp']
  ) and count(*) = 5,
  'all five guarded RPCs are service-only and pin the definer search path'
)
from pg_proc f
where f.oid in (
  'private.reserve_cite_budget(text,text,bigint,integer,integer)'::regprocedure,
  'private.claim_cite_ai_operation(uuid,uuid,jsonb,boolean)'::regprocedure,
  'private.read_cite_ai_operation(uuid,uuid)'::regprocedure,
  'private.transition_cite_ai_operation(uuid,uuid,jsonb,jsonb)'::regprocedure,
  'private.claim_cite_ai_deduction(uuid,uuid,jsonb)'::regprocedure
);

select ok(
  not has_table_privilege('service_role', 'private.cite_budget_counters', 'INSERT')
  and not has_table_privilege('service_role', 'private.cite_ai_operations', 'UPDATE'),
  'service role cannot bypass the RPCs with direct writes'
);
select throws_ok(
  $$select private.reserve_cite_budget('ground', repeat('a',64), 0, 1, 2)$$,
  '42501', 'Citation budget access denied', 'requires service-role JWT context'
);
select set_config('request.jwt.claim.role', 'service_role', true);

set local role service_role;
do $$
begin
  if not private.reserve_cite_budget(
    'format', repeat('f', 64), floor(extract(epoch from now()) / 60)::bigint, 10, 120
  ) then
    raise exception 'service role reservation failed';
  end if;
end;
$$;
reset role;

create function pg_temp.budget_window() returns bigint language sql as $$
  select floor(extract(epoch from now()) / 60)::bigint;
$$;

insert into private.cite_budget_counters values
  ('ground', pg_temp.budget_window() - 3, '', 2),
  ('ground', pg_temp.budget_window() - 3, repeat('a', 64), 1);

select ok(private.reserve_cite_budget('ground', repeat('a', 64), pg_temp.budget_window(), 1, 2),
  'expired window does not consume the first reservation');
select ok(not exists (
  select 1 from private.cite_budget_counters
  where scope = 'ground' and window_minute = pg_temp.budget_window() - 3
), 'old counter rows are recycled');
select ok(not private.reserve_cite_budget('ground', repeat('a', 64), pg_temp.budget_window(), 1, 2),
  'actor cap denies an additional reservation');
select ok(private.reserve_cite_budget('ground', repeat('b', 64), pg_temp.budget_window(), 1, 2),
  'the actor denial leaves one global slot for another actor');
select ok(not private.reserve_cite_budget('ground', repeat('c', 64), pg_temp.budget_window(), 1, 2),
  'global cap denies a third actor');
select is(
  (select sum(used)::integer from private.cite_budget_counters
    where scope = 'ground' and window_minute = pg_temp.budget_window()),
  4, 'both counters stay at their exact limits without partial increments'
);
select ok(private.reserve_cite_budget('lookup', repeat('a', 64), pg_temp.budget_window(), 1, 2),
  'anonymous lookup has its own counter scope');
select throws_ok(
  $$select private.reserve_cite_budget('lookup', '198.51.100.1', pg_temp.budget_window(), 1, 2)$$,
  '22023', 'Invalid citation budget', 'rejects a raw client address'
);

create temporary table cite_fixture (
  operation_id uuid not null,
  actor_id uuid not null,
  binding jsonb not null,
  running jsonb,
  checkpoint jsonb,
  settling jsonb
);
insert into cite_fixture (operation_id, actor_id, binding)
values (
  '019a8b00-0000-7000-8000-000000000001',
  '00000000-0000-4000-8000-00000000a701',
  jsonb_build_object(
    'userId', '00000000-0000-4000-8000-00000000a701',
    'billingWsId', '00000000-0000-4000-8000-00000000a702',
    'feature', 'cite_fix_ref', 'inputHash', repeat('a', 64)
  )
);

update cite_fixture set running =
  private.claim_cite_ai_operation(operation_id, actor_id, binding, false) -> 'record';
select is(running ->> 'stage', 'running', 'first claim owns generation') from cite_fixture;
select is(
  private.claim_cite_ai_operation(operation_id, actor_id, binding, false) ->> 'kind',
  'existing', 'concurrent duplicate receives the receipt'
) from cite_fixture;
select is(
  private.claim_cite_ai_operation(
    '019a8b00-0000-7000-8000-000000000002', actor_id, binding, false
  ) ->> 'kind', 'busy', 'one actor cannot hold a second active lease'
) from cite_fixture;
select is(
  private.read_cite_ai_operation(operation_id, '00000000-0000-4000-8000-00000000a703') ->> 'kind',
  'conflict', 'foreign actor cannot receive the receipt'
) from cite_fixture;
select is(extract(epoch from actor_lock_until - first_claimed_at)::integer, 120,
  'running actor lease lasts 120 seconds')
from private.cite_ai_operations join cite_fixture using (operation_id);

select ok(private.transition_cite_ai_operation(operation_id, actor_id, running,
    running || '{"stage":"failed","code":"BILLING_PENDING"}'),
  'a provider failure without known usage records a pending receipt') from cite_fixture;
select ok(expires_at = actor_lock_until
    and expires_at > clock_timestamp() + interval '895 seconds'
    and expires_at <= clock_timestamp() + interval '900 seconds',
  'failed pending receipt and actor lease expire together within 900 seconds')
from private.cite_ai_operations join cite_fixture using (operation_id);

update private.cite_ai_operations set
  expires_at = clock_timestamp() - interval '1 second',
  actor_lock_until = clock_timestamp() - interval '1 second'
where operation_id = (select operation_id from cite_fixture);
select is(private.read_cite_ai_operation(operation_id, actor_id), null,
  'expired pending receipt is no longer returned') from cite_fixture;
select is(private.claim_cite_ai_operation(
    operation_id, actor_id, binding || jsonb_build_object('inputHash', repeat('b', 64)), true
  ) ->> 'kind', 'conflict', 'retry-only claim rejects a changed binding') from cite_fixture;
select is(private.claim_cite_ai_operation(
    '019a8b00-0000-7000-8000-000000000002', actor_id, binding, true
  ) ->> 'kind', 'expired', 'retry-only claim cannot create an operation without an expired receipt')
from cite_fixture;

update cite_fixture set checkpoint =
  private.claim_cite_ai_operation(operation_id, actor_id, binding, true) -> 'record';
select is(checkpoint ->> 'stage', 'running',
  'the same bound operation can reopen after pending expiry') from cite_fixture;
select isnt(checkpoint ->> 'attemptId', running ->> 'attemptId',
  'reopen issues a fresh generation fence') from cite_fixture;
select ok(not private.transition_cite_ai_operation(operation_id, actor_id, running,
    running || '{"stage":"failed","code":"BILLING_PENDING"}'),
  'a stale worker cannot overwrite a reopened operation') from cite_fixture;
update cite_fixture set running = checkpoint,
  checkpoint = checkpoint || '{"stage":"checkpoint","modelId":"synthetic","usage":{"inputTokens":10,"outputTokens":20,"reasoningTokens":5},"outcome":{"kind":"invalid"}}';
update cite_fixture set settling = checkpoint || '{"stage":"settling"}';

select ok(private.transition_cite_ai_operation(operation_id, actor_id, running, checkpoint),
  'checkpoint CAS records usage') from cite_fixture;
select ok(private.transition_cite_ai_operation(operation_id, actor_id, checkpoint, settling),
  'matching checkpoint CAS enters settlement') from cite_fixture;
select ok(not private.transition_cite_ai_operation(operation_id, actor_id, checkpoint, settling),
  'stale checkpoint CAS has no second winner') from cite_fixture;
select ok(expires_at - actor_lock_until = interval '2700 seconds'
    and actor_lock_until <= clock_timestamp() + interval '900 seconds',
  'settling retains a 3600-second receipt and at most a 900-second actor lease')
from private.cite_ai_operations join cite_fixture using (operation_id);

select ok(not private.claim_cite_ai_deduction(operation_id, actor_id, checkpoint),
  'an out-of-date checkpoint cannot claim a deduction') from cite_fixture;
select ok(private.claim_cite_ai_deduction(operation_id, actor_id, settling),
  'the first deduction contender wins') from cite_fixture;
select ok(not private.claim_cite_ai_deduction(operation_id, actor_id, settling),
  'the same receipt has no second deduction winner') from cite_fixture;

update private.cite_ai_operations set actor_lock_until = clock_timestamp() - interval '1 second'
where operation_id = (select operation_id from cite_fixture);
select is(private.claim_cite_ai_operation(
    '019a8b00-0000-7000-8000-000000000002', actor_id, binding, false
  ) ->> 'kind', 'claimed', 'the actor can start a new repair after settlement lease expiry')
from cite_fixture;
select ok(not private.claim_cite_ai_deduction(operation_id, actor_id, settling),
  'the dispatch fence survives actor lease expiry') from cite_fixture;
select ok(private.transition_cite_ai_operation(operation_id, actor_id, settling,
    settling || '{"stage":"settled","creditsDeducted":1}'),
  'durable recovery can settle after actor lease expiry') from cite_fixture;
select is(private.claim_cite_ai_operation(
    '019a8b00-0000-7000-8000-000000000003', actor_id, binding, false
  ) ->> 'kind', 'busy', 'settling an old receipt preserves the newer actor lease')
from cite_fixture;

select * from finish();
rollback;
