create schema if not exists private;

drop function if exists private.get_debt_loan_with_balance(uuid, uuid, uuid);

create or replace function private.get_debt_loan_with_balance(
  _ws_id uuid,
  _debt_id uuid,
  _actor_id uuid
)
returns table(
  id uuid,
  ws_id uuid,
  name text,
  description text,
  counterparty text,
  type public.debt_loan_type,
  principal_amount bigint,
  currency text,
  interest_rate numeric,
  interest_type public.interest_calculation_type,
  start_date date,
  due_date date,
  status public.debt_loan_status,
  wallet_id uuid,
  creator_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  total_paid bigint,
  total_interest_paid bigint,
  remaining_balance bigint,
  progress_percentage numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select
    dl.id,
    dl.ws_id,
    dl.name,
    dl.description,
    dl.counterparty,
    dl.type,
    dl.principal_amount,
    dl.currency,
    dl.interest_rate,
    dl.interest_type,
    dl.start_date,
    dl.due_date,
    dl.status,
    dl.wallet_id,
    dl.creator_id,
    dl.created_at,
    dl.updated_at,
    dl.total_paid,
    dl.total_interest_paid,
    (dl.principal_amount - dl.total_paid)::bigint as remaining_balance,
    case
      when dl.principal_amount = 0 then 100.00
      else round((dl.total_paid::numeric / dl.principal_amount * 100), 2)
    end as progress_percentage
  from public.workspace_debt_loans dl
  where dl.id = _debt_id
    and dl.ws_id = _ws_id
    and _actor_id is not null
    and public.has_workspace_permission(_ws_id, _actor_id, 'manage_finance');
$$;

revoke all on function private.get_debt_loan_with_balance(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.get_debt_loan_with_balance(
  uuid,
  uuid,
  uuid
) to service_role;

comment on function private.get_debt_loan_with_balance(uuid, uuid, uuid) is
  'Server-owned finance helper that returns one workspace debt or loan with remaining balance and progress calculated in Postgres.';
