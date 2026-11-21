-- Chat credit settlement charges each assistant message exactly once.
--
-- Settlement runs after the reply has streamed, and can repeat: onFinish and
-- onAbort, a client retry, or the unbilled-charge retry below. The unique
-- index from 20261121184400 makes a second deduction for one chat message
-- impossible from its cutoff on; the lookups here use the same predicate.
set local lock_timeout = '5s';

-- Same signature and grants as 20261118043000. A charge for a chat message
-- that already has a deduction returns that deduction instead of charging
-- again. Settlements that resolve the same wallet serialize on its row lock,
-- so the later one sees the earlier one's committed row. Settlements that
-- resolve different wallets (user or month changed in flight) meet at the
-- unique index; the loser's writes roll back and it returns the winner's row.
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
  v_balance public.workspace_ai_credit_balances%rowtype;
  v_charged numeric;
begin
  select b.id into v_balance_id
    from public.get_or_create_credit_balance(p_ws_id, p_user_id) b;

  if p_chat_message_id is not null then
    select * into v_balance
      from public.workspace_ai_credit_balances
     where id = v_balance_id
     for update;

    select -t.amount into v_charged
      from public.ai_credit_transactions t
     where t.chat_message_id = p_chat_message_id
       and t.transaction_type = 'deduction'
       and t.created_at >= timestamptz '2026-11-21 00:00:00+00'
     order by t.created_at
     limit 1;

    if found then
      return query select
        true,
        v_charged,
        (
          coalesce(v_balance.total_allocated, 0)
            + coalesce(v_balance.bonus_credits, 0)
            - coalesce(v_balance.total_used, 0)
            + coalesce(public._get_active_payg_credits(p_ws_id), 0)
        )::numeric,
        null::text;
      return;
    end if;
  end if;

  begin
    return query select * from private.deduct_ai_credits_from_balance(
      v_balance_id, p_ws_id, p_model_id, p_input_tokens, p_output_tokens,
      p_reasoning_tokens, p_feature, p_execution_id, p_chat_message_id,
      p_metadata, p_user_id, p_image_count, p_search_count
    );
    return;
  exception
    when unique_violation then
      if p_chat_message_id is null then
        raise;
      end if;
      select -t.amount into v_charged
        from public.ai_credit_transactions t
       where t.chat_message_id = p_chat_message_id
         and t.transaction_type = 'deduction'
         and t.created_at >= timestamptz '2026-11-21 00:00:00+00'
       order by t.created_at
       limit 1;
      if not found then
        raise;
      end if;
      return query select
        true,
        v_charged,
        (
          coalesce(v_balance.total_allocated, 0)
            + coalesce(v_balance.bonus_credits, 0)
            - coalesce(v_balance.total_used, 0)
            + coalesce(public._get_active_payg_credits(p_ws_id), 0)
        )::numeric,
        null::text;
      return;
  end;
end;
$$;

