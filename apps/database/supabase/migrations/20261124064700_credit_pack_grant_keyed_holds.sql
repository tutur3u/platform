-- Every credit-pack writer keeps holds keyed to the grant they drew from.
--
-- Depleting a pack is not a revocation: embedding reservations and metered
-- deductions no longer set a pack to 'canceled' when its balance reaches
-- zero or it expires. Only the Polar projection
-- (private.sync_credit_pack_purchase) sets a pack's status, so refund
-- eligibility follows the grant's retention, not its balance.
--
-- Embedding holds record the pack grant (granted_at) each draw came from and
-- refund through private.refund_credit_pack_hold, the helper Live uses: a
-- refund returns only to the same retained grant, otherwise it is forfeited,
-- and it never reactivates a pack. Holds taken before grant tracking refund
-- only when the current grant already existed when the hold was taken.
--
-- Lock order matches Live: the balance row, then packs in one id-sorted
-- batch, then the holds.

create or replace function public.reserve_metered_embedding_credits(
  p_ws_id uuid,
  p_user_id uuid,
  p_model_id text,
  p_input_tokens integer,
  p_feature text default 'embeddings',
  p_metadata jsonb default '{}'::jsonb,
  p_expires_in_seconds integer default 1800
)
returns table (
  success boolean,
  reservation_id uuid,
  credits_reserved numeric,
  cost_usd numeric,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_tier public.workspace_product_tier;
  v_allocation record;
  v_model record;
  v_feature_access record;
  v_balance record;
  v_cost_usd numeric;
  v_credits numeric;
  v_included_remaining numeric;
  v_payg_remaining numeric;
  v_included_to_consume numeric;
  v_payg_to_consume numeric;
  v_payg_consumed numeric := 0;
  v_pack record;
  v_take numeric;
  v_payg_purchases jsonb := '[]'::jsonb;
  v_new_total_used numeric;
  v_reservation_id uuid;
  v_remaining numeric;
begin
  if p_ws_id is null or coalesce(p_input_tokens, 0) <= 0 then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'INVALID_REQUEST'::text;
    return;
  end if;

  v_tier := public._resolve_workspace_tier(p_ws_id);

  select * into v_allocation
  from public.ai_credit_plan_allocations
  where tier = v_tier
    and is_active = true;

  if not found then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'NO_ALLOCATION'::text;
    return;
  end if;

  if array_length(v_allocation.allowed_models, 1) > 0 then
    if not exists (
      select 1
      from unnest(v_allocation.allowed_models) as allowed_model
      where allowed_model = p_model_id
        or allowed_model = split_part(p_model_id, '/', 2)
        or split_part(allowed_model, '/', 2) = p_model_id
        or split_part(allowed_model, '/', 2) = split_part(p_model_id, '/', 2)
    ) then
      return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'MODEL_NOT_ALLOWED'::text;
      return;
    end if;
  end if;

  select * into v_feature_access
  from public.ai_credit_feature_access
  where tier = v_tier
    and feature = p_feature;

  if not found or not v_feature_access.enabled then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'FEATURE_NOT_ALLOWED'::text;
    return;
  end if;

  select * into v_model
  from private.ai_gateway_models
  where id = p_model_id
    and type = 'embedding'
    and is_enabled = true;

  if not found or coalesce(v_model.input_price_per_token, 0) <= 0 then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'MODEL_PRICING_UNAVAILABLE'::text;
    return;
  end if;

  select * into v_balance
  from public.get_or_create_credit_balance(p_ws_id, p_user_id);

  if not found then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  perform public._release_expired_embedding_credit_reservations(v_balance.id);

  select * into v_balance
  from public.workspace_ai_credit_balances
  where id = v_balance.id
  for update;

  if not found then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  v_cost_usd := private.compute_ai_cost_from_gateway(
    p_model_id,
    p_input_tokens,
    0,
    0,
    0,
    0
  );
  v_credits := (v_cost_usd / 0.0001) * coalesce(v_allocation.markup_multiplier, 1.0);

  if v_credits < 1 then
    v_credits := 1;
  end if;

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);

  if (v_included_remaining + coalesce(v_payg_remaining, 0)) < v_credits then
    return query
    select false, null::uuid, v_credits, v_cost_usd,
      (v_included_remaining + coalesce(v_payg_remaining, 0))::numeric,
      'INSUFFICIENT_CREDITS'::text;
    return;
  end if;

  v_included_to_consume := least(greatest(v_included_remaining, 0), v_credits);
  v_payg_to_consume := v_credits - v_included_to_consume;

  if v_payg_to_consume > 0 then
    -- Packs are locked once, in id order, after the balance (global order).
    perform 1
    from public.workspace_credit_pack_purchases as purchase
    where purchase.ws_id = p_ws_id
    order by purchase.id
    for update;

    for v_pack in
      select id, tokens_remaining, granted_at
      from public.workspace_credit_pack_purchases
      where ws_id = p_ws_id
        and status = 'active'
        and expires_at > now()
        and tokens_remaining > 0
      order by expires_at asc, granted_at asc, created_at asc
    loop
      exit when v_payg_to_consume <= 0;
      v_take := least(v_pack.tokens_remaining, v_payg_to_consume);

      update public.workspace_credit_pack_purchases
      -- A depleted pack stays on its grant; only Polar changes its status.
      set tokens_remaining = tokens_remaining - v_take,
          updated_at = now()
      where id = v_pack.id;

      v_payg_to_consume := v_payg_to_consume - v_take;
      v_payg_consumed := v_payg_consumed + v_take;
      v_payg_purchases := v_payg_purchases || jsonb_build_array(
        jsonb_build_object(
          'id', v_pack.id, 'amount', v_take, 'granted_at', v_pack.granted_at
        )
      );
    end loop;

    if v_payg_to_consume > 0 then
      raise exception 'INSUFFICIENT_CREDITS: PAYG shortfall';
    end if;
  end if;

  if v_included_to_consume > 0 then
    update public.workspace_ai_credit_balances
    set total_used = total_used + v_included_to_consume,
        updated_at = now()
    where id = v_balance.id
    returning total_used into v_new_total_used;
  else
    v_new_total_used := v_balance.total_used;
  end if;

  insert into private.ai_embedding_credit_reservations (
    ws_id,
    user_id,
    balance_id,
    amount,
    included_amount,
    payg_amount,
    payg_purchases,
    model_id,
    feature,
    input_tokens,
    cost_usd,
    status,
    metadata,
    expires_at
  )
  values (
    p_ws_id,
    p_user_id,
    v_balance.id,
    v_credits,
    v_included_to_consume,
    v_payg_consumed,
    v_payg_purchases,
    p_model_id,
    p_feature,
    p_input_tokens,
    v_cost_usd,
    'reserved',
    coalesce(p_metadata, '{}'::jsonb),
    now() + make_interval(secs => greatest(coalesce(p_expires_in_seconds, 1800), 60))
  )
  returning id into v_reservation_id;

  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := (v_balance.total_allocated + v_balance.bonus_credits - v_new_total_used)
    + coalesce(v_payg_remaining, 0);

  return query
  select true, v_reservation_id, v_credits, v_cost_usd, v_remaining, null::text;
