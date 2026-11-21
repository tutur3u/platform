begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Restores the deduct_ai_credits wrapper from 20261118043000, drops the
-- unbilled-charge store and the unique index from 20261121184400. Pending
-- rows are lost with the table; read them first if any must still be charged:
--   select * from private.ai_credit_unbilled_charges where status <> 'settled';
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

drop function if exists private.settle_unbilled_ai_charges(integer);
drop function if exists public.record_unbilled_ai_charge(
  uuid, uuid, uuid, text, text, integer, integer, integer, integer, text
);
drop table if exists private.ai_credit_unbilled_charges;
drop index if exists public.ai_credit_transactions_one_chat_message_deduction;

commit;
