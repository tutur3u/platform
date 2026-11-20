\ir helpers/local-dblink.inc
-- Independent committed sessions exist only inside the owned disposable database.
-- The canonical lifecycle destroys that entire database after this rollback packet.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions;

select plan(25);

do $setup$
begin
  perform dblink_connect('live_a', pg_temp.fixture_dblink_connstr());
  perform dblink_connect('live_b', pg_temp.fixture_dblink_connstr());
  perform dblink_exec('live_a', $remote$
    begin;
    insert into public.users (id, display_name)
    values ('33000000-0000-4000-8000-000000000001', 'Live concurrency owner');
    insert into public.workspaces (id, name, creator_id, personal)
    values ('33000000-0000-4000-8000-000000000010', 'Live concurrency',
      '33000000-0000-4000-8000-000000000001', false);
    insert into private.workspace_subscription_products (id, tier, pricing_model, name)
    values ('33000000-0000-4000-8000-000000000099', 'PRO', 'seat_based',
      'Live concurrency plan');
    insert into public.workspace_subscriptions (
      ws_id, polar_subscription_id, product_id, seat_count, status
    ) values ('33000000-0000-4000-8000-000000000010', 'live-concurrency-plan',
      '33000000-0000-4000-8000-000000000099', 1, 'active');
    insert into public.workspace_ai_credit_balances (
      ws_id, user_id, period_start, period_end, total_allocated, total_used,
      bonus_credits
    ) values (
      '33000000-0000-4000-8000-000000000010', null, date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month', 0, 0, 0
    );
    insert into private.workspace_credit_packs (
      id, name, description, price, currency, tokens, expiry_days
    ) values (
      '33000000-0000-4000-8000-000000000020', 'Live concurrency credits',
      'Credits for concurrent Live starts', 100, 'usd', 1200, 30
    );
    insert into public.workspace_credit_pack_purchases (
      id, ws_id, credit_pack_id, polar_subscription_id, tokens_granted,
      tokens_remaining, expires_at, status
    ) values (
      '33000000-0000-4000-8000-000000000021',
      '33000000-0000-4000-8000-000000000010',
      '33000000-0000-4000-8000-000000000020', 'live-concurrency-pack',
      1200, 1200, now() + interval '10 days', 'active'
    );
    commit;
  $remote$);
  perform dblink_exec('live_a',
    'begin; set local statement_timeout=''10s''; set local lock_timeout=''5s''');
  perform dblink_exec('live_b',
    'set statement_timeout=''10s''; set lock_timeout=''5s''');
end $setup$;

create function pg_temp.reserve_sql() returns text language sql as $$
  select $q$select success, reserved_credits, error_code
    from private.reserve_live_ai_credits(
      '33000000-0000-4000-8000-000000000010',
      '33000000-0000-4000-8000-000000000001',
      2000, 500, 'google/gemini-3.1-flash-live-preview', 'voice_live',
      '{}'::jsonb, 600)$q$;
$$;

-- Session A reserves the whole pack and keeps its transaction open.
select ok(
  (select success and reserved_credits = 1200
    from dblink('live_a', pg_temp.reserve_sql())
      as r(success boolean, reserved_credits numeric, error_code text)),
  'first concurrent start reserves the whole pack and holds it'
);

-- Session B starts against the same balance and packs.
select is(dblink_send_query('live_b', pg_temp.reserve_sql()), 1,
  'second concurrent start is dispatched');

do $wait$
declare deadline timestamptz := clock_timestamp() + interval '3 seconds';
begin
  loop
    exit when exists (
      select 1 from pg_stat_activity
      where query like '%reserve_live_ai_credits%'
        and wait_event_type = 'Lock'
        and pid <> pg_backend_pid()
    );
    if clock_timestamp() > deadline then
      raise exception 'Second start did not wait on the reservation lock';
    end if;
    perform pg_sleep(0.01);
  end loop;
end
$wait$;

select is(dblink_is_busy('live_b'), 1,
  'second start waits on the row locks instead of reading a stale balance');

do $$ begin perform dblink_exec('live_a', 'commit'); end $$;

create temporary table live_b_result as
select * from dblink_get_result('live_b')
  as r(success boolean, reserved_credits numeric, error_code text);
-- Drain the end-of-results marker before reusing the connection.
select * from dblink_get_result('live_b')
  as r(success boolean, reserved_credits numeric, error_code text);

