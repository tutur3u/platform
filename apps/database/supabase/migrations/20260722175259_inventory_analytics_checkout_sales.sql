-- Preserve the stock, costing, funnel, and catalog snapshot from the original
-- analytics function. A thin wrapper below replaces only sale-derived fields
-- with the same combined source of truth used by the Sales ledger.
alter function private.get_inventory_analytics(uuid, integer)
rename to get_inventory_analytics_base_20260722;

create function private.get_inventory_sales_analytics(
  p_ws_id uuid,
  p_days integer default 30,
  p_currency text default 'USD'
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with params as (
    select
      greatest(7, least(coalesce(p_days, 30), 365))::integer as days,
      upper(coalesce(nullif(trim(p_currency), ''), 'USD')) as currency,
      current_date as end_date,
      (
        current_date
        - (greatest(7, least(coalesce(p_days, 30), 365)) - 1)
      )::date as start_date,
      (
        current_date
        - (greatest(7, least(coalesce(p_days, 30), 365)) * 2 - 1)
      )::date as previous_start_date,
      (
        current_date
        - greatest(7, least(coalesce(p_days, 30), 365))
      )::date as previous_end_date
  ),
  all_sales as (
    select
      invoice.id,
      'finance_invoice'::text as source,
      invoice.paid_amount::numeric as revenue,
      coalesce(invoice.completed_at, invoice.created_at) as occurred_at,
      coalesce(invoice.completed_at, invoice.created_at)::date as sale_date,
      case
        when checkout.square_order_id is not null then 'square'
        when checkout.polar_order_id is not null then 'polar'
        when checkout.id is not null then 'storefront'
        else 'manual'
      end as channel
    from public.finance_invoices invoice
    left join lateral (
      select
        candidate.id,
        candidate.polar_order_id,
        candidate.square_order_id
      from private.inventory_checkout_sessions candidate
      where candidate.ws_id = p_ws_id
        and candidate.finance_invoice_id = invoice.id
      order by candidate.completed_at desc nulls last, candidate.created_at desc
      limit 1
    ) checkout on true
    where invoice.ws_id = p_ws_id
      and coalesce(invoice.completed_at, invoice.created_at) is not null
      and exists (
        select 1
        from public.finance_invoice_products line
        where line.invoice_id = invoice.id
      )

    union all

    select
      checkout.id,
      'checkout_session'::text as source,
      checkout.total_amount::numeric
        / private.inventory_currency_minor_factor(checkout.currency) as revenue,
      coalesce(checkout.completed_at, checkout.created_at) as occurred_at,
      coalesce(checkout.completed_at, checkout.created_at)::date as sale_date,
      case
        when checkout.square_order_id is not null
          or checkout.checkout_provider in ('square_pos', 'square_terminal')
          then 'square'
        when checkout.polar_order_id is not null
          or checkout.checkout_provider = 'polar'
          then 'polar'
        else 'storefront'
      end as channel
    from private.inventory_checkout_sessions checkout
    cross join params
    where checkout.ws_id = p_ws_id
      and checkout.status = 'completed'
      and upper(checkout.currency) = params.currency
      and coalesce(checkout.completed_at, checkout.created_at) is not null
  ),
  all_lines as (
    select
      sale.id as sale_id,
      sale.source,
      sale.sale_date,
      sale.channel,
      line.product_id,
      coalesce(product.name, nullif(line.product_name, ''), 'Unknown product')
        as product_name,
      product.avatar_url,
      product.category_id,
      coalesce(category.name, 'Uncategorized') as category_name,
      line.owner_id,
      coalesce(nullif(line.owner_name, ''), 'Unassigned') as owner_name,
      coalesce(line.amount, 0)::numeric as quantity,
      coalesce(line.amount, 0)::numeric * coalesce(line.price, 0)::numeric
        as line_revenue
    from all_sales sale
    join public.finance_invoice_products line
      on sale.source = 'finance_invoice'
     and line.invoice_id = sale.id
    left join public.workspace_products product
      on product.id = line.product_id
     and product.ws_id = p_ws_id
    left join public.product_categories category
      on category.id = product.category_id

    union all

    select
      sale.id as sale_id,
      sale.source,
      sale.sale_date,
      sale.channel,
      line.product_id,
      coalesce(product.name, nullif(line.title, ''), 'Unknown product')
        as product_name,
      product.avatar_url,
      product.category_id,
      coalesce(category.name, 'Uncategorized') as category_name,
      product.owner_id,
      coalesce(owner.name, 'Unassigned') as owner_name,
      coalesce(line.quantity, 0)::numeric as quantity,
      coalesce(line.subtotal_amount, 0)::numeric
        / private.inventory_currency_minor_factor(checkout.currency)
        as line_revenue
    from all_sales sale
    join private.inventory_checkout_sessions checkout
      on sale.source = 'checkout_session'
     and checkout.id = sale.id
     and checkout.ws_id = p_ws_id
    join private.inventory_checkout_lines line
      on line.checkout_session_id = checkout.id
    left join public.workspace_products product
      on product.id = line.product_id
     and product.ws_id = p_ws_id
    left join public.product_categories category
      on category.id = product.category_id
    left join private.inventory_owners owner
      on owner.id = product.owner_id
     and owner.ws_id = p_ws_id
  ),
  current_sales as (
    select sale.*
    from all_sales sale
    cross join params
    where sale.sale_date between params.start_date and params.end_date
  ),
  previous_sales as (
    select sale.*
    from all_sales sale
    cross join params
    where sale.sale_date
      between params.previous_start_date and params.previous_end_date
  ),
  current_lines as (
    select line.*
    from all_lines line
    cross join params
    where line.sale_date between params.start_date and params.end_date
  ),
  previous_lines as (
    select line.*
    from all_lines line
    cross join params
    where line.sale_date
      between params.previous_start_date and params.previous_end_date
  ),
  current_summary as (
    select
      coalesce(sum(sale.revenue), 0) as revenue,
      count(*)::integer as sales,
      coalesce((select sum(quantity) from current_lines), 0) as units
    from current_sales sale
  ),
  previous_summary as (
    select
      coalesce(sum(sale.revenue), 0) as revenue,
      count(*)::integer as sales,
      coalesce((select sum(quantity) from previous_lines), 0) as units
    from previous_sales sale
  ),
  stock_by_product as (
    select
      product.id as product_id,
      coalesce(sum(stock.amount) filter (where stock.amount is not null), 0)
        as finite_units,
      count(*) filter (
        where stock.product_id is not null and stock.amount is null
      )::integer as unlimited_rows
    from public.workspace_products product
    left join private.inventory_products stock on stock.product_id = product.id
    where product.ws_id = p_ws_id
      and coalesce(product.archived, false) = false
    group by product.id
  ),
  stock_summary as (
    select coalesce(sum(finite_units), 0) as finite_units
    from stock_by_product
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
  current_daily as (
    select
      sale.sale_date,
      sum(sale.revenue) as revenue,
      count(*)::integer as sales
    from current_sales sale
    group by sale.sale_date
  ),
  current_daily_units as (
    select sale_date, sum(quantity) as units
    from current_lines
    group by sale_date
  ),
  previous_daily as (
    select
      sale.sale_date,
      sum(sale.revenue) as revenue,
      count(*)::integer as sales
    from previous_sales sale
    group by sale.sale_date
  ),
  previous_daily_units as (
    select sale_date, sum(quantity) as units
    from previous_lines
    group by sale_date
  ),
  trend as (
    select
      day::date as sale_date,
      aligned.previous_day::date as previous_date,
      coalesce(current_daily.revenue, 0) as revenue,
      coalesce(current_daily.sales, 0) as sales,
      coalesce(current_daily_units.units, 0) as units,
      coalesce(previous_daily.revenue, 0) as previous_revenue,
      coalesce(previous_daily.sales, 0) as previous_sales,
      coalesce(previous_daily_units.units, 0) as previous_units
    from params
    cross join lateral generate_series(
      params.start_date,
      params.end_date,
      interval '1 day'
    ) day
    cross join lateral (
      select day - (params.days * interval '1 day') as previous_day
    ) aligned
    left join current_daily on current_daily.sale_date = day::date
    left join current_daily_units on current_daily_units.sale_date = day::date
    left join previous_daily
      on previous_daily.sale_date = aligned.previous_day::date
    left join previous_daily_units
      on previous_daily_units.sale_date = aligned.previous_day::date
  ),
  category_mix as (
    select
      category_name as label,
      sum(line_revenue) as revenue,
      sum(quantity) as units,
      count(distinct (source, sale_id))::integer as sales
    from current_lines
    group by category_name
    order by revenue desc, label asc
    limit 12
  ),
  owner_mix as (
    select
      owner_name as label,
      sum(line_revenue) as revenue,
      sum(quantity) as units,
      count(distinct (source, sale_id))::integer as sales
    from current_lines
    group by owner_name
    order by revenue desc, label asc
    limit 12
  ),
  product_performance as (
    select
      line.product_id,
      line.product_name,
      max(line.avatar_url) as image_url,
      sum(line.line_revenue) as revenue,
      sum(line.quantity) as units,
      count(distinct (line.source, line.sale_id))::integer as sales,
      coalesce(max(stock.finite_units), 0) as finite_stock,
      coalesce(max(stock.unlimited_rows), 0)::integer as unlimited_rows
    from current_lines line
    left join stock_by_product stock on stock.product_id = line.product_id
    group by line.product_id, line.product_name
    order by revenue desc, product_name asc
    limit 15
  ),
  channel_mix as (
    select
      sale.channel as label,
      sum(sale.revenue) as revenue,
      count(*)::integer as sales,
      coalesce(sum(line_units.units), 0) as units
    from current_sales sale
    left join lateral (
      select sum(line.quantity) as units
      from current_lines line
      where line.sale_id = sale.id
        and line.source = sale.source
    ) line_units on true
    group by sale.channel
    order by revenue desc, label asc
  ),
  weekday_mix as (
    select
      weekday as day,
      coalesce(sum(sale.revenue), 0) as revenue,
      count(sale.id)::integer as sales
    from generate_series(1, 7) weekday
    left join current_sales sale
      on extract(isodow from sale.occurred_at)::integer = weekday
    group by weekday
    order by weekday
  ),
  period_performance as (
    select
      coalesce(period.name, 'Unassigned') as label,
      period.id as period_id,
      sum(sale.revenue) as revenue,
      count(*)::integer as sales
    from current_sales sale
    left join private.inventory_sales_period_assignments assignment
      on assignment.ws_id = p_ws_id
     and assignment.sale_source = sale.source
     and assignment.sale_id = sale.id
    left join private.inventory_sales_periods period
      on period.id = assignment.period_id
     and period.ws_id = p_ws_id
    group by period.id, period.name
    order by revenue desc, label asc
    limit 12
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'revenue', current_summary.revenue,
      'sales', current_summary.sales,
      'units', current_summary.units,
      'averageOrderValue', case
        when current_summary.sales > 0
          then current_summary.revenue / current_summary.sales
        else 0
      end,
      'estimatedGrossProfit',
        current_summary.revenue * costing.margin_percentage / 100,
      'sellThroughPercentage', case
        when current_summary.units + stock_summary.finite_units > 0
          then current_summary.units * 100
            / (current_summary.units + stock_summary.finite_units)
        else 0
      end
    ),
    'previousSummary', jsonb_build_object(
      'revenue', previous_summary.revenue,
      'sales', previous_summary.sales,
      'units', previous_summary.units,
      'averageOrderValue', case
        when previous_summary.sales > 0
          then previous_summary.revenue / previous_summary.sales
        else 0
      end
    ),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', sale_date,
        'previousDate', previous_date,
        'revenue', revenue,
        'sales', sales,
        'units', units,
        'previousRevenue', previous_revenue,
        'previousSales', previous_sales,
        'previousUnits', previous_units
      ) order by sale_date)
      from trend
    ), '[]'::jsonb),
    'categoryMix', coalesce((
      select jsonb_agg(to_jsonb(category_mix) order by revenue desc, label asc)
      from category_mix
    ), '[]'::jsonb),
    'ownerMix', coalesce((
      select jsonb_agg(to_jsonb(owner_mix) order by revenue desc, label asc)
      from owner_mix
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', product_id,
        'label', product_name,
        'imageUrl', image_url,
        'revenue', revenue,
        'units', units,
        'sales', sales,
        'finiteStock', finite_stock,
        'unlimitedStockRows', unlimited_rows
      ) order by revenue desc, product_name asc)
      from product_performance
    ), '[]'::jsonb),
    'channels', coalesce((
      select jsonb_agg(to_jsonb(channel_mix) order by revenue desc, label asc)
      from channel_mix
    ), '[]'::jsonb),
    'weekdays', coalesce((
      select jsonb_agg(to_jsonb(weekday_mix) order by day)
      from weekday_mix
    ), '[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'periodId', period_id,
        'label', label,
        'revenue', revenue,
        'sales', sales
      ) order by revenue desc, label asc)
      from period_performance
    ), '[]'::jsonb)
  )
  from current_summary
  cross join previous_summary
  cross join stock_summary
  cross join costing;
