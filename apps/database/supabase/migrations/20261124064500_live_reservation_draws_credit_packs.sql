-- Mira Live reservations draw on purchased credit packs.
--
-- begin_ai_live_session reserves least(2000, floor(included + packs)) and
-- refuses below 500. The reservation now takes that amount from the included
-- balance first, then from active, unexpired, positive packs (earliest expiry
-- first), so a pack helps a Live start instead of blocking it. Each pack draw
-- is recorded so settlement and expiry refund unused credits to the same
-- sources in reverse order: packs (last drawn first), then the included
-- balance. Other reservations draw no packs (pack_amount = 0) and keep their
-- behaviour.
--
-- Live is for paid plans: packs extend the budget only when the billed
-- workspace is on a paid tier (PLUS, PRO, ENTERPRISE); a FREE workspace never
-- draws packs. Each draw records the pack grant (granted_at) it came from. A
-- refund returns to that grant only while it is current and retained;
-- otherwise (a renewal reset the pack, or it was revoked) the refund is
-- forfeited rather than credited to a newer grant.
--
-- Lock order, everywhere these rows are written: the balance row, then the
-- packs in one batch sorted by id, then the reservation, then the Live
-- session. Acquiring pack locks in a single sorted batch keeps concurrent
-- starts, settlements and expiry sweeps on one workspace deadlock-free.

alter table private.ai_credit_reservations
  add column pack_amount numeric(14, 4) not null default 0;

alter table private.ai_credit_reservations
  add constraint ai_credit_reservations_pack_amount_check
  check (pack_amount >= 0 and pack_amount <= amount);

create table private.ai_credit_reservation_pack_draws (
  reservation_id uuid not null
    references private.ai_credit_reservations (id) on delete cascade,
  pack_purchase_id uuid not null
    references public.workspace_credit_pack_purchases (id) on delete cascade,
  draw_order smallint not null check (draw_order >= 0),
  amount numeric(14, 4) not null check (amount > 0),
  pack_granted_at timestamptz not null,
  refunded numeric(14, 4) not null default 0,
  forfeited numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  primary key (reservation_id, pack_purchase_id),
  unique (reservation_id, draw_order),
  constraint ai_credit_reservation_pack_draws_refund_check
    check (refunded >= 0 and forfeited >= 0 and refunded + forfeited <= amount)
);

create index ai_credit_reservation_pack_draws_pack_idx
  on private.ai_credit_reservation_pack_draws (pack_purchase_id);

alter table private.ai_credit_reservation_pack_draws enable row level security;
revoke all on table private.ai_credit_reservation_pack_draws
  from public, anon, authenticated;
grant all on table private.ai_credit_reservation_pack_draws to service_role;
create policy "Service role manages reservation pack draws"
  on private.ai_credit_reservation_pack_draws for all to service_role
  using (true) with check (true);

comment on table private.ai_credit_reservation_pack_draws is
  'Credit-pack amounts held by a credit reservation, refunded in reverse draw order.';