select ok(
  (select not success and error_code = 'INSUFFICIENT_CREDITS' from live_b_result),
  'second start is refused after the first commits'
);
-- Both sessions have finished; read their committed result directly.
select is(
  (select tokens_remaining from public.workspace_credit_pack_purchases
    where id = '33000000-0000-4000-8000-000000000021'),
  0::numeric,
  'the pack ends at zero, never negative'
);
select is(
  (select coalesce(sum(amount), 0) from private.ai_credit_reservation_pack_draws
    where pack_purchase_id = '33000000-0000-4000-8000-000000000021'),
  1200::numeric,
  'exactly the pack balance is held across both starts'
);


-- Settlement and start on one workspace, both orders, without deadlock.
do $setup2$
begin
  perform dblink_exec('live_a', $remote$
    begin;
    insert into public.users (id, display_name)
    values ('33000000-0000-4000-8000-000000000101', 'Live settle-start owner');
    insert into public.workspaces (id, name, creator_id, personal)
    values ('33000000-0000-4000-8000-000000000110', 'Live settle-start',
      '33000000-0000-4000-8000-000000000101', false);
    insert into public.workspace_subscriptions (
      ws_id, polar_subscription_id, product_id, seat_count, status
    ) values ('33000000-0000-4000-8000-000000000110', 'live-settle-start-plan',
      '33000000-0000-4000-8000-000000000099', 1, 'active');
    insert into public.workspace_ai_credit_balances (
      ws_id, user_id, period_start, period_end, total_allocated, total_used,
      bonus_credits
    ) values (
      '33000000-0000-4000-8000-000000000110', null, date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month', 600, 0, 0
    );
    insert into public.workspace_credit_pack_purchases (
      id, ws_id, credit_pack_id, polar_subscription_id, tokens_granted,
      tokens_remaining, expires_at, status
    ) values (
      '33000000-0000-4000-8000-000000000121',
      '33000000-0000-4000-8000-000000000110',
      '33000000-0000-4000-8000-000000000020', 'live-settle-start-pack',
      1000, 1000, now() + interval '10 days', 'active'
    );
    commit;
  $remote$);
end $setup2$;

create function pg_temp.start_sql() returns text language sql as $$
  select $q$select success, reservation_id, reserved_credits, error_code
    from private.reserve_live_ai_credits(
      '33000000-0000-4000-8000-000000000110',
      '33000000-0000-4000-8000-000000000101',
      2000, 500, 'google/gemini-3.1-flash-live-preview', 'voice_live',
      '{}'::jsonb, 600)$q$;
$$;
create function pg_temp.open_session_sql(p_reservation uuid) returns text
language sql as $$
  select format($q$insert into private.ai_live_sessions (
      user_id, access_ws_id, billing_ws_id, model_id, pricing_id,
      reservation_id, reserved_credits, expires_at
    ) select '33000000-0000-4000-8000-000000000101',
      '33000000-0000-4000-8000-000000000110',
      '33000000-0000-4000-8000-000000000110',
      'gemini-3.1-flash-live-preview',
      (select id from private.ai_live_model_prices
        where model_id = 'gemini-3.1-flash-live-preview'
        order by effective_at desc limit 1),
      %L, reservation.amount, now() + interval '5 minutes'
    from private.ai_credit_reservations as reservation where reservation.id = %L
    returning id$q$, p_reservation, p_reservation);
$$;
create function pg_temp.settle_sql(p_session uuid) returns text
language sql as $$
  select format($q$select success, closed, billed_credits, error_code
    from private.settle_ai_live_session(%L,
      '33000000-0000-4000-8000-000000000101', 0,
      jsonb_build_object('inputTextTokens', 1000, 'inputAudioTokens', 0,
        'inputImageTokens', 0, 'inputVideoTokens', 0, 'outputTextTokens', 0,
        'outputAudioTokens', 0, 'thinkingTokens', 0, 'searchQueries', 0),
      true)$q$, p_session);
$$;
create function pg_temp.await_lock_wait(p_like text) returns boolean
language plpgsql as $$
declare deadline timestamptz := clock_timestamp() + interval '3 seconds';
begin
  loop
    -- pg_stat_activity is cached per transaction; refresh it on every poll.
    perform pg_stat_clear_snapshot();
    if exists (
      select 1 from pg_stat_activity
      where query like p_like and wait_event_type = 'Lock'
        and pid <> pg_backend_pid()
    ) then return true; end if;
    if clock_timestamp() > deadline then return false; end if;
    perform pg_sleep(0.01);
  end loop;
end;
$$;

