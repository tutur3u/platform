begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(51);

insert into private.workspace_subscription_products (id, tier, pricing_model, name)
values ('32000000-0000-4000-8000-000000009998', 'PRO', 'seat_based',
  'Live pack test plan');

-- Fixtures: one user/workspace per scenario. A PRO workspace bills its own
-- workspace balance row; a FREE workspace bills the actor's row.
create function pg_temp.fixture(
  p_suffix text,
  p_included numeric,
  p_tier text default 'PRO'
) returns void language plpgsql as $$
declare
  v_user uuid := ('32000000-0000-4000-8000-00000000' || p_suffix || '01')::uuid;
  v_ws uuid := ('32000000-0000-4000-8000-00000000' || p_suffix || '10')::uuid;
  v_paid boolean := p_tier <> 'FREE';
begin
  insert into public.users (id, display_name)
  values (v_user, 'Live pack test ' || p_suffix) on conflict (id) do nothing;
  insert into public.workspaces (id, name, creator_id, personal)
  values (v_ws, 'Live pack test ' || p_suffix, v_user, false)
  on conflict (id) do nothing;
  if v_paid then
    insert into public.workspace_subscriptions (
      ws_id, polar_subscription_id, product_id, seat_count, status
    ) values (
      v_ws, 'live-pack-plan-' || p_suffix,
      '32000000-0000-4000-8000-000000009998', 1, 'active'
    );
  end if;
  insert into public.workspace_ai_credit_balances (
    ws_id, user_id, period_start, period_end, total_allocated, total_used,
    bonus_credits
  ) values (
    case when v_paid then v_ws end, case when v_paid then null else v_user end,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month', p_included, 0, 0
  );
end;
$$;

insert into private.workspace_credit_packs (
  id, name, description, price, currency, tokens, expiry_days
) values (
  '32000000-0000-4000-8000-000000009999', 'Live pack test credits',
  'Credits for Live pack reservation tests', 100, 'usd', 1000, 30
);

create function pg_temp.pack(
  p_suffix text,
  p_n text,
  p_tokens numeric,
  p_expires interval
) returns uuid language sql as $$
  insert into public.workspace_credit_pack_purchases (
    id, ws_id, credit_pack_id, polar_subscription_id, tokens_granted,
    tokens_remaining, expires_at, status
  ) values (
    ('32000000-0000-4000-8000-00000000' || p_suffix || p_n || '5')::uuid,
    ('32000000-0000-4000-8000-00000000' || p_suffix || '10')::uuid,
    '32000000-0000-4000-8000-000000009999',
    'live-pack-' || p_suffix || p_n,
    p_tokens, p_tokens, now() + p_expires, 'active'
  ) returning id;
$$;

create function pg_temp.user_id(p_suffix text) returns uuid language sql as $$
  select ('32000000-0000-4000-8000-00000000' || p_suffix || '01')::uuid;
$$;
create function pg_temp.ws_id(p_suffix text) returns uuid language sql as $$
  select ('32000000-0000-4000-8000-00000000' || p_suffix || '10')::uuid;
$$;
create function pg_temp.used(p_suffix text) returns numeric language sql as $$
  select sum(total_used) from public.workspace_ai_credit_balances
  where (ws_id = pg_temp.ws_id(p_suffix) and user_id is null)
     or (user_id = pg_temp.user_id(p_suffix) and ws_id is null);
$$;
create function pg_temp.remaining(p_pack uuid) returns numeric language sql as $$
  select tokens_remaining from public.workspace_credit_pack_purchases
  where id = p_pack;
$$;
create function pg_temp.reserve(p_suffix text) returns table (
  success boolean, reservation_id uuid, reserved_credits numeric, error_code text
) language sql as $$
  select * from private.reserve_live_ai_credits(
    pg_temp.ws_id(p_suffix), pg_temp.user_id(p_suffix), 2000, 500,
    'google/gemini-3.1-flash-live-preview', 'voice_live', '{}'::jsonb, 600
  );