$$;

create function private.get_inventory_analytics(
  p_ws_id uuid,
  p_days integer default 30,
  p_currency text default 'USD'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  base_snapshot jsonb;
  sales_snapshot jsonb;
begin
  base_snapshot := private.get_inventory_analytics_base_20260722(
    p_ws_id,
    p_days
  );
  sales_snapshot := private.get_inventory_sales_analytics(
    p_ws_id,
    p_days,
    p_currency
  );

  base_snapshot := jsonb_set(
    base_snapshot,
    '{summary}',
    coalesce(base_snapshot -> 'summary', '{}'::jsonb)
      || coalesce(sales_snapshot -> 'summary', '{}'::jsonb),
    true
  );
  base_snapshot := jsonb_set(
    base_snapshot,
    '{previousSummary}',
    coalesce(base_snapshot -> 'previousSummary', '{}'::jsonb)
      || coalesce(sales_snapshot -> 'previousSummary', '{}'::jsonb),
    true
  );

  return base_snapshot || (sales_snapshot - 'summary' - 'previousSummary');
end;
$$;

revoke all on function private.get_inventory_analytics_base_20260722(
  uuid,
  integer
) from public, anon, authenticated, service_role;
revoke all on function private.get_inventory_sales_analytics(
  uuid,
  integer,
  text
) from public, anon, authenticated, service_role;
revoke all on function private.get_inventory_analytics(
  uuid,
  integer,
  text
) from public, anon, authenticated;

grant execute on function private.get_inventory_analytics(
  uuid,
  integer,
  text
) to service_role;

comment on function private.get_inventory_analytics(uuid, integer, text) is
  'Inventory analytics across Finance invoices and completed commerce checkouts, with checkout minor units normalized to the requested currency.';