-- First live session: reserve 1600 (600 included + 1000 pack), committed.
create temporary table first_start as
select * from dblink('live_a', pg_temp.start_sql())
  as r(success boolean, reservation_id uuid, reserved_credits numeric, error_code text);
create temporary table first_session as
select * from dblink('live_a',
  pg_temp.open_session_sql((select reservation_id from first_start)))
  as r(id uuid);

-- Order 1: settlement holds the locks while a new start arrives.
do $$ begin perform dblink_exec('live_a',
  'begin; set local statement_timeout=''10s''; set local lock_timeout=''5s'''); end $$;
create temporary table first_settle as
select * from dblink('live_a', pg_temp.settle_sql((select id from first_session)))
  as r(success boolean, closed boolean, billed_credits numeric, error_code text);
select is(dblink_send_query('live_b', pg_temp.start_sql()), 1,
  'a start is dispatched while a settlement holds the workspace');
select ok(pg_temp.await_lock_wait('%reserve_live_ai_credits%'),
  'the start waits on the settlement locks');
do $$ begin perform dblink_exec('live_a', 'commit'); end $$;
create temporary table second_start as
select * from dblink_get_result('live_b')
  as r(success boolean, reservation_id uuid, reserved_credits numeric, error_code text);
select * from dblink_get_result('live_b')
  as r(success boolean, reservation_id uuid, reserved_credits numeric, error_code text);
select ok(
  (select success from first_settle) and (select closed from first_settle)
    and (select success from second_start),
  'settle then start both complete without deadlock'
);

-- Order 2: a start holds the locks while a settlement arrives.
create temporary table second_session as
select * from dblink('live_a',
  pg_temp.open_session_sql((select reservation_id from second_start)))
  as r(id uuid);
do $$ begin perform dblink_exec('live_a',
  'begin; set local statement_timeout=''10s''; set local lock_timeout=''5s'''); end $$;
create temporary table third_start as
select * from dblink('live_a', pg_temp.start_sql())
  as r(success boolean, reservation_id uuid, reserved_credits numeric, error_code text);
select is(dblink_send_query('live_b',
  pg_temp.settle_sql((select id from second_session))), 1,
  'a settlement is dispatched while a start holds the workspace');
select ok(pg_temp.await_lock_wait('%settle_ai_live_session%'),
  'the settlement waits on the start locks');
do $$ begin perform dblink_exec('live_a', 'commit'); end $$;
create temporary table second_settle as
select * from dblink_get_result('live_b')
  as r(success boolean, closed boolean, billed_credits numeric, error_code text);
select * from dblink_get_result('live_b')
  as r(success boolean, closed boolean, billed_credits numeric, error_code text);
select ok(
  (select success and closed from second_settle),
  'start then settle both complete without deadlock'
);

-- Balances: included and pack consumption equal the open hold plus billing.
select is(
  (select total_used from public.workspace_ai_credit_balances
    where ws_id = '33000000-0000-4000-8000-000000000110' and user_id is null)
  + (select tokens_granted - tokens_remaining
    from public.workspace_credit_pack_purchases
    where id = '33000000-0000-4000-8000-000000000121'),
  (select coalesce(sum(billed_credits), 0) from private.ai_live_sessions
    where billing_ws_id = '33000000-0000-4000-8000-000000000110'
      and status <> 'active')
  + coalesce((select amount from private.ai_credit_reservations
    where id = (select reservation_id from third_start)
      and status = 'reserved'), 0),
  'balances equal billed credits plus the open reservation'
);
select ok(
  (select tokens_remaining >= 0 from public.workspace_credit_pack_purchases
    where id = '33000000-0000-4000-8000-000000000121'),
  'the pack never goes negative'
);


