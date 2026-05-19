-- Continue reducing the public Data API surface.
--
-- Keep function-backed server internals in private, and remove old public
-- tables that have no current app/package consumers.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.email_bounce_complaints
  set schema private;

alter table if exists public.ai_credit_reservations
  set schema private;

drop table if exists public.ai_chat_members;
drop table if exists public.nova_challenge_manager_emails;
drop table if exists public.poll_guest_permissions;
drop table if exists public.poll_user_permissions;

revoke all on table private.email_bounce_complaints
from public, anon, authenticated;

revoke all on table private.ai_credit_reservations
from public, anon, authenticated;

grant all on table private.email_bounce_complaints to service_role;
grant all on table private.ai_credit_reservations to service_role;

alter table private.email_bounce_complaints enable row level security;
alter table private.ai_credit_reservations enable row level security;

drop policy if exists "Root workspace users can view bounces"
  on private.email_bounce_complaints;
drop policy if exists "Service role full access on bounces"
  on private.email_bounce_complaints;
drop policy if exists "ai_credit_reservations_select_members"
  on private.ai_credit_reservations;

create policy "Service role can manage private email bounce complaints"
  on private.email_bounce_complaints
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private AI credit reservations"
  on private.ai_credit_reservations
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.check_email_bounce_status(
  p_email_hash text,
  p_window_days integer default 30
)
returns table (
  is_blocked boolean,
  hard_bounce_count bigint,
  soft_bounce_count bigint,
  complaint_count bigint,
  block_reason text
)
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_hard_bounces bigint;
  v_soft_bounces bigint;
  v_complaints bigint;
  v_since timestamptz;
begin
  v_since := now() - (p_window_days || ' days')::interval;

  select
    count(*) filter (where event_type = 'bounce' and bounce_type = 'hard'),
    count(*) filter (
      where event_type = 'bounce' and bounce_type in ('soft', 'transient')
    ),
    count(*) filter (where event_type = 'complaint')
  into v_hard_bounces, v_soft_bounces, v_complaints
  from private.email_bounce_complaints
  where email_hash = p_email_hash
    and created_at >= v_since;

  if v_hard_bounces > 0 then
    return query
    select
      true,
      v_hard_bounces,
      v_soft_bounces,
      v_complaints,
      'Hard bounce detected'::text;
  elsif v_complaints > 0 then
    return query
    select
      true,
      v_hard_bounces,
      v_soft_bounces,
      v_complaints,
      'Spam complaint received'::text;
  elsif v_soft_bounces >= 3 then
    return query
    select
      true,
      v_hard_bounces,
      v_soft_bounces,
      v_complaints,
      'Multiple soft bounces'::text;
  else
    return query
    select
      false,
      v_hard_bounces,
      v_soft_bounces,
      v_complaints,
      null::text;
  end if;
end;
$$;

create or replace function public.get_bounce_complaint_stats(
  p_since timestamptz default (now() - interval '30 days')
)
returns table (
  total_events bigint,
  hard_bounces bigint,
  soft_bounces bigint,
  complaints bigint,
  unique_emails_affected bigint
)
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
begin
  return query
  select
    count(*)::bigint as total_events,
    count(*) filter (
      where event_type = 'bounce' and bounce_type = 'hard'
    )::bigint as hard_bounces,
    count(*) filter (
      where event_type = 'bounce' and bounce_type in ('soft', 'transient')
    )::bigint as soft_bounces,
    count(*) filter (where event_type = 'complaint')::bigint as complaints,
    count(distinct email_hash)::bigint as unique_emails_affected
  from private.email_bounce_complaints
  where created_at >= p_since;
end;
$$;