$$;

-- A: included only.
select pg_temp.fixture('11', 1500);
create temporary table a_res as select * from pg_temp.reserve('11');
select ok((select success and reserved_credits = 1500 from a_res),
  'included only: reserves the whole included balance under the cap');
select is(pg_temp.used('11'), 1500::numeric,
  'included only: the included balance holds the reservation');
select is((select pack_amount from private.ai_credit_reservations
  where id = (select reservation_id from a_res)), 0::numeric,
  'included only: no pack credits are held');

-- B: Live is for paid plans; packs never fund a FREE workspace.
select pg_temp.fixture('12', 0, 'FREE');
create temporary table b_pack as select pg_temp.pack('12', '1', 900, interval '10 days') as id;
create temporary table b_res as select * from pg_temp.reserve('12');
select ok((select not success and error_code = 'INSUFFICIENT_CREDITS' from b_res),
  'FREE + packs: a pack does not admit Live on a FREE plan');
select is(pg_temp.remaining((select id from b_pack)), 900::numeric,
  'FREE + packs: the pack is untouched');

-- B2: packs only on a paid plan with no included credits.
select pg_temp.fixture('18', 0);
create temporary table b2_pack as select pg_temp.pack('18', '1', 900, interval '10 days') as id;
create temporary table b2_res as select * from pg_temp.reserve('18');
select ok((select success and reserved_credits = 900 from b2_res),
  'paid packs only: a pack extends a paid plan with no included credits');
select is(pg_temp.remaining((select id from b2_pack)), 0::numeric,
  'paid packs only: the pack holds the reservation');
select is(pg_temp.used('18'), 0::numeric,
  'paid packs only: the empty included balance is untouched');

-- C: mixed. 600 included + packs 700 (expires first) and 1000.
select pg_temp.fixture('13', 600);
create temporary table c_pack1 as select pg_temp.pack('13', '1', 700, interval '5 days') as id;
create temporary table c_pack2 as select pg_temp.pack('13', '2', 1000, interval '20 days') as id;
create temporary table c_res as select * from pg_temp.reserve('13');
select ok((select success and reserved_credits = 2000 from c_res),
  'mixed: 600 included + 1700 packs reserves the 2000 cap');
select is(pg_temp.used('13'), 600::numeric,
  'mixed: the included balance is drawn first');
select is(pg_temp.remaining((select id from c_pack1)), 0::numeric,
  'mixed: the earliest-expiring pack is drawn next');
select is(pg_temp.remaining((select id from c_pack2)), 300::numeric,
  'mixed: the later pack covers the rest');
select is((select pack_amount from private.ai_credit_reservations
  where id = (select reservation_id from c_res)), 1400::numeric,
  'mixed: the reservation records its pack share');

-- C settles through the Live session path with small usage.
insert into private.ai_live_sessions (
  user_id, access_ws_id, billing_ws_id, model_id, pricing_id,
  reservation_id, reserved_credits, expires_at
)
select pg_temp.user_id('13'), pg_temp.ws_id('13'), pg_temp.ws_id('13'),
  'gemini-3.1-flash-live-preview',
  (select id from private.ai_live_model_prices
    where model_id = 'gemini-3.1-flash-live-preview'
    order by effective_at desc limit 1),
  (select reservation_id from c_res), 2000, now() + interval '5 minutes';
create temporary table c_close as
select settled.* from private.settle_ai_live_session(
  (select id from private.ai_live_sessions
    where reservation_id = (select reservation_id from c_res)),
  pg_temp.user_id('13'), 0,
  jsonb_build_object('inputTextTokens', 1000, 'inputAudioTokens', 0,
    'inputImageTokens', 0, 'inputVideoTokens', 0, 'outputTextTokens', 0,
    'outputAudioTokens', 0, 'thinkingTokens', 0, 'searchQueries', 0),
  true
) as settled;
select ok((select success and closed and billed_credits > 0
  and billed_credits < 600 from c_close),
  'mixed: settlement bills less than the included share');
