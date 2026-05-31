-- Move finance debt and loan records off the public Data API surface.
--
-- Finance debt APIs remain the owning boundary. Debt/loan rows and linked
-- transaction rows are read and written with service-role private schema
-- access after workspace finance permissions are verified by apps/web.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.workspace_debt_loans
  set schema private;

alter table if exists public.workspace_debt_loan_transactions
  set schema private;

revoke all on table
  private.workspace_debt_loans,
  private.workspace_debt_loan_transactions
from public, anon, authenticated;

grant all on table
  private.workspace_debt_loans,
  private.workspace_debt_loan_transactions
to service_role;

alter table private.workspace_debt_loans enable row level security;
alter table private.workspace_debt_loan_transactions enable row level security;

drop policy if exists "Users can view debt/loans in their workspaces"
  on private.workspace_debt_loans;

drop policy if exists "Users can create debt/loans in their workspaces"
  on private.workspace_debt_loans;

drop policy if exists "Users can update debt/loans in their workspaces"
  on private.workspace_debt_loans;

drop policy if exists "Users can delete debt/loans in their workspaces"
  on private.workspace_debt_loans;

drop policy if exists "Users can view debt/loan transactions in their workspaces"
  on private.workspace_debt_loan_transactions;

drop policy if exists "Users can create debt/loan transactions in their workspaces"
  on private.workspace_debt_loan_transactions;

drop policy if exists "Users can update debt/loan transactions in their workspaces"
  on private.workspace_debt_loan_transactions;

drop policy if exists "Users can delete debt/loan transactions in their workspaces"
  on private.workspace_debt_loan_transactions;

drop policy if exists "Service role can manage private debt loans"
  on private.workspace_debt_loans;

drop policy if exists "Service role can manage private debt loan transactions"
  on private.workspace_debt_loan_transactions;

create policy "Service role can manage private debt loans"
  on private.workspace_debt_loans
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private debt loan transactions"
  on private.workspace_debt_loan_transactions
  for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists trg_debt_loan_updated_at
  on private.workspace_debt_loans;

drop trigger if exists trg_update_debt_loan_totals
  on private.workspace_debt_loan_transactions;

drop function if exists public.update_debt_loan_updated_at();
drop function if exists public.update_debt_loan_totals();
drop function if exists public.get_debt_loan_summary(uuid);
drop function if exists public.get_debt_loans_with_balance(
  uuid,
  public.debt_loan_type,
  public.debt_loan_status
);
drop function if exists private.get_debt_loan_summary(uuid, uuid);
drop function if exists private.get_debt_loans_with_balance(
  uuid,
  uuid,
  public.debt_loan_type,
  public.debt_loan_status
);
drop function if exists private.get_debt_loan_with_balance(uuid, uuid, uuid);

create or replace function private.update_debt_loan_updated_at()
returns trigger
language plpgsql
set search_path = private, public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create trigger trg_debt_loan_updated_at
  before update on private.workspace_debt_loans
  for each row
  execute function private.update_debt_loan_updated_at();

create or replace function private.update_debt_loan_totals()
returns trigger
language plpgsql
set search_path = private, public
as $function$
declare
  v_total_paid bigint;
  v_total_interest_paid bigint;
begin
  if tg_op = 'DELETE' then
    select
      coalesce(sum(case when not is_interest then amount else 0 end), 0),
      coalesce(sum(case when is_interest then amount else 0 end), 0)
    into v_total_paid, v_total_interest_paid
    from private.workspace_debt_loan_transactions
    where debt_loan_id = old.debt_loan_id;

    update private.workspace_debt_loans
    set
      total_paid = v_total_paid,
      total_interest_paid = v_total_interest_paid
    where id = old.debt_loan_id;
  else
    select
      coalesce(sum(case when not is_interest then amount else 0 end), 0),
      coalesce(sum(case when is_interest then amount else 0 end), 0)
    into v_total_paid, v_total_interest_paid
    from private.workspace_debt_loan_transactions
    where debt_loan_id = new.debt_loan_id;

    update private.workspace_debt_loans
    set
      total_paid = v_total_paid,
      total_interest_paid = v_total_interest_paid
    where id = new.debt_loan_id;
  end if;

  return null;
end;
$function$;

create trigger trg_update_debt_loan_totals
  after insert or update or delete on private.workspace_debt_loan_transactions
  for each row
  execute function private.update_debt_loan_totals();

create or replace function private.get_debt_loan_summary(
  _ws_id uuid,
  _actor_id uuid
)
returns table (
  total_debts bigint,
  total_loans bigint,
  active_debt_count integer,
  active_loan_count integer,
  total_debt_remaining bigint,
  total_loan_remaining bigint,
  net_position bigint
)
language sql
security definer
stable
set search_path = private, public
as $function$
  select
    coalesce(sum(case when debt_loan.type = 'debt' then debt_loan.principal_amount else 0 end), 0)::bigint as total_debts,
    coalesce(sum(case when debt_loan.type = 'loan' then debt_loan.principal_amount else 0 end), 0)::bigint as total_loans,
    count(case when debt_loan.type = 'debt' and debt_loan.status = 'active' then 1 end)::integer as active_debt_count,
    count(case when debt_loan.type = 'loan' and debt_loan.status = 'active' then 1 end)::integer as active_loan_count,
    coalesce(sum(case when debt_loan.type = 'debt' and debt_loan.status = 'active' then debt_loan.principal_amount - debt_loan.total_paid else 0 end), 0)::bigint as total_debt_remaining,
    coalesce(sum(case when debt_loan.type = 'loan' and debt_loan.status = 'active' then debt_loan.principal_amount - debt_loan.total_paid else 0 end), 0)::bigint as total_loan_remaining,
    coalesce(sum(case
      when debt_loan.type = 'loan' and debt_loan.status = 'active' then debt_loan.principal_amount - debt_loan.total_paid
      when debt_loan.type = 'debt' and debt_loan.status = 'active' then -(debt_loan.principal_amount - debt_loan.total_paid)
      else 0
    end), 0)::bigint as net_position
  from private.workspace_debt_loans debt_loan
  where debt_loan.ws_id = _ws_id
    and _actor_id is not null
    and public.has_workspace_permission(_ws_id, _actor_id, 'manage_finance');
