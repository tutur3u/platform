create or replace function private.list_inventory_commerce_sales(
  p_ws_id uuid,
  p_period_id uuid default null,
  p_unassigned_only boolean default false,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  total_count integer,
  sale jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with assignments as (
    select
      assignment.sale_source,
      assignment.sale_id,
      period.id as period_id,
      period.name as period_name
    from private.inventory_sales_period_assignments assignment
    join private.inventory_sales_periods period
      on period.id = assignment.period_id
     and period.ws_id = assignment.ws_id
    where assignment.ws_id = p_ws_id
  ),
  finance_sales as (
    select
      invoice.id,
      'finance_invoice'::text as source,
      invoice.notice,
      invoice.note,
      invoice.paid_amount,
      null::text as currency,
      invoice.created_at,
      invoice.completed_at,
      wallet.name as wallet_name,
      invoice_category.name as category_name,
      customer.full_name as customer_name,
      coalesce(creator.full_name, platform_creator.display_name) as creator_name,
      null::text as public_token,
      null::text as polar_order_id,
      null::text as square_order_id,
      coalesce(line_summary.items_count, 0) as items_count,
      coalesce(line_summary.total_quantity, 0) as total_quantity,
      coalesce(line_summary.owners, array[]::text[]) as owners,
      assignment.period_id,
      assignment.period_name
    from public.finance_invoices invoice
    left join assignments assignment
      on assignment.sale_source = 'finance_invoice'
     and assignment.sale_id = invoice.id
    left join private.workspace_wallets wallet on wallet.id = invoice.wallet_id
    left join public.transaction_categories invoice_category
      on invoice_category.id = invoice.category_id
    left join public.workspace_users customer on customer.id = invoice.customer_id
    left join public.workspace_users creator on creator.id = invoice.creator_id
    left join public.users platform_creator
      on platform_creator.id = invoice.platform_creator_id
    left join lateral (
      select
        count(*)::integer as items_count,
        coalesce(sum(coalesce(line.amount, 0)), 0) as total_quantity,
        array_agg(
          distinct coalesce(nullif(line.owner_name, ''), 'Unassigned')
        ) as owners
      from public.finance_invoice_products line
      where line.invoice_id = invoice.id
    ) line_summary on true
    where invoice.ws_id = p_ws_id
      and line_summary.items_count > 0
      and (p_period_id is null or assignment.period_id = p_period_id)
      and (not p_unassigned_only or assignment.period_id is null)
  ),
  checkout_sales as (
    select
      checkout.id,
      'checkout_session'::text as source,
      checkout.public_token as notice,
      checkout.note,
      checkout.total_amount::numeric as paid_amount,
      checkout.currency,
      checkout.created_at,
      checkout.completed_at,
      null::text as wallet_name,
      null::text as category_name,
      coalesce(
        nullif(checkout.customer_name, ''),
        nullif(checkout.customer_email, ''),
        checkout.public_token
      ) as customer_name,
      null::text as creator_name,
      checkout.public_token,
      checkout.polar_order_id,
      checkout.square_order_id,
      coalesce(line_summary.items_count, 0) as items_count,
      coalesce(line_summary.total_quantity, 0) as total_quantity,
      array[]::text[] as owners,
      assignment.period_id,
      assignment.period_name
    from private.inventory_checkout_sessions checkout
    left join assignments assignment
      on assignment.sale_source = 'checkout_session'
     and assignment.sale_id = checkout.id
    left join lateral (
      select
        count(*)::integer as items_count,
        coalesce(sum(line.quantity), 0) as total_quantity
      from private.inventory_checkout_lines line
      where line.checkout_session_id = checkout.id
    ) line_summary on true
    where checkout.ws_id = p_ws_id
      and checkout.status = 'completed'
      and (p_period_id is null or assignment.period_id = p_period_id)
      and (not p_unassigned_only or assignment.period_id is null)
  ),
  combined as (
    select * from finance_sales
    union all
    select * from checkout_sales
  ),
  counted as (
    select count(*)::integer as total_count from combined
  ),
  paged as (
    select *
    from combined
    order by coalesce(completed_at, created_at) desc nulls last, id asc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    case
      when paged.id is null then null
      else jsonb_build_object(
        'id', paged.id,
        'source', paged.source,
        'notice', paged.notice,
        'note', paged.note,
        'paid_amount', paged.paid_amount,
        'currency', paged.currency,
        'created_at', paged.created_at,
        'completed_at', paged.completed_at,
        'wallet_name', paged.wallet_name,
        'category_name', paged.category_name,
        'customer_name', paged.customer_name,
        'creator_name', paged.creator_name,
        'public_token', paged.public_token,
        'polar_order_id', paged.polar_order_id,
        'square_order_id', paged.square_order_id,
        'items_count', paged.items_count,
        'total_quantity', paged.total_quantity,
        'owners', to_jsonb(paged.owners),
        'period', case
          when paged.period_id is null then null
          else jsonb_build_object(
            'id', paged.period_id,
            'name', paged.period_name
          )
        end
      )
    end as sale
  from counted
  left join paged on true;
$$;

create or replace function private.get_inventory_commerce_summary(
  p_ws_id uuid,
  p_currency text,
  p_period_id uuid default null,
  p_unassigned_only boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with assignments as (
    select assignment.sale_source, assignment.sale_id, assignment.period_id
    from private.inventory_sales_period_assignments assignment
    where assignment.ws_id = p_ws_id
  ),
  finance_sales as (
    select
      invoice.paid_amount::numeric as revenue,
      coalesce(lines.total_quantity, 0)::numeric as units_sold,
      upper(p_currency) as currency
    from public.finance_invoices invoice
    left join assignments assignment
      on assignment.sale_source = 'finance_invoice'
     and assignment.sale_id = invoice.id
    join lateral (
      select coalesce(sum(coalesce(line.amount, 0)), 0) as total_quantity
      from public.finance_invoice_products line
      where line.invoice_id = invoice.id
      having count(*) > 0
    ) lines on true
    where invoice.ws_id = p_ws_id
      and (p_period_id is null or assignment.period_id = p_period_id)
      and (not p_unassigned_only or assignment.period_id is null)
  ),
  checkout_sales as (
    select
      checkout.total_amount::numeric as revenue,
      coalesce(lines.total_quantity, 0)::numeric as units_sold,
      upper(checkout.currency) as currency
    from private.inventory_checkout_sessions checkout
    left join assignments assignment
      on assignment.sale_source = 'checkout_session'
     and assignment.sale_id = checkout.id
    left join lateral (
      select coalesce(sum(line.quantity), 0) as total_quantity
      from private.inventory_checkout_lines line
      where line.checkout_session_id = checkout.id
    ) lines on true
    where checkout.ws_id = p_ws_id
      and checkout.status = 'completed'
      and (p_period_id is null or assignment.period_id = p_period_id)
      and (not p_unassigned_only or assignment.period_id is null)
  ),
  combined as (
    select * from finance_sales
    union all
    select * from checkout_sales
  ),
  costing as (
    select greatest(
      0,
      least(
        100,
        coalesce(
          (
            private.get_inventory_costing_analytics(p_ws_id)
              ->> 'averageMarginPercentage'
          )::numeric,
          0
        )
      )
    ) as margin_percentage
  ),
  totals as (
    select
      coalesce(sum(revenue) filter (
        where currency = upper(p_currency)
      ), 0) as revenue,
      coalesce(sum(units_sold) filter (
        where currency = upper(p_currency)
      ), 0) as units_sold,
      count(*) filter (
        where currency = upper(p_currency)
      )::integer as sales_count,
      count(*) filter (
        where currency <> upper(p_currency)
      )::integer as excluded_currency_count
    from combined
  )
  select jsonb_build_object(
    'currency', upper(p_currency),
    'revenue', round(totals.revenue),
    'estimatedGrossProfit',
      round(totals.revenue * costing.margin_percentage / 100),
    'estimatedGrossMarginPercentage', costing.margin_percentage,
    'unitsSold', totals.units_sold,
    'salesCount', totals.sales_count,
    'excludedCurrencyCount', totals.excluded_currency_count
  )
  from totals
  cross join costing;
$$;

revoke all on function private.list_inventory_commerce_sales(
  uuid,
  uuid,
  boolean,
  integer,
  integer
) from public, anon, authenticated;

revoke all on function private.get_inventory_commerce_summary(
  uuid,
  text,
  uuid,
  boolean
) from public, anon, authenticated;

grant execute on function private.list_inventory_commerce_sales(
  uuid,
  uuid,
  boolean,
  integer,
  integer
) to service_role;

grant execute on function private.get_inventory_commerce_summary(
  uuid,
  text,
  uuid,
  boolean
) to service_role;
