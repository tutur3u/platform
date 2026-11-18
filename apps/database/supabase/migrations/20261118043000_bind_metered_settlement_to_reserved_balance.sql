-- Both charge paths use the same pricing, included credits and workspace PAYG split.
create function private.deduct_ai_credits_from_balance(
  p_balance_id uuid,
  p_ws_id uuid,
  p_model_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer,
  p_feature text,
  p_execution_id uuid,
  p_chat_message_id uuid,
  p_metadata jsonb,
  p_user_id uuid,
  p_image_count integer,
  p_search_count integer
)
returns table (
  success boolean,
  credits_deducted numeric,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security invoker
set search_path to pg_catalog, pg_temp
as $$
declare
  v_balance public.workspace_ai_credit_balances%rowtype;
  v_cost_usd numeric;
  v_credits numeric;
  v_tier public.workspace_product_tier;
  v_markup numeric;
  v_new_total_used numeric;
  v_remaining numeric;
  v_included_remaining numeric;
  v_payg_remaining numeric;
  v_included_to_consume numeric;
  v_payg_to_consume numeric;
  v_payg_consumed numeric;
  v_metadata jsonb;
begin
  select * into v_balance
    from public.workspace_ai_credit_balances
   where id = p_balance_id
     and (ws_id = p_ws_id or (ws_id is null and user_id = p_user_id))
   for update;

  if not found then
    return query select false, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  v_tier := public._resolve_workspace_tier(p_ws_id);

  select coalesce(markup_multiplier, 1.0) into v_markup
    from public.ai_credit_plan_allocations
   where tier = v_tier and is_active = true;

  if v_markup is null then
    v_markup := 1.0;
  end if;

  if coalesce(p_input_tokens, 0) < 0
    or coalesce(p_output_tokens, 0) < 0
    or coalesce(p_reasoning_tokens, 0) < 0
    or coalesce(p_image_count, 0) < 0
    or coalesce(p_search_count, 0) < 0 then
    raise exception 'deduct_ai_credits: negative usage input (in=%, out=%, reason=%, img=%, search=%)',
      p_input_tokens, p_output_tokens, p_reasoning_tokens, p_image_count, p_search_count;
  end if;

  v_cost_usd := private.compute_ai_cost_from_gateway(
    p_model_id,
    p_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_image_count,
    p_search_count
  );

  v_credits := (v_cost_usd / 0.0001) * v_markup;

  if v_credits < 1
    and (
      coalesce(p_input_tokens, 0)
      + coalesce(p_output_tokens, 0)
      + coalesce(p_reasoning_tokens, 0)
      + coalesce(p_image_count, 0)
      + coalesce(p_search_count, 0)
    ) > 0 then
    v_credits := 1;
  end if;

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);

  if (v_included_remaining + coalesce(v_payg_remaining, 0)) < v_credits then
    return query
    select
      false,
      0::numeric,
      (v_included_remaining + coalesce(v_payg_remaining, 0))::numeric,
      'INSUFFICIENT_CREDITS'::text;
    return;
  end if;

  v_included_to_consume := least(greatest(v_included_remaining, 0), v_credits);
  v_payg_to_consume := v_credits - v_included_to_consume;

  v_payg_consumed := 0;
  if v_payg_to_consume > 0 then
    v_payg_consumed := public._consume_payg_credits(p_ws_id, v_payg_to_consume);

    if v_payg_consumed < v_payg_to_consume then
      raise exception 'INSUFFICIENT_CREDITS: PAYG shortfall (needed=%, got=%)',
        v_payg_to_consume, v_payg_consumed;
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

  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := (v_balance.total_allocated + v_balance.bonus_credits - v_new_total_used)
    + coalesce(v_payg_remaining, 0);

  v_metadata := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'credit_split',
      jsonb_build_object(
        'included', v_included_to_consume,
        'payg', v_payg_consumed
      )
    );

  insert into public.ai_credit_transactions
    (ws_id, user_id, balance_id, execution_id, chat_message_id,
     transaction_type, amount, cost_usd, model_id, feature,
     input_tokens, output_tokens, reasoning_tokens, image_count, search_count, metadata)
  values
    (case when v_balance.ws_id is not null then p_ws_id else null end,
     p_user_id, v_balance.id, p_execution_id, p_chat_message_id,
     'deduction', -v_credits, v_cost_usd, p_model_id, p_feature,
     p_input_tokens, p_output_tokens, p_reasoning_tokens, p_image_count, p_search_count, v_metadata);

  return query select true, v_credits, v_remaining, null::text;
  return;
end;
$$;

revoke all on function private.deduct_ai_credits_from_balance(
  uuid, uuid, text, integer, integer, integer, text, uuid, uuid, jsonb, uuid, integer, integer
) from public, anon, authenticated, service_role;

create or replace function public.deduct_ai_credits(
  p_ws_id uuid,
  p_model_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer default 0,
  p_feature text default null,
  p_execution_id uuid default null,
  p_chat_message_id uuid default null,
  p_metadata jsonb default '{}',
  p_user_id uuid default null,
  p_image_count integer default 0,
  p_search_count integer default 0
)
returns table (
  success boolean,
  credits_deducted numeric,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path to pg_catalog, pg_temp
as $$
declare
  v_balance_id uuid;
begin
  select b.id into v_balance_id
    from public.get_or_create_credit_balance(p_ws_id, p_user_id) b;

  return query select * from private.deduct_ai_credits_from_balance(
    v_balance_id, p_ws_id, p_model_id, p_input_tokens, p_output_tokens,
    p_reasoning_tokens, p_feature, p_execution_id, p_chat_message_id,
    p_metadata, p_user_id, p_image_count, p_search_count
  );
end;
$$;

revoke all on function public.deduct_ai_credits(
  uuid, text, integer, integer, integer, text, uuid, uuid, jsonb, uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.deduct_ai_credits(
  uuid, text, integer, integer, integer, text, uuid, uuid, jsonb, uuid, integer, integer
) to service_role;

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
set search_path to pg_catalog, pg_temp
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
    from private.deduct_ai_credits_from_balance(
      v_reservation.balance_id,
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