select is(pg_temp.remaining((select id from c_pack2)), 1000::numeric,
  'refund: the last-drawn pack is refunded first, in full');
select is(pg_temp.remaining((select id from c_pack1)), 700::numeric,
  'refund: the earlier pack is refunded next, in full');
select is(pg_temp.used('13'), (select billed_credits from c_close),
  'refund: the included balance keeps only the billed credits');
select ok((select status = 'committed' and pack_amount = 0
  and amount = (select billed_credits from c_close)
  from private.ai_credit_reservations
  where id = (select reservation_id from c_res)),
  'refund: the committed reservation records billed credits from included only');
select is((select (metadata ->> 'pack_credits')::numeric
  from public.ai_credit_transactions
  where metadata ->> 'live_session_id' = (select id::text
    from private.ai_live_sessions
    where reservation_id = (select reservation_id from c_res))), 0::numeric,
  'refund: the ledger records no pack consumption');

-- A second close is refused and refunds nothing.
create temporary table c_close_again as
select settled.* from private.settle_ai_live_session(
  (select id from private.ai_live_sessions
    where reservation_id = (select reservation_id from c_res)),
  pg_temp.user_id('13'), 1,
  jsonb_build_object('inputTextTokens', 1000, 'inputAudioTokens', 0,
    'inputImageTokens', 0, 'inputVideoTokens', 0, 'outputTextTokens', 0,
    'outputAudioTokens', 0, 'thinkingTokens', 0, 'searchQueries', 0),
  true
) as settled;
select ok((select not success and error_code = 'RESERVATION_NOT_ACTIVE'
  from c_close_again), 'second close: refused as RESERVATION_NOT_ACTIVE');
select ok(pg_temp.used('13') = (select billed_credits from c_close)
  and pg_temp.remaining((select id from c_pack2)) = 1000
  and pg_temp.remaining((select id from c_pack1)) = 700,
  'second close: no balance or pack changes');

-- D: refused below the minimum; nothing is held.
select pg_temp.fixture('14', 200);
create temporary table d_pack as select pg_temp.pack('14', '1', 200, interval '5 days') as id;
create temporary table d_res as select * from pg_temp.reserve('14');
select ok((select not success and error_code = 'INSUFFICIENT_CREDITS' from d_res),
  'refusal: 200 included + 200 packs is below the 500 minimum');
select is(pg_temp.used('14'), 0::numeric, 'refusal: included is untouched');
select is(pg_temp.remaining((select id from d_pack)), 200::numeric,
  'refusal: the pack is untouched');

-- E: a pack is never overdrawn by back-to-back starts.
select pg_temp.fixture('15', 0);
create temporary table e_pack as select pg_temp.pack('15', '1', 1200, interval '5 days') as id;
create temporary table e_first as select * from pg_temp.reserve('15');
create temporary table e_second as select * from pg_temp.reserve('15');
select ok((select success and reserved_credits = 1200 from e_first),
  'drain: the first start takes the whole pack');
select ok((select not success and error_code = 'INSUFFICIENT_CREDITS' from e_second),
  'drain: the second start is refused, not overdrawn');
select is(pg_temp.remaining((select id from e_pack)), 0::numeric,
  'drain: the pack ends at zero, never negative');

-- F: a partial refund returns pack credits before included ones.
select pg_temp.fixture('16', 100);
create temporary table f_pack as select pg_temp.pack('16', '1', 900, interval '5 days') as id;
create temporary table f_res as select * from pg_temp.reserve('16');
create temporary table f_refund as
select private.refund_ai_credit_reservation_packs(
  (select reservation_id from f_res), 700) as refunded;
select is((select refunded from f_refund), 700::numeric,
  'partial refund: 700 of the 900 pack share returns to the pack');
select is(pg_temp.remaining((select id from f_pack)), 700::numeric,
  'partial refund: the pack keeps 200 consumed');