revoke all on function public.deduct_ai_credits(
  uuid, text, integer, integer, integer, text, uuid, uuid, jsonb, uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.deduct_ai_credits(
  uuid, text, integer, integer, integer, text, uuid, uuid, jsonb, uuid, integer, integer
) to service_role;

-- A chat reply whose deduction failed after it was served. Cron Control
-- (job `ai-credit-unbilled-settlement`) retries it a bounded number of times;
-- a terminal row stays as the audit record of the uncharged usage.
create table private.ai_credit_unbilled_charges (
  -- No foreign keys on the message or user: deleting either must leave the
  -- record so the charge ends settled or abandoned, and a deleted user must
  -- never fall through to the workspace wallet.
  chat_message_id uuid primary key,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid,
  model_id text not null check (length(model_id) between 1 and 200),
  feature text not null check (length(feature) between 1 and 100),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  search_count integer not null default 0 check (search_count >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'settled', 'abandoned')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_error text check (length(last_error) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);

create index ai_credit_unbilled_charges_pending
  on private.ai_credit_unbilled_charges (created_at)
  where status = 'pending';

alter table private.ai_credit_unbilled_charges enable row level security;
revoke all on table private.ai_credit_unbilled_charges
  from public, anon, authenticated, service_role;

-- Records one unbilled chat charge. Repeated calls for a message keep the
-- first record. Returns false for input that cannot be settled.
create function public.record_unbilled_ai_charge(
  p_chat_message_id uuid,
  p_ws_id uuid,
  p_user_id uuid,
  p_model_id text,
  p_feature text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer default 0,
  p_search_count integer default 0,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path to pg_catalog, pg_temp
as $$
begin
  if p_chat_message_id is null
    or p_ws_id is null
    or coalesce(length(p_model_id), 0) not between 1 and 200
    or coalesce(length(p_feature), 0) not between 1 and 100
    or least(
      coalesce(p_input_tokens, 0),
      coalesce(p_output_tokens, 0),
      coalesce(p_reasoning_tokens, 0),
      coalesce(p_search_count, 0)
    ) < 0 then
    return false;
  end if;

  insert into private.ai_credit_unbilled_charges
    (chat_message_id, ws_id, user_id, model_id, feature,
     input_tokens, output_tokens, reasoning_tokens, search_count, last_error)
  values
    (p_chat_message_id, p_ws_id, p_user_id, p_model_id, p_feature,
     coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0),
     coalesce(p_reasoning_tokens, 0), coalesce(p_search_count, 0),
     left(p_error_code, 200))
  on conflict (chat_message_id) do nothing;

  return true;
end;
$$;

revoke all on function public.record_unbilled_ai_charge(
  uuid, uuid, uuid, text, text, integer, integer, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.record_unbilled_ai_charge(
  uuid, uuid, uuid, text, text, integer, integer, integer, integer, text
) to service_role;

-- Settles at most p_limit (1..100) pending charges, oldest first, skipping
-- rows another run holds. Each row gets at most five attempts; the deduction
-- is idempotent per chat message, so a replay never charges twice.
create function private.settle_unbilled_ai_charges(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 0), 0), 100);
  v_row private.ai_credit_unbilled_charges%rowtype;
  v_success boolean;
  v_error text;
  v_settled integer := 0;
  v_failed integer := 0;
  v_abandoned integer := 0;
begin
  for v_row in
    select *
      from private.ai_credit_unbilled_charges
     where status = 'pending'
     order by created_at, chat_message_id
     limit v_limit
     for update skip locked
  loop
    begin
      select d.success, d.error_code into v_success, v_error
        from public.deduct_ai_credits(
          p_ws_id => v_row.ws_id,
          p_model_id => v_row.model_id,
          p_input_tokens => v_row.input_tokens,
          p_output_tokens => v_row.output_tokens,
          p_reasoning_tokens => v_row.reasoning_tokens,
          p_feature => v_row.feature,
          p_chat_message_id => v_row.chat_message_id,
          p_metadata => jsonb_build_object('unbilled_retry', true),
          p_user_id => v_row.user_id,
          p_search_count => v_row.search_count
        ) d;
    exception
      -- A timeout or lock conflict aborts the run instead of spending one of
      -- the row's attempts; the next run retries it.
      when query_canceled or deadlock_detected or serialization_failure then
        raise;
      when others then
        v_success := false;
        v_error := left(sqlstate || ': ' || sqlerrm, 200);
    end;

    if coalesce(v_success, false) then
      update private.ai_credit_unbilled_charges
         set status = 'settled',
             attempts = v_row.attempts + 1,
             last_error = null,
             settled_at = now(),
             updated_at = now()
       where chat_message_id = v_row.chat_message_id;
      v_settled := v_settled + 1;
    elsif v_row.attempts + 1 >= 5 then
      update private.ai_credit_unbilled_charges
         set status = 'abandoned',
             attempts = v_row.attempts + 1,
             last_error = left(coalesce(v_error, 'DEDUCTION_FAILED'), 200),
             updated_at = now()
       where chat_message_id = v_row.chat_message_id;
      v_abandoned := v_abandoned + 1;
    else
      update private.ai_credit_unbilled_charges
         set attempts = v_row.attempts + 1,
             last_error = left(coalesce(v_error, 'DEDUCTION_FAILED'), 200),
             updated_at = now()
       where chat_message_id = v_row.chat_message_id;
      v_failed := v_failed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'settled', v_settled,
    'failed', v_failed,
    'abandoned', v_abandoned
  );
end;
$$;

revoke all on function private.settle_unbilled_ai_charges(integer)
  from public, anon, authenticated;
grant execute on function private.settle_unbilled_ai_charges(integer)
  to service_role;
