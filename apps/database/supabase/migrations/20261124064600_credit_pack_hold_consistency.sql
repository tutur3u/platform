-- Credit holds stay consistent with their sources.
--
-- 1. The reservation expiry sweep returns pack draws before the included
--    balance and keeps the global lock order: it holds the balance, locks the
--    packs of expiring reservations in one sorted batch, and never waits on a
--    reservation, Studio run or API key another transaction holds.
-- 2. Polar credit-pack webhooks project through one locked, relative update
--    instead of reading tokens_remaining and writing that snapshot back, so a
--    hold taken in between is never restored. A renewal starts a new grant;
--    holds from the previous grant are forfeited when they settle (see
--    private.refund_ai_credit_reservation_packs).

-- Expired reservations return their pack draws before the included balance.
-- tuturuuu: no-grant (internal)
create or replace function public._release_expired_ai_credit_reservations(
  p_balance_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation record;
  v_run record;
  v_released_amount numeric := 0;
begin
  perform 1
  from public.workspace_ai_credit_balances as balance
  where balance.id = p_balance_id
  for update;

  -- Packs drawn by any reservation this sweep may expire, in one sorted batch.
  perform 1
  from public.workspace_credit_pack_purchases as purchase
  where purchase.id in (
    select draw.pack_purchase_id
    from private.ai_credit_reservation_pack_draws as draw
    join private.ai_credit_reservations as reservation
      on reservation.id = draw.reservation_id
    where reservation.balance_id = p_balance_id
      and reservation.status = 'reserved'
      and reservation.expires_at <= now()
  )
  order by purchase.id
  for update;

  perform private.expire_ai_live_sessions(p_balance_id);

  -- A reservation another transaction holds is left for the next sweep
  -- instead of waited on.
  for v_reservation in
    select reservation.id, reservation.amount
    from private.ai_credit_reservations as reservation
    where reservation.balance_id = p_balance_id
      and reservation.status = 'reserved'
      and reservation.expires_at <= now()
    order by reservation.id
    for update skip locked
  loop
    v_released_amount := v_released_amount + v_reservation.amount
      - private.refund_ai_credit_reservation_packs(
          v_reservation.id, v_reservation.amount
        );

    update private.ai_credit_reservations
    set status = 'expired', released_at = now(), updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object('expired_at', now())
    where id = v_reservation.id;
  end loop;

  if v_released_amount > 0 then
    update public.workspace_ai_credit_balances
    set total_used = greatest(total_used - v_released_amount, 0),
        updated_at = now()
    where id = p_balance_id;
  end if;

  -- Studio settlement locks run, reservation, balance, then API key; this
  -- sweep already holds the balance, so it never waits on a run or key and
  -- leaves held ones for a later sweep.
  for v_run in
    select run.id, run.api_key_id, run.reserved_credits
    from private.ai_studio_runs as run
    join private.ai_credit_reservations as reservation
      on reservation.id = run.reservation_id
    where reservation.balance_id = p_balance_id
      and reservation.status = 'expired'
      and run.status in ('reserved', 'running')
    order by run.id
    for update of run skip locked
  loop
    if v_run.api_key_id is not null then
      perform 1 from private.ai_studio_api_keys as api_key
      where api_key.id = v_run.api_key_id
      for update skip locked;
      continue when not found;
    end if;

    update private.ai_studio_runs
    set status = 'aborted', error_class = 'reservation_expired',
        error_message = 'The credit reservation expired before settlement.',
        completed_at = now()
    where id = v_run.id;

    if v_run.api_key_id is not null then
      update private.ai_studio_api_keys
      set credits_reserved = greatest(credits_reserved - v_run.reserved_credits, 0),
          updated_at = now()
      where id = v_run.api_key_id;
    end if;
  end loop;
end;
$$;

revoke all on function public._release_expired_ai_credit_reservations(uuid)
  from public, anon, authenticated;
grant execute on function public._release_expired_ai_credit_reservations(uuid)
  to service_role;

-- Projects one Polar credit-pack subscription event, ordered by its period.
-- Older period: ignored. Same grant: the balance is left as is (clamped to
-- the grant). Renewal: the new grant replaces it. Not retained (canceled,
-- revoked, unpaid): the balance is zeroed and the historical dates are kept,
-- and the grant stays closed until an event from a newer period.
create function private.sync_credit_pack_purchase(
  p_ws_id uuid,
  p_credit_pack_id uuid,
  p_polar_subscription_id text,
  p_tokens numeric,
  p_status public.subscription_status,
  p_period_start timestamptz,
  p_expires_at timestamptz
)
returns setof public.workspace_credit_pack_purchases
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row public.workspace_credit_pack_purchases%rowtype;
  v_retain boolean := p_status::text
    in ('active', 'trialing', 'past_due', 'incomplete');
  v_newer boolean;
begin
  if p_tokens is null or p_tokens <= 0 then
    raise exception 'Credit pack tokens must be positive' using errcode = '22023';
  end if;

  insert into public.workspace_credit_pack_purchases (
    ws_id, credit_pack_id, polar_subscription_id, tokens_granted,
    tokens_remaining, granted_at, expires_at, status
  ) values (
    p_ws_id, p_credit_pack_id, p_polar_subscription_id, p_tokens,
    p_tokens, p_period_start, p_expires_at, p_status
  )
  on conflict (polar_subscription_id) do nothing
  returning * into v_row;
  if found then
    return next v_row;
    return;
  end if;

  select * into v_row
  from public.workspace_credit_pack_purchases as purchase
  where purchase.polar_subscription_id = p_polar_subscription_id
  for update;

  -- Events are ordered by their subscription period. An event from a period
  -- before the stored grant (a delayed revocation or update from the previous
  -- period) never touches the renewed grant.
  if p_period_start < v_row.granted_at then
    return next v_row;
    return;
  end if;

  v_newer := v_row.granted_at < p_period_start;

  -- A grant that is no longer retained (canceled, revoked, unpaid) stays
  -- closed for the rest of its period: a delayed or replayed retained event
  -- from the same period never reopens it, so a hold refund can never land on
  -- a revoked grant. Only a newer period starts a new grant.
  if not v_newer
    and v_row.status::text not in ('active', 'trialing', 'past_due', 'incomplete')
  then
    return next v_row;
    return;
  end if;

  update public.workspace_credit_pack_purchases
  set ws_id = p_ws_id,
      credit_pack_id = p_credit_pack_id,
      tokens_granted = p_tokens,
      tokens_remaining = case
        when not v_retain then 0
        when v_newer then p_tokens
        else least(tokens_remaining, p_tokens)
      end,
      granted_at = case when v_newer then p_period_start else granted_at end,
      expires_at = case when v_newer then p_expires_at else expires_at end,
      status = p_status,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return next v_row;
end;
$$;

revoke all on function private.sync_credit_pack_purchase(
  uuid, uuid, text, numeric, public.subscription_status, timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function private.sync_credit_pack_purchase(
  uuid, uuid, text, numeric, public.subscription_status, timestamptz,
  timestamptz
) to service_role;