select is((select pack_amount from private.ai_credit_reservations
  where id = (select reservation_id from f_res)), 200::numeric,
  'partial refund: the reservation pack share shrinks to 200');

-- G: an expired reservation returns packs and included credits.
select pg_temp.fixture('17', 300);
create temporary table g_pack as select pg_temp.pack('17', '1', 700, interval '5 days') as id;
create temporary table g_res as select * from pg_temp.reserve('17');
update private.ai_credit_reservations
set expires_at = now() - interval '1 minute'
where id = (select reservation_id from g_res);
do $release$
begin
  perform public._release_expired_ai_credit_reservations(
    (select balance_id from private.ai_credit_reservations
      where id = (select reservation_id from g_res)));
end
$release$;
select is(pg_temp.remaining((select id from g_pack)), 700::numeric,
  'expiry: the pack share returns to the pack');
select is(pg_temp.used('17'), 0::numeric,
  'expiry: the included share returns to the balance');
select is((select status from private.ai_credit_reservations
  where id = (select reservation_id from g_res)), 'expired',
  'expiry: the reservation is marked expired');
select is((select count(*)::integer
  from private.ai_credit_reservation_pack_draws
  where reservation_id = (select reservation_id from g_res)
    and refunded = amount), 1,
  'expiry: every pack draw is fully refunded');

-- H: a renewal starts a new grant; a hold from the old grant is forfeited.
select pg_temp.fixture('19', 0);
create temporary table h_pack as select pg_temp.pack('19', '1', 900, interval '10 days') as id;
create temporary table h_res as select * from pg_temp.reserve('19');
create temporary table h_sync as
select * from private.sync_credit_pack_purchase(
  pg_temp.ws_id('19'), '32000000-0000-4000-8000-000000009999',
  'live-pack-191', 900, 'active',
  (select granted_at + interval '30 days'
    from public.workspace_credit_pack_purchases
    where id = (select id from h_pack)),
  now() + interval '40 days');
select is(pg_temp.remaining((select id from h_pack)), 900::numeric,
  'renewal: the new grant starts full');
create temporary table h_refund as
select private.refund_ai_credit_reservation_packs(
  (select reservation_id from h_res), 900) as settled;
select is(pg_temp.remaining((select id from h_pack)), 900::numeric,
  'renewal: an old-grant refund does not credit the new grant');
select is((select forfeited from private.ai_credit_reservation_pack_draws
  where reservation_id = (select reservation_id from h_res)), 900::numeric,
  'renewal: the old-grant hold is forfeited');

-- I: a same-period webhook never restores credits an open hold took.
select pg_temp.fixture('20', 0);
create temporary table i_pack as select pg_temp.pack('20', '1', 1000, interval '10 days') as id;
update public.workspace_credit_pack_purchases set tokens_remaining = 600
where id = (select id from i_pack);
create temporary table i_res as select * from pg_temp.reserve('20');
create temporary table i_sync as
select * from private.sync_credit_pack_purchase(
  pg_temp.ws_id('20'), '32000000-0000-4000-8000-000000009999',
  'live-pack-201', 1000, 'active',
  (select granted_at from public.workspace_credit_pack_purchases
    where id = (select id from i_pack)),
  now() + interval '40 days');
select ok((select success and reserved_credits = 600 from i_res),
  'webhook: the hold took the remaining 600');
select is(pg_temp.remaining((select id from i_pack)), 0::numeric,
  'webhook: a same-period event keeps the held balance at zero');
create temporary table i_cancel as
select * from private.sync_credit_pack_purchase(
  pg_temp.ws_id('20'), '32000000-0000-4000-8000-000000009999',
  'live-pack-201', 1000, 'canceled',
  (select granted_at from public.workspace_credit_pack_purchases
    where id = (select id from i_pack)),
  now() + interval '40 days');
create temporary table i_refund as
select private.refund_ai_credit_reservation_packs(
  (select reservation_id from i_res), 600) as settled;