$function$;

create or replace function private.get_debt_loans_with_balance(
  _ws_id uuid,
  _actor_id uuid,
  _type public.debt_loan_type default null,
  _status public.debt_loan_status default null
)
returns table (
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
set search_path = private, public
as $function$
  select
    debt_loan.id,
    debt_loan.ws_id,
    debt_loan.name,
    debt_loan.description,
    debt_loan.counterparty,
    debt_loan.type,
    debt_loan.principal_amount,
    debt_loan.currency,
    debt_loan.interest_rate,
    debt_loan.interest_type,
    debt_loan.start_date,
    debt_loan.due_date,
    debt_loan.status,
    debt_loan.wallet_id,
    debt_loan.creator_id,
    debt_loan.created_at,
    debt_loan.updated_at,
    debt_loan.total_paid,
    debt_loan.total_interest_paid,
    (debt_loan.principal_amount - debt_loan.total_paid)::bigint as remaining_balance,
    case
      when debt_loan.principal_amount = 0 then 100.00
      else round((debt_loan.total_paid::numeric / debt_loan.principal_amount * 100), 2)
    end as progress_percentage
  from private.workspace_debt_loans debt_loan
  where debt_loan.ws_id = _ws_id
    and (_type is null or debt_loan.type = _type)
    and (_status is null or debt_loan.status = _status)
    and _actor_id is not null
    and public.has_workspace_permission(_ws_id, _actor_id, 'manage_finance')
  order by
    case when debt_loan.status = 'active' then 0 else 1 end,
    debt_loan.due_date nulls last,
    debt_loan.created_at desc;
$function$;

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
set search_path = private, public
as $function$
  select
    debt_loan.id,
    debt_loan.ws_id,
    debt_loan.name,
    debt_loan.description,
    debt_loan.counterparty,
    debt_loan.type,
    debt_loan.principal_amount,
    debt_loan.currency,
    debt_loan.interest_rate,
    debt_loan.interest_type,
    debt_loan.start_date,
    debt_loan.due_date,
    debt_loan.status,
    debt_loan.wallet_id,
    debt_loan.creator_id,
    debt_loan.created_at,
    debt_loan.updated_at,
    debt_loan.total_paid,
    debt_loan.total_interest_paid,
    (debt_loan.principal_amount - debt_loan.total_paid)::bigint as remaining_balance,
    case
      when debt_loan.principal_amount = 0 then 100.00
      else round((debt_loan.total_paid::numeric / debt_loan.principal_amount * 100), 2)
    end as progress_percentage
  from private.workspace_debt_loans debt_loan
  where debt_loan.id = _debt_id
    and debt_loan.ws_id = _ws_id
    and _actor_id is not null
    and public.has_workspace_permission(_ws_id, _actor_id, 'manage_finance');
$function$;

revoke all on function private.update_debt_loan_updated_at()
from public, anon, authenticated;

revoke all on function private.update_debt_loan_totals()
from public, anon, authenticated;

revoke all on function private.get_debt_loan_summary(uuid, uuid)
from public, anon, authenticated;

revoke all on function private.get_debt_loans_with_balance(
  uuid,
  uuid,
  public.debt_loan_type,
  public.debt_loan_status
) from public, anon, authenticated;

revoke all on function private.get_debt_loan_with_balance(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function private.get_debt_loan_summary(uuid, uuid)
to service_role;

grant execute on function private.get_debt_loans_with_balance(
  uuid,
  uuid,
  public.debt_loan_type,
  public.debt_loan_status
) to service_role;

grant execute on function private.get_debt_loan_with_balance(uuid, uuid, uuid)
to service_role;

comment on table private.workspace_debt_loans is
  'Private finance debt and loan records served through apps/web finance APIs.';

comment on table private.workspace_debt_loan_transactions is
  'Private finance debt and loan transaction links served through apps/web finance APIs.';

comment on function private.get_debt_loan_summary(uuid, uuid) is
  'Server-owned finance helper that summarizes workspace debts and loans after manage_finance permission is verified in Postgres.';

comment on function private.get_debt_loans_with_balance(
  uuid,
  uuid,
  public.debt_loan_type,
  public.debt_loan_status
) is
  'Server-owned finance helper that lists workspace debts and loans with remaining balance and progress calculated in Postgres.';

comment on function private.get_debt_loan_with_balance(uuid, uuid, uuid) is
  'Server-owned finance helper that returns one workspace debt or loan with remaining balance and progress calculated in Postgres.';

notify pgrst, 'reload schema';
