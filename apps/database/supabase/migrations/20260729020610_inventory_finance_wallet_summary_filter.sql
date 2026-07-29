drop function private.get_inventory_finance_reconciliation_summary(
  uuid,
  timestamptz,
  timestamptz
);

create function private.get_inventory_finance_reconciliation_summary(
  p_ws_id uuid,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_wallet_id uuid default null
)
returns table (
  provider text,
  kind text,
  currency text,
  status text,
  entry_count bigint,
  amount_minor bigint,
  amount numeric
)
language sql
security definer
set search_path = ''
as $$
  select
    entry.provider,
    entry.entry_kind,
    entry.currency,
    entry.reconciliation_status,
    count(*)::bigint,
    coalesce(sum(entry.amount_minor), 0)::bigint,
    coalesce(sum(entry.amount), 0)::numeric
  from private.inventory_finance_entries as entry
  left join public.wallet_transactions as transaction
    on transaction.id = entry.wallet_transaction_id
  where entry.ws_id = p_ws_id
    and (p_start_date is null or entry.occurred_at >= p_start_date)
    and (p_end_date is null or entry.occurred_at <= p_end_date)
    and (p_wallet_id is null or transaction.wallet_id = p_wallet_id)
  group by
    entry.provider,
    entry.entry_kind,
    entry.currency,
    entry.reconciliation_status;
$$;

revoke all on function private.get_inventory_finance_reconciliation_summary(
  uuid,
  timestamptz,
  timestamptz,
  uuid
) from public, anon, authenticated;

grant execute on function private.get_inventory_finance_reconciliation_summary(
  uuid,
  timestamptz,
  timestamptz,
  uuid
) to service_role;
