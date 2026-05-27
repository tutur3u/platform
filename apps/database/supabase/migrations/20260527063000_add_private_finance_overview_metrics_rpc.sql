create schema if not exists private;

drop function if exists private.get_finance_overview_metrics(
  uuid,
  uuid,
  text,
  date,
  date,
  boolean
);

create or replace function private.get_finance_overview_metrics(
  _ws_id uuid,
  _actor_id uuid,
  _view text default 'date',
  _start_date date default null,
  _end_date date default null,
  include_confidential boolean default true
)
returns table(
  wallet_count bigint,
  category_count bigint,
  transaction_count bigint,
  invoice_count bigint,
  total_income double precision,
  total_expense double precision,
  net_total double precision,
  recent_transaction_count bigint,
  recent_income_count bigint,
  recent_expense_count bigint,
  recent_total_income double precision,
  recent_total_expense double precision,
  recent_net_total double precision,
  latest_transaction_at timestamp with time zone
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_view text;
  v_start_at timestamp with time zone;
  v_end_at timestamp with time zone;
  v_recent_start_at timestamp with time zone;
  v_can_view_amount boolean;
begin
  v_view := lower(coalesce(_view, 'date'));

  if v_view not in ('date', 'month', 'year') then
    raise exception 'Invalid overview view: %', _view;
  end if;

  if _actor_id is null
    or not public.has_workspace_permission(_ws_id, _actor_id, 'manage_finance')
  then
    raise exception 'Permission denied';
  end if;

  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );

  if _start_date is not null then
    v_start_at := case v_view
      when 'month' then date_trunc('month', _start_date::timestamp)
      when 'year' then date_trunc('year', _start_date::timestamp)
      else _start_date::timestamp
    end;
  end if;

  if _end_date is not null then
    v_end_at := case v_view
      when 'month' then date_trunc('month', _end_date::timestamp) + interval '1 month'
      when 'year' then date_trunc('year', _end_date::timestamp) + interval '1 year'
      else (_end_date + 1)::timestamp
    end;
  end if;

  v_recent_start_at := now() - interval '30 days';

  return query
  with visible_transactions as (
    select wt.*
    from public.wallet_transactions wt
    join public.workspace_wallets ww
      on ww.id = wt.wallet_id
    where ww.ws_id = _ws_id
      and (v_start_at is null or wt.taken_at >= v_start_at)
      and (v_end_at is null or wt.taken_at < v_end_at)
      and (
        (not include_confidential and not coalesce(wt.is_amount_confidential, false))
        or (
          include_confidential
          and (
            not coalesce(wt.is_amount_confidential, false)
            or v_can_view_amount
          )
        )
      )
  ),
  recent_visible_transactions as (
    select wt.*
    from public.wallet_transactions wt
    join public.workspace_wallets ww
      on ww.id = wt.wallet_id
    where ww.ws_id = _ws_id
      and wt.taken_at >= v_recent_start_at
      and (
        (not include_confidential and not coalesce(wt.is_amount_confidential, false))
        or (
          include_confidential
          and (
            not coalesce(wt.is_amount_confidential, false)
            or v_can_view_amount
          )
        )
      )
  ),
  visible_invoices as (
    select fi.*
    from public.finance_invoices fi
    where fi.ws_id = _ws_id
      and (v_start_at is null or fi.created_at >= v_start_at)
      and (v_end_at is null or fi.created_at < v_end_at)
  ),
  wallet_metrics as (
    select count(*)::bigint as wallet_count
    from public.workspace_wallets ww
    where ww.ws_id = _ws_id
  ),
  category_metrics as (
    select count(*)::bigint as category_count
    from public.transaction_categories tc
    where tc.ws_id = _ws_id
  ),
  transaction_metrics as (
    select
      count(*)::bigint as transaction_count,
      coalesce(sum(amount) filter (where coalesce(amount, 0) > 0), 0)::double precision as total_income,
      coalesce(sum(abs(amount)) filter (where coalesce(amount, 0) < 0), 0)::double precision as total_expense,
      coalesce(sum(amount), 0)::double precision as net_total,
      max(taken_at) as latest_transaction_at
    from visible_transactions
  ),
  invoice_metrics as (
    select count(*)::bigint as invoice_count
    from visible_invoices
  ),
  recent_metrics as (
    select
      count(*)::bigint as recent_transaction_count,
      count(*) filter (where coalesce(amount, 0) > 0)::bigint as recent_income_count,
      count(*) filter (where coalesce(amount, 0) < 0)::bigint as recent_expense_count,
      coalesce(sum(amount) filter (where coalesce(amount, 0) > 0), 0)::double precision as recent_total_income,
      coalesce(sum(abs(amount)) filter (where coalesce(amount, 0) < 0), 0)::double precision as recent_total_expense,
      coalesce(sum(amount), 0)::double precision as recent_net_total
    from recent_visible_transactions
  )
  select
    wm.wallet_count,
    cm.category_count,
    tm.transaction_count,
    im.invoice_count,
    tm.total_income,
    tm.total_expense,
    tm.net_total,
    rm.recent_transaction_count,
    rm.recent_income_count,
    rm.recent_expense_count,
    rm.recent_total_income,
    rm.recent_total_expense,
    rm.recent_net_total,
    tm.latest_transaction_at
  from wallet_metrics wm
  cross join category_metrics cm
  cross join transaction_metrics tm
  cross join invoice_metrics im
  cross join recent_metrics rm;
end;
$$;

revoke all on function private.get_finance_overview_metrics(
  uuid,
  uuid,
  text,
  date,
  date,
  boolean
) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.get_finance_overview_metrics(
  uuid,
  uuid,
  text,
  date,
  date,
  boolean
) to service_role;

comment on function private.get_finance_overview_metrics(
  uuid,
  uuid,
  text,
  date,
  date,
  boolean
) is
  'Server-owned finance overview helper that returns dashboard counts, income, expense, net totals, and recent 30-day pace for one workspace.';