-- Studio settlement holds a run, then needs the balance; the sweep holds the
-- balance and must not wait on that run.
do $setup3$
begin
  perform dblink_exec('live_a', $remote$
    begin;
    insert into public.users (id, display_name)
    values ('33000000-0000-4000-8000-000000000201', 'Studio sweep owner');
    insert into public.workspaces (id, name, creator_id, personal)
    values ('33000000-0000-4000-8000-000000000210', 'Studio sweep',
      '33000000-0000-4000-8000-000000000201', false);
    insert into public.workspace_ai_credit_balances (
      id, ws_id, user_id, period_start, period_end, total_allocated,
      total_used, bonus_credits
    ) values (
      '33000000-0000-4000-8000-000000000220',
      '33000000-0000-4000-8000-000000000210', null, date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month', 100, 4, 0
    );
    insert into private.ai_studio_api_keys (
      id, ws_id, name, prefix, secret_hash, credits_reserved
    ) values (
      '33000000-0000-4000-8000-000000000230',
      '33000000-0000-4000-8000-000000000210', 'Studio sweep key',
      'ttr_ai_studio_sweep', 'studio-sweep-secret-hash', 4
    );
    insert into private.ai_credit_reservations (
      id, ws_id, user_id, balance_id, amount, model_id, feature, status,
      expires_at
    ) values (
      '33000000-0000-4000-8000-000000000240',
      '33000000-0000-4000-8000-000000000210',
      '33000000-0000-4000-8000-000000000201',
      '33000000-0000-4000-8000-000000000220', 4,
      'google/gemini-3.5-flash-lite', 'responses', 'reserved',
      now() - interval '1 minute'
    );
    insert into private.ai_studio_runs (
      id, request_id, ws_id, api_key_id, actor_id, model_id, feature,
      reservation_id, reserved_credits, status
    ) values (
      '33000000-0000-4000-8000-000000000250', 'studio-sweep-run',
      '33000000-0000-4000-8000-000000000210',
      '33000000-0000-4000-8000-000000000230',
      '33000000-0000-4000-8000-000000000201',
      'google/gemini-3.5-flash-lite', 'responses',
      '33000000-0000-4000-8000-000000000240', 4, 'running'
    );
    commit;
  $remote$);
  -- A holds the run as Studio settlement does before it locks the balance.
  perform dblink_exec('live_a',
    'begin; set local statement_timeout=''10s''; set local lock_timeout=''5s''');
end $setup3$;
select * from dblink('live_a', $q$select id from private.ai_studio_runs
  where id = '33000000-0000-4000-8000-000000000250' for update$q$) as r(id uuid);

select is(dblink_send_query('live_b', $q$select public._release_expired_ai_credit_reservations(
  '33000000-0000-4000-8000-000000000220')::text$q$), 1,
  'a sweep is dispatched while Studio settlement holds a run');
do $sweep$
declare deadline timestamptz := clock_timestamp() + interval '3 seconds';
begin
  while dblink_is_busy('live_b') = 1 loop
    if clock_timestamp() > deadline then
      raise exception 'The sweep waited on a held Studio run';
    end if;
    perform pg_sleep(0.01);
  end loop;
end
$sweep$;
select * from dblink_get_result('live_b') as r(done text);
select * from dblink_get_result('live_b') as r(done text);
select ok(true, 'the sweep finishes without waiting on the held run');
select is(
  (select status from private.ai_studio_runs
    where id = '33000000-0000-4000-8000-000000000250'),
  'running',
  'the held run is left for a later sweep'
);
-- Studio settlement can now take the balance: no deadlock.
select ok(
  (select id is not null from dblink('live_a', $q$select id from
    public.workspace_ai_credit_balances
    where id = '33000000-0000-4000-8000-000000000220' for update$q$)
    as r(id uuid)),
  'Studio settlement then acquires the balance'
);
do $$ begin perform dblink_exec('live_a', 'commit'); end $$;
select * from dblink('live_b', $q$select public._release_expired_ai_credit_reservations(
  '33000000-0000-4000-8000-000000000220')::text$q$) as r(done text);
select ok(
  (select status = 'aborted' from private.ai_studio_runs
    where id = '33000000-0000-4000-8000-000000000250')
  and (select credits_reserved = 0 from private.ai_studio_api_keys
    where id = '33000000-0000-4000-8000-000000000230'),
  'a later sweep aborts the run and releases its key reservation'
);