select is(pg_temp.remaining((select id from i_pack)), 0::numeric,
  'webhook: a hold refund into a canceled pack is forfeited');

-- N: a same-period retained replay never reopens a canceled grant.
select pg_temp.fixture('25', 0);
create temporary table n_pack as select pg_temp.pack('25', '1', 1000, interval '10 days') as id;
create temporary table n_res as select * from pg_temp.reserve('25');
create temporary table n_cancel as
select * from private.sync_credit_pack_purchase(
  pg_temp.ws_id('25'), '32000000-0000-4000-8000-000000009999',
  'live-pack-251', 1000, 'canceled',
  (select granted_at from public.workspace_credit_pack_purchases
    where id = (select id from n_pack)),
  now() + interval '40 days');
create temporary table n_replay as
select * from private.sync_credit_pack_purchase(
  pg_temp.ws_id('25'), '32000000-0000-4000-8000-000000009999',
  'live-pack-251', 1000, 'active',
  (select granted_at from public.workspace_credit_pack_purchases
    where id = (select id from n_pack)),
  now() + interval '40 days');
select ok((select status = 'canceled' and tokens_remaining = 0
  from public.workspace_credit_pack_purchases where id = (select id from n_pack)),
  'replay: a same-period active event keeps the canceled grant closed');
create temporary table n_refund as
select private.refund_ai_credit_reservation_packs(
  (select reservation_id from n_res), 1000) as settled;
select ok(pg_temp.remaining((select id from n_pack)) = 0
  and (select forfeited = 1000 from private.ai_credit_reservation_pack_draws
    where reservation_id = (select reservation_id from n_res)),
  'replay: a hold refund after the replay is still forfeited');

-- Embedding holds share packs with Live and follow the same grant rules.
update public.ai_credit_plan_allocations set allowed_models = '{}'
where tier = 'PRO' and is_active;
insert into public.ai_credit_feature_access (tier, feature, enabled)
values ('PRO', 'embeddings', true)
on conflict (tier, feature) do update set enabled = true;

create function pg_temp.embed(p_suffix text) returns uuid language sql as $$
  select reservation_id from public.reserve_metered_embedding_credits(
    pg_temp.ws_id(p_suffix), pg_temp.user_id(p_suffix),
    'google/gemini-embedding-2', 1000
  ) where success;
$$;
create temporary table embed_cost as
select greatest(1, private.compute_ai_cost_from_gateway(
  'google/gemini-embedding-2', 1000, 0, 0, 0, 0) / 0.0001
  * (select coalesce(markup_multiplier, 1) from public.ai_credit_plan_allocations
    where tier = 'PRO' and is_active limit 1)) as credits;

-- K: a Live hold and an embedding hold on one pack both return to it.
select pg_temp.fixture('21', 0);
create temporary table k_pack as select pg_temp.pack('21', '1', 2600, interval '10 days') as id;
create temporary table k_live as select * from pg_temp.reserve('21');
create temporary table k_embed as select pg_temp.embed('21') as id;
select ok((select id is not null from k_embed)
  and abs(pg_temp.remaining((select id from k_pack))
    - (600 - (select credits from embed_cost))) < 0.001,
  'shared pack: Live holds 2000 and the embedding hold draws the rest');
select ok((select (payg_purchases -> 0 ->> 'granted_at') is not null
  from private.ai_embedding_credit_reservations
  where id = (select id from k_embed)),
  'shared pack: the embedding draw records its grant');
create temporary table k_release as
select * from public.release_metered_embedding_credits((select id from k_embed));
create temporary table k_refund as
select private.refund_ai_credit_reservation_packs(
  (select reservation_id from k_live), 2000) as settled;
select is(pg_temp.remaining((select id from k_pack)), 2600::numeric,
  'shared pack: both holds refund to the same retained grant');