-- tuturuuu: no-grant (internal)
-- Returns one held pack amount to its pack when the pack is still on the
-- grant the hold drew from and that grant is retained; otherwise the amount
-- is forfeited (returns false). It never changes a pack's status. Holds that
-- predate grant tracking (p_draw_granted_at null) refund only when the
-- current grant already existed when the hold was taken. The caller holds
-- the pack row lock, taken in id order.
create function private.refund_credit_pack_hold(
  p_pack_id uuid,
  p_amount numeric,
  p_draw_granted_at timestamptz,
  p_hold_created_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pack record;
begin
  if coalesce(p_amount, 0) <= 0 then
    return false;
  end if;

  select purchase.granted_at, purchase.status::text as status
  into v_pack
  from public.workspace_credit_pack_purchases as purchase
  where purchase.id = p_pack_id;

  if not found
    or v_pack.status not in ('active', 'trialing', 'past_due', 'incomplete')
    or (p_draw_granted_at is not null and v_pack.granted_at <> p_draw_granted_at)
    or (p_draw_granted_at is null and v_pack.granted_at > p_hold_created_at)
  then
    return false;
  end if;

  update public.workspace_credit_pack_purchases
  set tokens_remaining = least(tokens_granted, tokens_remaining + p_amount),
      updated_at = now()
  where id = p_pack_id;
  return true;
end;
$$;

-- tuturuuu: no-grant (internal)
-- Settles up to p_refund credits of a reservation's pack draws, last drawn
-- first, and returns the pack share settled. A draw whose pack is still on
-- the same retained grant is refunded to it; otherwise it is forfeited. The
-- caller already holds the balance, pack and reservation locks in the
-- documented order.
create function private.refund_ai_credit_reservation_packs(
  p_reservation_id uuid,
  p_refund numeric
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_draw record;
  v_left numeric := greatest(coalesce(p_refund, 0), 0);
  v_take numeric;
  v_total numeric := 0;
begin
  if v_left <= 0 then
    return 0;
  end if;

  for v_draw in
    select draw.pack_purchase_id, draw.amount, draw.refunded, draw.forfeited,
      draw.pack_granted_at, draw.created_at
    from private.ai_credit_reservation_pack_draws as draw
    where draw.reservation_id = p_reservation_id
      and draw.refunded + draw.forfeited < draw.amount
    order by draw.draw_order desc
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_draw.amount - v_draw.refunded - v_draw.forfeited);

    if private.refund_credit_pack_hold(
      v_draw.pack_purchase_id, v_take, v_draw.pack_granted_at, v_draw.created_at
    ) then
      update private.ai_credit_reservation_pack_draws
      set refunded = refunded + v_take
      where reservation_id = p_reservation_id
        and pack_purchase_id = v_draw.pack_purchase_id;
    else
      update private.ai_credit_reservation_pack_draws
      set forfeited = forfeited + v_take
      where reservation_id = p_reservation_id
        and pack_purchase_id = v_draw.pack_purchase_id;
    end if;

    v_left := v_left - v_take;
    v_total := v_total + v_take;
  end loop;

  update private.ai_credit_reservations
  set pack_amount = greatest(pack_amount - v_total, 0), updated_at = now()
  where id = p_reservation_id;

  return v_total;
end;
$$;

-- Reserves Live credits: least(p_cap, floor(included + packs)), refused below
-- p_minimum, drawn from the included balance first and then from packs.
-- The balance row and then every pack of the workspace are locked FOR UPDATE
-- before anything else, so concurrent starts serialize and no pack can be
-- overdrawn.
create function private.reserve_live_ai_credits(
  p_ws_id uuid,
  p_user_id uuid,
  p_cap numeric,
  p_minimum numeric,
  p_model_id text,
  p_feature text,
  p_metadata jsonb,
  p_expires_in_seconds integer
)
returns table (
  success boolean,
  reservation_id uuid,
  reserved_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_balance record;
  v_included numeric;
  v_packs numeric;
  v_total numeric;
  v_from_included numeric;
  v_left numeric;
  v_take numeric;
  v_order smallint := 0;
  v_pack record;
  v_reservation_id uuid;
  v_paid boolean;
begin
  select * into v_balance
  from public.get_or_create_credit_balance(p_ws_id, p_user_id);
  if v_balance.id is null then
    return query select false, null::uuid, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  perform 1
  from public.workspace_ai_credit_balances as balance
  where balance.id = v_balance.id
  for update;

  -- Every pack this start, the sweep below or a settlement on this workspace
  -- can touch, locked once and in id order.
  perform 1
  from public.workspace_credit_pack_purchases as purchase
  where purchase.ws_id = p_ws_id
  order by purchase.id
  for update;

  perform public._release_expired_ai_credit_reservations(v_balance.id);

  select balance.total_allocated + balance.bonus_credits - balance.total_used
  into v_included
  from public.workspace_ai_credit_balances as balance
  where balance.id = v_balance.id;
  v_included := greatest(coalesce(v_included, 0), 0);

  -- Packs extend Live only on a paid plan.
  v_paid := public._resolve_workspace_tier(p_ws_id)::text
    in ('PLUS', 'PRO', 'ENTERPRISE');
  select coalesce(sum(purchase.tokens_remaining), 0)
  into v_packs
  from public.workspace_credit_pack_purchases as purchase
  where v_paid
    and purchase.ws_id = p_ws_id
    and purchase.status = 'active'
    and purchase.expires_at > now()
    and purchase.tokens_remaining > 0;

  v_total := least(p_cap, floor(v_included + v_packs));
  if v_total < p_minimum then
    return query select false, null::uuid, 0::numeric,
      'INSUFFICIENT_CREDITS'::text;
    return;
  end if;

  v_from_included := least(v_included, v_total);
  if v_from_included > 0 then
    update public.workspace_ai_credit_balances
    set total_used = total_used + v_from_included, updated_at = now()
    where id = v_balance.id;
  end if;

  insert into private.ai_credit_reservations (
    ws_id, user_id, balance_id, amount, pack_amount, model_id, feature,
    status, metadata, expires_at
  ) values (
    p_ws_id, p_user_id, v_balance.id, v_total, v_total - v_from_included,
    p_model_id, p_feature, 'reserved', coalesce(p_metadata, '{}'::jsonb),
    now() + make_interval(secs => greatest(coalesce(p_expires_in_seconds, 1800), 60))
  )
  returning id into v_reservation_id;

  v_left := v_total - v_from_included;
  for v_pack in
    select purchase.id, purchase.tokens_remaining, purchase.granted_at
    from public.workspace_credit_pack_purchases as purchase
    where v_paid
      and purchase.ws_id = p_ws_id
      and purchase.status = 'active'
      and purchase.expires_at > now()
      and purchase.tokens_remaining > 0
    order by purchase.expires_at, purchase.created_at, purchase.id
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_pack.tokens_remaining);

    update public.workspace_credit_pack_purchases
    set tokens_remaining = tokens_remaining - v_take, updated_at = now()
    where id = v_pack.id;

    insert into private.ai_credit_reservation_pack_draws (
      reservation_id, pack_purchase_id, draw_order, amount, pack_granted_at
    ) values (v_reservation_id, v_pack.id, v_order, v_take, v_pack.granted_at);

    v_order := v_order + 1;
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    -- Locked rows cannot change; anything else is a broken invariant.
    raise exception 'Live reservation could not draw its full amount';
  end if;

  return query select true, v_reservation_id, v_total, null::text;
end;
$$;

create or replace function private.begin_ai_live_session(
  p_user_id uuid,
  p_access_ws_id uuid,
  p_billing_ws_id uuid,
  p_model_id text,
  p_expires_at timestamptz
)
returns table (
  success boolean,
  live_session_id uuid,
  reservation_id uuid,
  reserved_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_allowance record;
  v_reservation record;
  v_pricing_id uuid;
  v_gateway_model_id text;
  v_session_id uuid;
begin
  v_gateway_model_id := case
    when position('/' in p_model_id) > 0 then p_model_id
    else 'google/' || p_model_id
  end;

  -- Model and feature entitlement; the credit amount is decided below.
  select * into v_allowance
  from public.check_ai_credit_allowance(
    p_billing_ws_id,
    v_gateway_model_id,
    'voice_live',
    null,
    p_user_id
  );
  if not coalesce(v_allowance.allowed, false) then
    return query select false, null::uuid, null::uuid, 0::numeric,
      coalesce(v_allowance.error_code, 'CREDIT_CHECK_FAILED')::text;
    return;
  end if;

  select price.id into v_pricing_id
  from private.ai_live_model_prices as price
  where price.model_id = p_model_id and price.effective_at <= now()
  order by price.effective_at desc
  limit 1;
  if v_pricing_id is null then
    return query select false, null::uuid, null::uuid, 0::numeric,
      'PRICING_UNAVAILABLE'::text;
    return;
  end if;

  select * into v_reservation
  from private.reserve_live_ai_credits(
    p_billing_ws_id,
    p_user_id,
    2000,
    500,
    v_gateway_model_id,
    'voice_live',
    jsonb_build_object('accessWsId', p_access_ws_id, 'source', 'mira_live'),
    600
  );
  if not coalesce(v_reservation.success, false)
    or v_reservation.reservation_id is null then
    return query select false, null::uuid, null::uuid, 0::numeric,
      coalesce(v_reservation.error_code, 'RESERVATION_FAILED')::text;
    return;
  end if;

  insert into private.ai_live_sessions (
    user_id, access_ws_id, billing_ws_id, model_id, pricing_id,
    reservation_id, reserved_credits, expires_at
  ) values (
    p_user_id, p_access_ws_id, p_billing_ws_id, p_model_id, v_pricing_id,
    v_reservation.reservation_id, v_reservation.reserved_credits, p_expires_at
  ) returning id into v_session_id;

  return query select true, v_session_id, v_reservation.reservation_id,
    v_reservation.reserved_credits, null::text;
end;
$$;

-- Settlement refunds unused credits to packs first, then included.
CREATE OR REPLACE FUNCTION private.settle_ai_live_session(
  p_live_session_id UUID,
  p_user_id UUID,
  p_sequence INTEGER,
  p_usage JSONB,
  p_close BOOLEAN DEFAULT false
)
RETURNS TABLE (
  success BOOLEAN,
  billed_credits NUMERIC,
  provider_cost_usd NUMERIC,
  remaining_reserved_credits NUMERIC,
  closed BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_session private.ai_live_sessions%ROWTYPE;
  v_price private.ai_live_model_prices%ROWTYPE;
  v_reservation private.ai_credit_reservations%ROWTYPE;
  v_balance public.workspace_ai_credit_balances%ROWTYPE;
  v_input_text BIGINT := coalesce((p_usage ->> 'inputTextTokens')::BIGINT, 0);
  v_input_audio BIGINT := coalesce((p_usage ->> 'inputAudioTokens')::BIGINT, 0);
  v_input_image BIGINT := coalesce((p_usage ->> 'inputImageTokens')::BIGINT, 0);
  v_input_video BIGINT := coalesce((p_usage ->> 'inputVideoTokens')::BIGINT, 0);
  v_output_text BIGINT := coalesce((p_usage ->> 'outputTextTokens')::BIGINT, 0);
  v_output_audio BIGINT := coalesce((p_usage ->> 'outputAudioTokens')::BIGINT, 0);
  v_thinking BIGINT := coalesce((p_usage ->> 'thinkingTokens')::BIGINT, 0);
  v_search INTEGER := coalesce((p_usage ->> 'searchQueries')::INTEGER, 0);
  v_cost NUMERIC;
  v_markup NUMERIC := 1;
  v_credits NUMERIC;
  v_refund NUMERIC;
  v_pack_refund NUMERIC;
  v_pack_consumed NUMERIC;
BEGIN
  -- Unlocked reads only locate the balance; every decision below is made on
  -- rows re-read under locks taken in the documented order.
  SELECT * INTO v_session
  FROM private.ai_live_sessions
  WHERE id = p_live_session_id;
  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      false, 'LIVE_SESSION_NOT_FOUND'::TEXT;
    RETURN;
  END IF;
  SELECT * INTO v_reservation
  FROM private.ai_credit_reservations
  WHERE id = v_session.reservation_id;

  SELECT * INTO v_balance
  FROM public.workspace_ai_credit_balances
  WHERE id = v_reservation.balance_id
  FOR UPDATE;
  PERFORM 1
  FROM public.workspace_credit_pack_purchases AS purchase
  WHERE purchase.id IN (
    SELECT draw.pack_purchase_id
    FROM private.ai_credit_reservation_pack_draws AS draw
    WHERE draw.reservation_id = v_reservation.id
  )
  ORDER BY purchase.id
  FOR UPDATE;
  SELECT * INTO v_reservation
  FROM private.ai_credit_reservations
  WHERE id = v_session.reservation_id
  FOR UPDATE;
  SELECT * INTO v_session
  FROM private.ai_live_sessions
  WHERE id = p_live_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      false, 'LIVE_SESSION_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  -- Closing a session that is already closed never refunds twice.
  IF p_close AND v_session.status <> 'active' THEN
    RETURN QUERY SELECT false, v_session.billed_credits,
      v_session.provider_cost_usd, 0::NUMERIC, false,
      'RESERVATION_NOT_ACTIVE'::TEXT;
    RETURN;
  END IF;

  IF v_session.status <> 'active' OR p_sequence <= v_session.last_sequence THEN
    RETURN QUERY SELECT true, v_session.billed_credits,
      v_session.provider_cost_usd,
      greatest(v_session.reserved_credits - v_session.billed_credits, 0),
      v_session.status <> 'active', NULL::TEXT;
    RETURN;
  END IF;

  IF least(
    v_input_text, v_input_audio, v_input_image, v_input_video,
    v_output_text, v_output_audio, v_thinking, v_search
  ) < 0 OR greatest(
    v_input_text, v_input_audio, v_input_image, v_input_video,
    v_output_text, v_output_audio, v_thinking
  ) > 100000000 OR v_search > 10000 THEN
    RETURN QUERY SELECT false, v_session.billed_credits,
      v_session.provider_cost_usd,
      greatest(v_session.reserved_credits - v_session.billed_credits, 0),
      false, 'INVALID_USAGE'::TEXT;
    RETURN;
  END IF;

  IF v_input_text < v_session.input_text_tokens
    OR v_input_audio < v_session.input_audio_tokens
    OR v_input_image < v_session.input_image_tokens
    OR v_input_video < v_session.input_video_tokens
    OR v_output_text < v_session.output_text_tokens
    OR v_output_audio < v_session.output_audio_tokens
    OR v_thinking < v_session.thinking_tokens
    OR v_search < v_session.search_queries THEN
    RETURN QUERY SELECT false, v_session.billed_credits,
      v_session.provider_cost_usd,
      greatest(v_session.reserved_credits - v_session.billed_credits, 0),
      false, 'USAGE_REGRESSION'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_price
  FROM private.ai_live_model_prices
  WHERE id = v_session.pricing_id;

  v_cost :=
    (v_input_text * v_price.input_text_per_million / 1000000) +
    (v_input_audio * v_price.input_audio_per_million / 1000000) +
    ((v_input_image + v_input_video) * v_price.input_image_video_per_million / 1000000) +
    ((v_output_text + v_thinking) * v_price.output_text_per_million / 1000000) +
    (v_output_audio * v_price.output_audio_per_million / 1000000) +
    (v_search * v_price.search_per_query);

  SELECT coalesce(allocation.markup_multiplier, 1) INTO v_markup
  FROM public.ai_credit_plan_allocations AS allocation
  WHERE allocation.tier = public._resolve_workspace_tier(v_session.billing_ws_id)
    AND allocation.is_active
  LIMIT 1;

  v_credits := CASE
    WHEN v_cost <= 0 THEN 0
    ELSE greatest(1, (v_cost / 0.0001) * coalesce(v_markup, 1))
  END;
  v_credits := least(v_credits, v_session.reserved_credits);

  UPDATE private.ai_live_sessions
  SET
    last_sequence = p_sequence,
    billed_credits = v_credits,
    provider_cost_usd = v_cost,
    input_text_tokens = v_input_text,
    input_audio_tokens = v_input_audio,
    input_image_tokens = v_input_image,
    input_video_tokens = v_input_video,
    output_text_tokens = v_output_text,
    output_audio_tokens = v_output_audio,
    thinking_tokens = v_thinking,
    search_queries = v_search,
    updated_at = now()
  WHERE id = v_session.id;

  IF p_close THEN
    -- The balance, packs and reservation are already locked above.
    IF v_reservation.status <> 'reserved' THEN
      RETURN QUERY SELECT false, v_credits, v_cost,
        greatest(v_session.reserved_credits - v_credits, 0),
        false, 'RESERVATION_NOT_ACTIVE'::TEXT;
      RETURN;
    END IF;

    -- Unused credits return in reverse draw order: packs, then included.
    v_refund := greatest(v_reservation.amount - v_credits, 0);
    v_pack_refund := private.refund_ai_credit_reservation_packs(
      v_reservation.id, v_refund
    );
    v_pack_consumed := greatest(v_reservation.pack_amount - v_pack_refund, 0);
    UPDATE public.workspace_ai_credit_balances
    SET total_used = greatest(total_used - (v_refund - v_pack_refund), 0),
        updated_at = now()
    WHERE id = v_balance.id;

    UPDATE private.ai_credit_reservations
    SET
      amount = CASE WHEN v_credits > 0 THEN v_credits ELSE amount END,
      status = CASE WHEN v_credits > 0 THEN 'committed' ELSE 'released' END,
      committed_at = CASE WHEN v_credits > 0 THEN now() ELSE NULL END,
      released_at = CASE WHEN v_credits = 0 THEN now() ELSE NULL END,
      metadata = coalesce(metadata, '{}'::JSONB) || jsonb_build_object(
        'live_session_id', v_session.id,
        'provider_cost_usd', v_cost,
        'pricing_id', v_session.pricing_id,
        'usage', p_usage,
        'pack_credits', v_pack_consumed
      ),
      updated_at = now()
    WHERE id = v_reservation.id;

    IF v_credits > 0 THEN
      INSERT INTO public.ai_credit_transactions (
        ws_id, user_id, balance_id, transaction_type, amount, cost_usd,
        model_id, feature, input_tokens, output_tokens, reasoning_tokens,
        search_count, metadata
      ) VALUES (
        v_reservation.ws_id, v_session.user_id, v_balance.id, 'deduction',
        -v_credits, v_cost, 'google/' || v_session.model_id, 'voice_live',
        least(v_input_text + v_input_audio + v_input_image + v_input_video, 2147483647)::INTEGER,
        least(v_output_text + v_output_audio, 2147483647)::INTEGER,
        least(v_thinking, 2147483647)::INTEGER,
        v_search,
        coalesce(v_reservation.metadata, '{}'::jsonb) || jsonb_build_object(
          'live_session_id', v_session.id,
          'pricing_id', v_session.pricing_id,
          'usage', p_usage,
          'included_credits', v_credits - v_pack_consumed,
          'pack_credits', v_pack_consumed
        )
      );
    END IF;

    UPDATE private.ai_live_sessions
    SET status = CASE WHEN expires_at <= now() THEN 'expired' ELSE 'closed' END,
        closed_at = now(), updated_at = now()
    WHERE id = v_session.id;
  END IF;

  RETURN QUERY SELECT true, v_credits, v_cost,
    greatest(v_session.reserved_credits - v_credits, 0),
    p_close, NULL::TEXT;
END;
$$;

revoke all on function private.refund_credit_pack_hold(
  uuid, numeric, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function private.refund_ai_credit_reservation_packs(uuid, numeric)
  from public, anon, authenticated, service_role;
revoke all on function private.reserve_live_ai_credits(
  uuid, uuid, numeric, numeric, text, text, jsonb, integer
) from public, anon, authenticated;
revoke all on function private.begin_ai_live_session(
  uuid, uuid, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function private.settle_ai_live_session(
  uuid, uuid, integer, jsonb, boolean
) from public, anon, authenticated;
grant execute on function private.reserve_live_ai_credits(
  uuid, uuid, numeric, numeric, text, text, jsonb, integer
) to service_role;
grant execute on function private.begin_ai_live_session(
  uuid, uuid, uuid, text, timestamptz
) to service_role;
grant execute on function private.settle_ai_live_session(
  uuid, uuid, integer, jsonb, boolean
) to service_role;