-- Embedding release and commit take the balance before the hold, so they
-- never hold a reservation while waiting on the balance the sweep holds.
do $setup4$
begin
  perform dblink_connect('live_c', pg_temp.fixture_dblink_connstr());
  perform dblink_exec('live_a', $remote$
    begin;
    insert into public.users (id, display_name)
    values ('33000000-0000-4000-8000-000000000301', 'Embedding lock owner');
    insert into public.workspaces (id, name, creator_id, personal)
    values ('33000000-0000-4000-8000-000000000310', 'Embedding lock order',
      '33000000-0000-4000-8000-000000000301', false);
    insert into public.workspace_ai_credit_balances (
      id, ws_id, user_id, period_start, period_end, total_allocated,
      total_used, bonus_credits
    ) values (
      '33000000-0000-4000-8000-000000000320',
      '33000000-0000-4000-8000-000000000310', null, date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month', 0, 0, 0
    );
    insert into public.workspace_credit_pack_purchases (
      id, ws_id, credit_pack_id, polar_subscription_id, tokens_granted,
      tokens_remaining, granted_at, expires_at, status
    ) values (
      '33000000-0000-4000-8000-000000000330',
      '33000000-0000-4000-8000-000000000310',
      '33000000-0000-4000-8000-000000000020', 'embedding-lock-pack',
      100, 80, now() - interval '1 day', now() + interval '10 days', 'active'
    );
    insert into private.ai_embedding_credit_reservations (
      id, ws_id, balance_id, amount, payg_amount, payg_purchases, model_id,
      status
    )
    select r.id, '33000000-0000-4000-8000-000000000310',
      '33000000-0000-4000-8000-000000000320', 10, 10,
      jsonb_build_array(jsonb_build_object(
        'id', '33000000-0000-4000-8000-000000000330', 'amount', 10,
        'granted_at', now() - interval '1 day')),
      'google/gemini-embedding-2', 'reserved'
    from (values ('33000000-0000-4000-8000-000000000340'::uuid),
      ('33000000-0000-4000-8000-000000000341'::uuid)) as r(id);
    update public.workspace_credit_pack_purchases
    set granted_at = (
      select (payg_purchases -> 0 ->> 'granted_at')::timestamptz
      from private.ai_embedding_credit_reservations
      where id = '33000000-0000-4000-8000-000000000340')
    where id = '33000000-0000-4000-8000-000000000330';
    commit;
  $remote$);
end $setup4$;

-- True when another session can lock the hold right now (it is not held).
create function pg_temp.hold_free(p_id uuid) returns boolean
language plpgsql as $$
begin
  perform * from dblink('live_c', format(
    'select id from private.ai_embedding_credit_reservations where id = %L for update nowait',
    p_id)) as r(id uuid);
  return true;
exception when others then
  return false;
end;
$$;

do $$ begin perform dblink_exec('live_a',
  'begin; set local statement_timeout=''10s''; set local lock_timeout=''5s'''); end $$;
select * from dblink('live_a', $q$select id from public.workspace_ai_credit_balances
  where id = '33000000-0000-4000-8000-000000000320' for update$q$) as r(id uuid);
select is(dblink_send_query('live_b', $q$select success, error_code
  from public.release_metered_embedding_credits(
    '33000000-0000-4000-8000-000000000340')$q$), 1,
  'embedding release: dispatched while the balance is held');
select ok(pg_temp.await_lock_wait('%release_metered_embedding_credits%')
  and pg_temp.hold_free('33000000-0000-4000-8000-000000000340'),
  'embedding release: waits on the balance without holding the reservation');
do $$ begin perform dblink_exec('live_a', 'commit'); end $$;
create temporary table embed_release as
select * from dblink_get_result('live_b') as r(success boolean, error_code text);
select * from dblink_get_result('live_b') as r(success boolean, error_code text);
select ok((select success from embed_release)
  and (select status = 'released' and tokens_remaining = 90
    from dblink('live_c', $q$select r.status, p.tokens_remaining
      from private.ai_embedding_credit_reservations r,
        public.workspace_credit_pack_purchases p
      where r.id = '33000000-0000-4000-8000-000000000340'
        and p.id = '33000000-0000-4000-8000-000000000330'$q$)
      as x(status text, tokens_remaining numeric)),
  'embedding release: refunds the hold to its retained grant');

do $$ begin perform dblink_exec('live_a',
  'begin; set local statement_timeout=''10s''; set local lock_timeout=''5s'''); end $$;
select * from dblink('live_a', $q$select id from public.workspace_ai_credit_balances
  where id = '33000000-0000-4000-8000-000000000320' for update$q$) as r(id uuid);
select is(dblink_send_query('live_b', $q$select success, error_code
  from public.commit_metered_embedding_credits(
    '33000000-0000-4000-8000-000000000341')$q$), 1,
  'embedding commit: dispatched while the balance is held');
select ok(pg_temp.await_lock_wait('%commit_metered_embedding_credits%')
  and pg_temp.hold_free('33000000-0000-4000-8000-000000000341'),
  'embedding commit: waits on the balance without holding the reservation');
do $$ begin perform dblink_exec('live_a', 'commit'); end $$;
create temporary table embed_commit as
select * from dblink_get_result('live_b') as r(success boolean, error_code text);
select * from dblink_get_result('live_b') as r(success boolean, error_code text);
select ok((select success from embed_commit),
  'embedding commit: completes once the balance is free');

select dblink_disconnect('live_c');
select dblink_disconnect('live_a');
select dblink_disconnect('live_b');
select * from finish();
rollback;
