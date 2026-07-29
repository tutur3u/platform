create function private.backfill_inventory_finance_sales(
  p_ws_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count bigint;
begin
  insert into private.inventory_finance_entries (
    ws_id,
    checkout_session_id,
    provider,
    entry_kind,
    source_key,
    provider_reference_id,
    amount_minor,
    amount,
    currency,
    occurred_at,
    provider_status,
    reconciliation_status,
    wallet_transaction_id,
    source_metadata
  )
  select
    checkout.ws_id,
    checkout.id,
    provider.value,
    'sale',
    'sale:' || coalesce(
      checkout.polar_order_id,
      checkout.square_payment_id,
      checkout.square_order_id,
      checkout.id::text
    ),
    coalesce(
      checkout.polar_order_id,
      checkout.square_payment_id,
      checkout.square_order_id,
      checkout.id::text
    ),
    checkout.total_amount,
    private.inventory_finance_minor_to_major(
      checkout.total_amount,
      checkout.currency
    ),
    upper(checkout.currency),
    coalesce(
      checkout.completed_at,
      checkout.updated_at,
      checkout.created_at,
      now()
    ),
    'completed',
    case
      when checkout.finance_transaction_id is null then 'pending'
      else 'linked'
    end,
    checkout.finance_transaction_id,
    jsonb_build_object(
      'checkoutId', checkout.id,
      'customerName', checkout.customer_name,
      'customerEmail', checkout.customer_email
    )
  from private.inventory_checkout_sessions as checkout
  cross join lateral (
    select case
      when checkout.checkout_provider in (
        'polar',
        'square_pos',
        'square_terminal'
      ) then checkout.checkout_provider
      when checkout.polar_order_id is not null then 'polar'
      when checkout.square_payment_id is not null then 'square_terminal'
      else null
    end as value
  ) as provider
  where checkout.status = 'completed'
    and checkout.total_amount > 0
    and provider.value is not null
    and (p_ws_id is null or checkout.ws_id = p_ws_id)
  on conflict (ws_id, provider, source_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function private.backfill_inventory_finance_sales(uuid)
from public, anon, authenticated;
grant execute on function private.backfill_inventory_finance_sales(uuid)
to service_role;

select private.backfill_inventory_finance_sales(null);