-- K2: depleting a pack is not a revocation.
select pg_temp.fixture('22', 0);
create temporary table k2_pack as select pg_temp.pack('22', '1', 1000, interval '10 days') as id;
-- Pack balances keep 4 decimals; leave exactly enough for one embedding hold.
update public.workspace_credit_pack_purchases
set tokens_remaining = ceil((select credits from embed_cost) * 10000) / 10000
where id = (select id from k2_pack);
create temporary table k2_start as
select tokens_remaining from public.workspace_credit_pack_purchases
where id = (select id from k2_pack);
create temporary table k2_embed as select pg_temp.embed('22') as id;
select ok(pg_temp.remaining((select id from k2_pack)) < 0.001
  and (select status = 'active' from public.workspace_credit_pack_purchases
    where id = (select id from k2_pack)),
  'depletion: an embedding hold empties the pack but keeps it active');
create temporary table k2_release as
select * from public.release_metered_embedding_credits((select id from k2_embed));
select ok(abs(pg_temp.remaining((select id from k2_pack))
    - (select tokens_remaining from k2_start)) < 0.001,
  'depletion: the refund returns to the still-retained grant');

-- L: an embedding refund after a renewal is forfeited.
select pg_temp.fixture('23', 0);
create temporary table l_pack as select pg_temp.pack('23', '1', 1000, interval '10 days') as id;
create temporary table l_embed as select pg_temp.embed('23') as id;
create temporary table l_sync as
select * from private.sync_credit_pack_purchase(
  pg_temp.ws_id('23'), '32000000-0000-4000-8000-000000009999',
  'live-pack-231', 1000, 'active',
  (select granted_at + interval '30 days' from public.workspace_credit_pack_purchases
    where id = (select id from l_pack)),
  now() + interval '40 days');
create temporary table l_release as
select * from public.release_metered_embedding_credits((select id from l_embed));
select ok(pg_temp.remaining((select id from l_pack)) = 1000
  and (select status = 'active' from public.workspace_credit_pack_purchases
    where id = (select id from l_pack)),
  'renewal: an old embedding hold does not credit or reactivate the new grant');

-- M: a delayed revocation from the previous period is ignored.
select pg_temp.fixture('24', 0);
create temporary table m_pack as select pg_temp.pack('24', '1', 1000, interval '10 days') as id;
create temporary table m_old as
select granted_at from public.workspace_credit_pack_purchases
where id = (select id from m_pack);
create temporary table m_renew as
select * from private.sync_credit_pack_purchase(
  pg_temp.ws_id('24'), '32000000-0000-4000-8000-000000009999',
  'live-pack-241', 1000, 'active',
  (select granted_at + interval '30 days' from m_old), now() + interval '40 days');
create temporary table m_late as
select * from private.sync_credit_pack_purchase(
  pg_temp.ws_id('24'), '32000000-0000-4000-8000-000000009999',
  'live-pack-241', 1000, 'canceled',
  (select granted_at from m_old), now() + interval '10 days');
select ok((select status = 'active' and tokens_remaining = 1000
    and granted_at = (select granted_at + interval '30 days' from m_old)
  from public.workspace_credit_pack_purchases where id = (select id from m_pack)),
  'ordering: a delayed old-period cancellation never touches the renewed grant');

select ok(
  not has_function_privilege('service_role',
    'private.refund_credit_pack_hold(uuid,numeric,timestamptz,timestamptz)', 'execute')
  and not has_function_privilege('service_role',
    'private.refund_ai_credit_reservation_packs(uuid,numeric)', 'execute'),
  'refund helpers are internal: service_role cannot execute them'
);

-- The sweep is server-only: no client role may call it directly.
select ok(not has_function_privilege('anon',
    'public._release_expired_ai_credit_reservations(uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public._release_expired_ai_credit_reservations(uuid)', 'execute')
  and has_function_privilege('service_role',
    'public._release_expired_ai_credit_reservations(uuid)', 'execute'),
  'sweep: only service_role can execute the sweep');

select * from finish();
rollback;
