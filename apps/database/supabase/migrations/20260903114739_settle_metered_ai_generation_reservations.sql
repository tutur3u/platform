-- Settle a fixed reservation against actual language-model usage without
-- opening a race between releasing the reservation and deducting the charge.
create or replace function public.settle_metered_ai_credit_reservation(
  p_reservation_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer default 0,
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
set search_path to public, private, pg_temp
as $$
declare
  v_reservation private.ai_credit_reservations%rowtype;
  v_balance public.workspace_ai_credit_balances%rowtype;
  v_deduction record;
  v_metadata jsonb;
begin
  if least(
    coalesce(p_input_tokens, 0),
    coalesce(p_output_tokens, 0),
    coalesce(p_reasoning_tokens, 0)
  ) < 0 then
    return query select false, 0::numeric, 0::numeric, 'INVALID_USAGE'::text;
    return;
  end if;

  select * into v_reservation
    from private.ai_credit_reservations
   where id = p_reservation_id
   for update;

  if not found then
    return query
      select false, 0::numeric, 0::numeric, 'RESERVATION_NOT_FOUND'::text;
    return;
  end if;

  select * into v_balance
    from public.workspace_ai_credit_balances
   where id = v_reservation.balance_id
   for update;

  if not found then
    return query select false, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  if v_reservation.status = 'committed' then
    return query select
      true,
      v_reservation.amount,
      (
        v_balance.total_allocated + v_balance.bonus_credits
          - v_balance.total_used
          + coalesce(public._get_active_payg_credits(v_reservation.ws_id), 0)
      )::numeric,
      null::text;
    return;
  end if;

  if v_reservation.status <> 'reserved' then
    return query select
      false,
      0::numeric,
      (
        v_balance.total_allocated + v_balance.bonus_credits
          - v_balance.total_used
          + coalesce(public._get_active_payg_credits(v_reservation.ws_id), 0)
      )::numeric,
      'RESERVATION_NOT_ACTIVE'::text;
    return;
  end if;

  if v_reservation.expires_at <= now() then
    update public.workspace_ai_credit_balances
       set total_used = greatest(total_used - v_reservation.amount, 0),
           updated_at = now()
     where id = v_reservation.balance_id
    returning * into v_balance;

    update private.ai_credit_reservations
       set status = 'expired',
           released_at = now(),
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb)
             || coalesce(p_metadata, '{}'::jsonb)
     where id = v_reservation.id;

    return query
      select
        false,
        0::numeric,
        (
          v_balance.total_allocated + v_balance.bonus_credits
            - v_balance.total_used
            + coalesce(public._get_active_payg_credits(v_reservation.ws_id), 0)
        )::numeric,
        'RESERVATION_EXPIRED'::text;
    return;
  end if;

  -- A provider can report zero usage when a stream terminates before emitting
  -- tokens. Release the hold atomically and preserve its positive amount as
  -- audit history instead of creating a zero-value ledger transaction.
  if coalesce(p_input_tokens, 0)
    + coalesce(p_output_tokens, 0)
    + coalesce(p_reasoning_tokens, 0) = 0 then
    update public.workspace_ai_credit_balances
       set total_used = greatest(total_used - v_reservation.amount, 0),
           updated_at = now()
     where id = v_reservation.balance_id;

    update private.ai_credit_reservations
       set status = 'released',
           released_at = now(),
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb)
             || coalesce(p_metadata, '{}'::jsonb)
     where id = v_reservation.id;

    return query select
      true,
      0::numeric,
      (
        v_balance.total_allocated + v_balance.bonus_credits
          - greatest(v_balance.total_used - v_reservation.amount, 0)
          + coalesce(public._get_active_payg_credits(v_reservation.ws_id), 0)
      )::numeric,
      null::text;
    return;
  end if;

  -- Keep the balance row locked while returning the held amount and charging
  -- actual usage. No concurrent request can spend the released credits between
  -- these two operations.
  update public.workspace_ai_credit_balances
     set total_used = greatest(total_used - v_reservation.amount, 0),
         updated_at = now()
   where id = v_reservation.balance_id;

  v_metadata := coalesce(v_reservation.metadata, '{}'::jsonb)
    || coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object('reservation_id', v_reservation.id);

  select * into v_deduction
    from public.deduct_ai_credits(
      v_reservation.ws_id,
      v_reservation.model_id,
      p_input_tokens,
      p_output_tokens,
      p_reasoning_tokens,
      v_reservation.feature,
      null,
      null,
      v_metadata,
      v_reservation.user_id,
      0,
      0
    );

  if not coalesce(v_deduction.success, false) then
    raise exception using
      errcode = 'P0001',
      message = 'METERED_RESERVATION_SETTLEMENT_FAILED',
      detail = coalesce(v_deduction.error_code, 'DEDUCTION_FAILED');
  end if;

  update private.ai_credit_reservations
     set amount = v_deduction.credits_deducted,
         status = 'committed',
         committed_at = now(),
         updated_at = now(),
         metadata = v_metadata
   where id = v_reservation.id;

  return query select
    true,
    v_deduction.credits_deducted,
    v_deduction.remaining_credits,
    null::text;
end;
$$;

revoke execute on function public.settle_metered_ai_credit_reservation(
  uuid, integer, integer, integer, jsonb
) from public, anon, authenticated;

grant execute on function public.settle_metered_ai_credit_reservation(
  uuid, integer, integer, integer, jsonb
) to service_role;
