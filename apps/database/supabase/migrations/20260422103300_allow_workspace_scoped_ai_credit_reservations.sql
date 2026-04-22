alter table public.ai_credit_reservations
  alter column user_id drop not null;

comment on column public.ai_credit_reservations.user_id is
  'Optional actor for AI credit reservations. Null indicates a workspace-scoped automated reservation.';

drop function if exists public.reserve_fixed_ai_credits(
  uuid,
  uuid,
  numeric,
  text,
  text,
  jsonb,
  integer
);

create or replace function public.reserve_fixed_ai_credits(
  p_ws_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_model_id text default 'markitdown/conversion',
  p_feature text default 'chat',
  p_metadata jsonb default '{}'::jsonb,
  p_expires_in_seconds integer default 1800
)
returns table (
  success boolean,
  reservation_id uuid,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_balance record;
  v_new_total_used numeric;
  v_total_allocated numeric;
  v_bonus_credits numeric;
  v_current_total_used numeric;
  v_current_total_allocated numeric;
  v_current_bonus_credits numeric;
  v_reservation_id uuid;
begin
  select * into v_balance
    from public.get_or_create_credit_balance(p_ws_id, p_user_id);

  if not found then
    return query select false, null::uuid, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  if coalesce(p_amount, 0) <= 0 then
    return query select false, null::uuid, 0::numeric, 'INVALID_AMOUNT'::text;
    return;
  end if;

  perform public._release_expired_ai_credit_reservations(v_balance.id);

  update public.workspace_ai_credit_balances
     set total_used = total_used + p_amount,
         updated_at = now()
   where id = v_balance.id
     and (total_allocated + bonus_credits - total_used) >= p_amount
  returning total_used, total_allocated, bonus_credits
    into v_new_total_used, v_total_allocated, v_bonus_credits;

  if not found then
    select total_used, total_allocated, bonus_credits
      into v_current_total_used, v_current_total_allocated, v_current_bonus_credits
      from public.workspace_ai_credit_balances
     where id = v_balance.id;

    return query
    select
      false,
      null::uuid,
      (
        coalesce(v_current_total_allocated, coalesce(v_balance.total_allocated, 0)) +
        coalesce(v_current_bonus_credits, coalesce(v_balance.bonus_credits, 0)) -
        coalesce(v_current_total_used, coalesce(v_balance.total_used, 0))
      )::numeric,
      'INSUFFICIENT_CREDITS'::text;
    return;
  end if;

  insert into public.ai_credit_reservations
    (ws_id, user_id, balance_id, amount, model_id, feature, status, metadata, expires_at)
  values
    (
      p_ws_id,
      p_user_id,
      v_balance.id,
      p_amount,
      p_model_id,
      p_feature,
      'reserved',
      coalesce(p_metadata, '{}'::jsonb),
      now() + make_interval(secs => greatest(coalesce(p_expires_in_seconds, 1800), 60))
    )
  returning id into v_reservation_id;

  return query
  select
    true,
    v_reservation_id,
    (v_total_allocated + v_bonus_credits - v_new_total_used)::numeric,
    null::text;
end;
$$;

revoke execute on function public.reserve_fixed_ai_credits(
  uuid,
  uuid,
  numeric,
  text,
  text,
  jsonb,
  integer
) from public, anon, authenticated;

grant execute on function public.reserve_fixed_ai_credits(
  uuid,
  uuid,
  numeric,
  text,
  text,
  jsonb,
  integer
) to service_role;