create or replace function public.record_email_bounce(
  p_email_hash text,
  p_bounce_type text,
  p_bounce_subtype text default null,
  p_original_email_id uuid default null,
  p_raw_notification jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into private.email_bounce_complaints (
    email_hash,
    event_type,
    bounce_type,
    bounce_subtype,
    original_email_id,
    raw_notification
  )
  values (
    p_email_hash,
    'bounce',
    p_bounce_type,
    p_bounce_subtype,
    p_original_email_id,
    p_raw_notification
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_email_complaint(
  p_email_hash text,
  p_complaint_type text default null,
  p_complaint_feedback_id text default null,
  p_original_email_id uuid default null,
  p_raw_notification jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into private.email_bounce_complaints (
    email_hash,
    event_type,
    complaint_type,
    complaint_feedback_id,
    original_email_id,
    raw_notification
  )
  values (
    p_email_hash,
    'complaint',
    p_complaint_type,
    p_complaint_feedback_id,
    p_original_email_id,
    p_raw_notification
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public._release_expired_ai_credit_reservations(
  p_balance_id uuid
)
returns void
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_released_amount numeric := 0;
begin
  with expired as (
    update private.ai_credit_reservations
    set
      status = 'expired',
      released_at = now(),
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('expired_at', now())
    where balance_id = p_balance_id
      and status = 'reserved'
      and expires_at <= now()
    returning amount
  )
  select coalesce(sum(amount), 0)
  into v_released_amount
  from expired;

  if v_released_amount > 0 then
    update public.workspace_ai_credit_balances
    set
      total_used = greatest(total_used - v_released_amount, 0),
      updated_at = now()
    where id = p_balance_id;
  end if;
end;
$$;

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
set search_path to public, private, pg_temp
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
  set
    total_used = total_used + p_amount,
    updated_at = now()
  where id = v_balance.id
    and (total_allocated + bonus_credits - total_used) >= p_amount
  returning total_used, total_allocated, bonus_credits
  into v_new_total_used, v_total_allocated, v_bonus_credits;

  if not found then
    select total_used, total_allocated, bonus_credits
    into
      v_current_total_used,
      v_current_total_allocated,
      v_current_bonus_credits
    from public.workspace_ai_credit_balances
    where id = v_balance.id;

    return query
    select
      false,
      null::uuid,
      (
        coalesce(
          v_current_total_allocated,
          coalesce(v_balance.total_allocated, 0)
        )
        + coalesce(
          v_current_bonus_credits,
          coalesce(v_balance.bonus_credits, 0)
        )
        - coalesce(v_current_total_used, coalesce(v_balance.total_used, 0))
      )::numeric,
      'INSUFFICIENT_CREDITS'::text;
    return;
  end if;

  insert into private.ai_credit_reservations (
    ws_id,
    user_id,
    balance_id,
    amount,
    model_id,
    feature,
    status,
    metadata,
    expires_at
  )
  values (
    p_ws_id,
    p_user_id,
    v_balance.id,
    p_amount,
    p_model_id,
    p_feature,
    'reserved',
    coalesce(p_metadata, '{}'::jsonb),
    now() + make_interval(
      secs => greatest(coalesce(p_expires_in_seconds, 1800), 60)
    )
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

create or replace function public.commit_fixed_ai_credit_reservation(
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
set search_path to public, private, pg_temp
as $$
declare
  v_reservation record;
  v_balance_total_used numeric;
  v_balance_total_allocated numeric;
  v_balance_bonus_credits numeric;
begin
  select
    r.*,
    b.total_used as balance_total_used,
    b.total_allocated as balance_total_allocated,
    b.bonus_credits as balance_bonus_credits
  into v_reservation
  from private.ai_credit_reservations r
  join public.workspace_ai_credit_balances b
    on b.id = r.balance_id
  where r.id = p_reservation_id
  for update of r, b;

  if not found then
    return query
    select false, 0::numeric, 0::numeric, 'RESERVATION_NOT_FOUND'::text;
    return;
  end if;

  if v_reservation.status = 'committed' then
    return query
    select
      true,
      v_reservation.amount,
      (
        v_reservation.balance_total_allocated
        + v_reservation.balance_bonus_credits
        - v_reservation.balance_total_used
      )::numeric,
      null::text;
    return;
  end if;

  if v_reservation.status in ('released', 'expired') then
    return query
    select
      false,
      0::numeric,
      (
        v_reservation.balance_total_allocated
        + v_reservation.balance_bonus_credits
        - v_reservation.balance_total_used
      )::numeric,
      'RESERVATION_NOT_ACTIVE'::text;
    return;
  end if;

  if v_reservation.expires_at <= now() then
    update public.workspace_ai_credit_balances
    set
      total_used = greatest(total_used - v_reservation.amount, 0),
      updated_at = now()
    where id = v_reservation.balance_id
    returning total_used, total_allocated, bonus_credits
    into
      v_balance_total_used,
      v_balance_total_allocated,
      v_balance_bonus_credits;

    update private.ai_credit_reservations
    set
      status = 'expired',
      released_at = now(),
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object('expired_during_commit', true)
    where id = p_reservation_id;

    return query
    select
      false,
      0::numeric,
      (
        v_balance_total_allocated
        + v_balance_bonus_credits
        - v_balance_total_used
      )::numeric,
      'RESERVATION_EXPIRED'::text;
    return;
  end if;

  update private.ai_credit_reservations
  set
    status = 'committed',
    committed_at = now(),
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb)
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
    metadata
  )
  values (
    v_reservation.ws_id,
    v_reservation.user_id,
    v_reservation.balance_id,
    'deduction',
    -v_reservation.amount,
    v_reservation.amount * 0.0001,
    v_reservation.model_id,
    v_reservation.feature,
    coalesce(v_reservation.metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('reservation_id', v_reservation.id)
  );

  return query
  select
    true,
    v_reservation.amount,
    (
      v_reservation.balance_total_allocated
      + v_reservation.balance_bonus_credits
      - v_reservation.balance_total_used
    )::numeric,
    null::text;
end;
$$;

create or replace function public.release_fixed_ai_credit_reservation(
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
set search_path to public, private, pg_temp
as $$
declare
  v_reservation record;
  v_balance_total_used numeric;
  v_balance_total_allocated numeric;
  v_balance_bonus_credits numeric;
begin
  select
    r.*,
    b.total_used as balance_total_used,
    b.total_allocated as balance_total_allocated,
    b.bonus_credits as balance_bonus_credits
  into v_reservation
  from private.ai_credit_reservations r
  join public.workspace_ai_credit_balances b
    on b.id = r.balance_id
  where r.id = p_reservation_id
  for update of r, b;

  if not found then
    return query select false, 0::numeric, 'RESERVATION_NOT_FOUND'::text;
    return;
  end if;

  if v_reservation.status = 'committed' then
    return query
    select
      false,
      (
        v_reservation.balance_total_allocated
        + v_reservation.balance_bonus_credits
        - v_reservation.balance_total_used
      )::numeric,
      'RESERVATION_ALREADY_COMMITTED'::text;
    return;
  end if;

  if v_reservation.status in ('released', 'expired') then
    return query
    select
      true,
      (
        v_reservation.balance_total_allocated
        + v_reservation.balance_bonus_credits
        - v_reservation.balance_total_used
      )::numeric,
      null::text;
    return;
  end if;

  update public.workspace_ai_credit_balances
  set
    total_used = greatest(total_used - v_reservation.amount, 0),
    updated_at = now()
  where id = v_reservation.balance_id
  returning total_used, total_allocated, bonus_credits
  into v_balance_total_used, v_balance_total_allocated, v_balance_bonus_credits;

  update private.ai_credit_reservations
  set
    status = 'released',
    released_at = now(),
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb)
  where id = p_reservation_id;

  return query
  select
    true,
    (
      v_balance_total_allocated
      + v_balance_bonus_credits
      - v_balance_total_used
    )::numeric,
    null::text;
end;
$$;

comment on table private.email_bounce_complaints is
  'Private email bounce and complaint reputation log. Public RPCs expose only server-mediated checks and inserts.';

comment on table private.ai_credit_reservations is
  'Private AI credit reservation ledger used by server-side credit RPCs.';