end;
$$;

create or replace function public._release_expired_embedding_credit_reservations(
  p_balance_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation record;
  v_purchase jsonb;
begin
  -- Global lock order: the balance, then every pack these holds drew from
  -- in one id-sorted batch, then the holds.
  perform 1
  from public.workspace_ai_credit_balances as balance
  where balance.id = p_balance_id
  for update;

  perform 1
  from public.workspace_credit_pack_purchases as purchase
  where purchase.id in (
    select (item ->> 'id')::uuid
    from private.ai_embedding_credit_reservations as reservation
    cross join lateral jsonb_array_elements(
      coalesce(reservation.payg_purchases, '[]'::jsonb)
    ) as item
    where reservation.balance_id = p_balance_id
      and reservation.status = 'reserved'
      and reservation.expires_at <= now()
  )
  order by purchase.id
  for update;

  for v_reservation in
    select *
    from private.ai_embedding_credit_reservations
    where balance_id = p_balance_id
      and status = 'reserved'
      and expires_at <= now()
    for update
  loop
    if v_reservation.included_amount > 0 then
      update public.workspace_ai_credit_balances
      set total_used = greatest(total_used - v_reservation.included_amount, 0),
          updated_at = now()
      where id = v_reservation.balance_id;
    end if;

    for v_purchase in
      select * from jsonb_array_elements(coalesce(v_reservation.payg_purchases, '[]'::jsonb))
    loop
      perform private.refund_credit_pack_hold(
        (v_purchase ->> 'id')::uuid,
        coalesce((v_purchase ->> 'amount')::numeric, 0),
        (v_purchase ->> 'granted_at')::timestamptz,
        v_reservation.created_at
      );
    end loop;

    update private.ai_embedding_credit_reservations
    set status = 'expired',
        released_at = now(),
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expired_at', now())
    where id = v_reservation.id;
  end loop;
end;
$$;

create or replace function public.release_metered_embedding_credits(
  p_reservation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation record;
  v_purchase jsonb;
  v_total_used numeric;
  v_total_allocated numeric;
  v_bonus_credits numeric;
  v_payg_remaining numeric;
  v_remaining numeric;
  v_balance_id uuid;
  v_payg_purchases jsonb;
begin
  -- Global lock order: the balance, then the packs this hold drew from in one
  -- id-sorted batch, then the hold. balance_id and payg_purchases are set at
  -- reservation and never updated, so the unlocked read only locates the
  -- rows; they are rechecked under lock.
  select r.balance_id, coalesce(r.payg_purchases, '[]'::jsonb)
  into v_balance_id, v_payg_purchases
  from private.ai_embedding_credit_reservations r
  where r.id = p_reservation_id;

  if not found then
    return query select false, 0::numeric, 'RESERVATION_NOT_FOUND'::text;
    return;
  end if;

  perform 1
  from public.workspace_ai_credit_balances as balance
  where balance.id = v_balance_id
  for update;

  perform 1
  from public.workspace_credit_pack_purchases as purchase
  where purchase.id in (
    select (item ->> 'id')::uuid
    from jsonb_array_elements(v_payg_purchases) as item
  )
  order by purchase.id
  for update;

  select r.*, b.total_allocated, b.total_used, b.bonus_credits
  into v_reservation
  from private.ai_embedding_credit_reservations r
  join public.workspace_ai_credit_balances b on b.id = r.balance_id
  where r.id = p_reservation_id
  for update of r;

  if not found then
    return query select false, 0::numeric, 'RESERVATION_NOT_FOUND'::text;
    return;
  end if;

  if v_reservation.balance_id is distinct from v_balance_id
    or coalesce(v_reservation.payg_purchases, '[]'::jsonb) is distinct from v_payg_purchases
  then
    raise exception 'Embedding reservation changed while locking'
      using errcode = '40001';
  end if;

  if v_reservation.status = 'committed' then
    return query select false, 0::numeric, 'RESERVATION_ALREADY_COMMITTED'::text;
    return;
  end if;

  if v_reservation.status in ('released', 'expired') then
    v_payg_remaining := public._get_active_payg_credits(v_reservation.ws_id);
    v_remaining := (v_reservation.total_allocated + v_reservation.bonus_credits - v_reservation.total_used)
      + coalesce(v_payg_remaining, 0);
    return query select true, v_remaining, null::text;
    return;
  end if;

  if v_reservation.included_amount > 0 then
    update public.workspace_ai_credit_balances
    set total_used = greatest(total_used - v_reservation.included_amount, 0),
        updated_at = now()
    where id = v_reservation.balance_id
    returning total_used, total_allocated, bonus_credits
    into v_total_used, v_total_allocated, v_bonus_credits;
  else
    v_total_used := v_reservation.total_used;
    v_total_allocated := v_reservation.total_allocated;
    v_bonus_credits := v_reservation.bonus_credits;
  end if;

  for v_purchase in
    select * from jsonb_array_elements(coalesce(v_reservation.payg_purchases, '[]'::jsonb))
  loop
    perform private.refund_credit_pack_hold(
      (v_purchase ->> 'id')::uuid,
      coalesce((v_purchase ->> 'amount')::numeric, 0),
      (v_purchase ->> 'granted_at')::timestamptz,
      v_reservation.created_at
    );
  end loop;

  update private.ai_embedding_credit_reservations
  set status = 'released',
      released_at = now(),
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = p_reservation_id;

  v_payg_remaining := public._get_active_payg_credits(v_reservation.ws_id);
  v_remaining := (v_total_allocated + v_bonus_credits - v_total_used)
    + coalesce(v_payg_remaining, 0);

  return query select true, v_remaining, null::text;
end;
$$;

create or replace function public.commit_metered_embedding_credits(
  p_reservation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  credits_deducted numeric,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation record;
  v_payg_remaining numeric;
  v_remaining numeric;
  v_balance_id uuid;
begin
  -- Global lock order: the balance, then the hold (the expiry branch takes
  -- packs between them through _release_expired_embedding_credit_reservations).
  -- balance_id is set at reservation and never updated.
  select r.balance_id into v_balance_id
  from private.ai_embedding_credit_reservations r
  where r.id = p_reservation_id;

  if not found then
    return query select false, 0::numeric, 0::numeric, 'RESERVATION_NOT_FOUND'::text;
    return;
  end if;

  perform 1
  from public.workspace_ai_credit_balances as balance
  where balance.id = v_balance_id
  for update;

  select r.*, b.total_allocated, b.total_used, b.bonus_credits
  into v_reservation
  from private.ai_embedding_credit_reservations r
  join public.workspace_ai_credit_balances b on b.id = r.balance_id
  where r.id = p_reservation_id
  for update of r;

  if not found then
    return query select false, 0::numeric, 0::numeric, 'RESERVATION_NOT_FOUND'::text;
    return;
  end if;

  if v_reservation.balance_id is distinct from v_balance_id then
    raise exception 'Embedding reservation changed while locking'
      using errcode = '40001';
  end if;

  if v_reservation.status = 'committed' then
    v_payg_remaining := public._get_active_payg_credits(v_reservation.ws_id);
    v_remaining := (v_reservation.total_allocated + v_reservation.bonus_credits - v_reservation.total_used)
      + coalesce(v_payg_remaining, 0);
    return query select true, v_reservation.amount, v_remaining, null::text;
    return;
  end if;

  if v_reservation.status <> 'reserved' then
    return query select false, 0::numeric, 0::numeric, 'RESERVATION_NOT_ACTIVE'::text;
    return;
  end if;

  if v_reservation.expires_at <= now() then
    perform public._release_expired_embedding_credit_reservations(v_reservation.balance_id);
    return query select false, 0::numeric, 0::numeric, 'RESERVATION_EXPIRED'::text;
    return;
  end if;

  update private.ai_embedding_credit_reservations
  set status = 'committed',
      committed_at = now(),
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = p_reservation_id;

  insert into public.ai_credit_transactions (
    ws_id,
    user_id,
    balance_id,
    transaction_type,
    amount,
    cost_usd,
    model_id,
    feature,
    input_tokens,
    output_tokens,
    reasoning_tokens,
    metadata
  )
  values (
    case when v_reservation.ws_id is not null then v_reservation.ws_id else null end,
    v_reservation.user_id,
    v_reservation.balance_id,
    'deduction',
    -v_reservation.amount,
    v_reservation.cost_usd,
    v_reservation.model_id,
    v_reservation.feature,
    v_reservation.input_tokens,
    0,
    0,
    coalesce(v_reservation.metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'reservation_id', v_reservation.id,
        'credit_split', jsonb_build_object(
          'included', v_reservation.included_amount,
          'payg', v_reservation.payg_amount
        )
      )
  );

  v_payg_remaining := public._get_active_payg_credits(v_reservation.ws_id);
  v_remaining := (v_reservation.total_allocated + v_reservation.bonus_credits - v_reservation.total_used)
    + coalesce(v_payg_remaining, 0);

  return query select true, v_reservation.amount, v_remaining, null::text;
end;
$$;

revoke all on function public.commit_metered_embedding_credits(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_metered_embedding_credits(uuid, jsonb)
  to service_role;

CREATE OR REPLACE FUNCTION public._consume_payg_credits(
  p_ws_id UUID,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_remaining NUMERIC := GREATEST(COALESCE(p_amount, 0), 0);
  v_consumed NUMERIC := 0;
  v_row RECORD;
  v_take NUMERIC;
  v_total NUMERIC;
BEGIN
  IF v_remaining <= 0 THEN
    RETURN 0;
  END IF;

  -- Expired or depleted packs keep their Polar status; every reader already
  -- filters on expires_at and tokens_remaining. Packs are locked once, in id
  -- order.
  PERFORM 1
    FROM public.workspace_credit_pack_purchases AS purchase
   WHERE purchase.ws_id = p_ws_id
   ORDER BY purchase.id
   FOR UPDATE;

  SELECT COALESCE(SUM(tokens_remaining), 0)
    INTO v_total
    FROM public.workspace_credit_pack_purchases
   WHERE ws_id = p_ws_id
     AND status = 'active'
     AND expires_at > now()
     AND tokens_remaining > 0
;

  IF v_total < v_remaining THEN
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT id, tokens_remaining
      FROM public.workspace_credit_pack_purchases
     WHERE ws_id = p_ws_id
       AND status = 'active'
       AND expires_at > now()
       AND tokens_remaining > 0
     ORDER BY expires_at ASC, granted_at ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_row.tokens_remaining, v_remaining);

    UPDATE public.workspace_credit_pack_purchases
       SET tokens_remaining = tokens_remaining - v_take,
           updated_at = now()
     WHERE id = v_row.id;

    v_remaining := v_remaining - v_take;
    v_consumed := v_consumed + v_take;
  END LOOP;

  RETURN v_consumed;
END;
$$;

revoke all on function public.reserve_metered_embedding_credits(
  uuid, uuid, text, integer, text, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.reserve_metered_embedding_credits(
  uuid, uuid, text, integer, text, jsonb, integer
) to service_role;
revoke all on function public._release_expired_embedding_credit_reservations(uuid)
  from public, anon, authenticated;
grant execute on function public._release_expired_embedding_credit_reservations(uuid)
  to service_role;
revoke all on function public.release_metered_embedding_credits(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.release_metered_embedding_credits(uuid, jsonb)
  to service_role;
revoke all on function public._consume_payg_credits(uuid, numeric)
  from public, anon, authenticated;
grant execute on function public._consume_payg_credits(uuid, numeric)
  to service_role;
