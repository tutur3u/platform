create or replace function private.get_inventory_analytics(
  p_ws_id uuid,
  p_days integer default 30
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
  all_inventory_invoices as (
    select
      invoice.id,
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
  ),
  current_invoices as (
    select invoice.*
    from all_inventory_invoices invoice
    cross join params
    where invoice.sale_date between params.start_date and params.end_date
  ),
  previous_invoices as (
    select invoice.*
    from all_inventory_invoices invoice
    cross join params
    where invoice.sale_date
      between params.previous_start_date and params.previous_end_date
  ),
  current_lines as (
    select
      invoice.id as invoice_id,
      invoice.sale_date,
      invoice.channel,
      line.product_id,
      coalesce(product.name, nullif(line.product_name, ''), 'Unknown product')
        as product_name,
      product.avatar_url,
      product.category_id,
      coalesce(category.name, 'Uncategorized') as category_name,
      line.owner_id,
      coalesce(nullif(line.owner_name, ''), 'Unassigned') as owner_name,
      coalesce(line.amount, 0)::numeric as quantity,
      coalesce(line.price, 0)::numeric as unit_price,
      coalesce(line.amount, 0)::numeric * coalesce(line.price, 0)::numeric
        as line_revenue
    from current_invoices invoice
    join public.finance_invoice_products line on line.invoice_id = invoice.id
    left join public.workspace_products product
      on product.id = line.product_id
     and product.ws_id = p_ws_id
    left join public.product_categories category on category.id = product.category_id
  ),
  previous_lines as (
    select
      invoice.id as invoice_id,
      coalesce(line.amount, 0)::numeric as quantity
    from previous_invoices invoice
    join public.finance_invoice_products line on line.invoice_id = invoice.id
  ),
  current_summary as (
    select
      coalesce(sum(invoice.revenue), 0) as revenue,
      count(*)::integer as sales,
      coalesce((select sum(quantity) from current_lines), 0) as units
    from current_invoices invoice
  ),
  previous_summary as (
    select
      coalesce(sum(invoice.revenue), 0) as revenue,
      count(*)::integer as sales,
      coalesce((select sum(quantity) from previous_lines), 0) as units
    from previous_invoices invoice
  ),
  active_products as (
    select product.*
    from public.workspace_products product
    where product.ws_id = p_ws_id
      and coalesce(product.archived, false) = false
  ),
  stock_by_product as (
    select
      product.id as product_id,
      count(stock.product_id)::integer as stock_rows,
      count(*) filter (
        where stock.product_id is not null and stock.amount is null
      )::integer as unlimited_rows,
      coalesce(sum(stock.amount) filter (where stock.amount is not null), 0)
        as finite_units,
      coalesce(sum(stock.amount * stock.price)
        filter (where stock.amount is not null), 0) as inventory_value,
      count(*) filter (
        where stock.amount is not null and stock.amount <= stock.min_amount
      )::integer as low_stock_rows,
      count(*) filter (
        where stock.amount is not null and stock.amount <= 0
      )::integer as out_of_stock_rows
    from active_products product
    left join private.inventory_products stock on stock.product_id = product.id
    group by product.id
  ),
  stock_summary as (
    select
      count(*)::integer as products,
      count(*) filter (where stock_rows > 0)::integer as stocked_products,
      coalesce(sum(stock_rows), 0)::integer as stock_rows,
      coalesce(sum(unlimited_rows), 0)::integer as unlimited_rows,
      coalesce(sum(finite_units), 0) as finite_units,
      coalesce(sum(inventory_value), 0) as inventory_value,
      coalesce(sum(low_stock_rows), 0)::integer as low_stock_rows,
      coalesce(sum(out_of_stock_rows), 0)::integer as out_of_stock_rows
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
      invoice.sale_date,
      sum(invoice.revenue) as revenue,
      count(*)::integer as sales
    from current_invoices invoice
    group by invoice.sale_date
  ),
  current_daily_units as (
    select sale_date, sum(quantity) as units
    from current_lines
    group by sale_date
  ),
  previous_daily as (
    select
      invoice.sale_date,
      sum(invoice.revenue) as revenue,
      count(*)::integer as sales
    from previous_invoices invoice
    group by invoice.sale_date
  ),
  previous_daily_units as (
    select invoice.sale_date, sum(line.quantity) as units
    from previous_invoices invoice
    join previous_lines line on line.invoice_id = invoice.id
    group by invoice.sale_date
  ),
  trend as (
    select
      day::date as sale_date,
      previous_day::date as previous_date,
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
      count(distinct invoice_id)::integer as sales
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
      count(distinct invoice_id)::integer as sales
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
      count(distinct line.invoice_id)::integer as sales,
      coalesce(max(stock.finite_units), 0) as finite_stock,
      coalesce(max(stock.unlimited_rows), 0)::integer as unlimited_rows
    from current_lines line
    left join stock_by_product stock on stock.product_id = line.product_id
    group by line.product_id, line.product_name
    order by revenue desc, product_name asc
    limit 15
  ),
  warehouse_health as (
    select
      warehouse.id,
      coalesce(warehouse.name, 'Unnamed warehouse') as label,
      count(distinct product.id)::integer as products,
      count(stock.product_id)::integer as stock_rows,
      count(*) filter (
        where stock.product_id is not null and stock.amount is null
      )::integer as unlimited_rows,
      coalesce(sum(stock.amount) filter (where stock.amount is not null), 0)
        as finite_units,
      coalesce(sum(stock.amount * stock.price)
        filter (where stock.amount is not null), 0) as inventory_value,
      count(*) filter (
        where stock.amount is not null and stock.amount <= stock.min_amount
      )::integer as low_stock_rows,
      count(*) filter (
        where stock.amount is not null and stock.amount <= 0
      )::integer as out_of_stock_rows
    from private.inventory_warehouses warehouse
    left join private.inventory_products stock
      on stock.warehouse_id = warehouse.id
    left join active_products product on product.id = stock.product_id
    where warehouse.ws_id = p_ws_id
    group by warehouse.id, warehouse.name
    order by inventory_value desc, label asc
  ),
  channel_mix as (
    select
      invoice.channel as label,
      sum(invoice.revenue) as revenue,
      count(*)::integer as sales,
      coalesce(sum(line_units.units), 0) as units
    from current_invoices invoice
    left join lateral (
      select sum(line.quantity) as units
      from current_lines line
      where line.invoice_id = invoice.id
    ) line_units on true
    group by invoice.channel
    order by revenue desc, label asc
  ),
  weekday_mix as (
    select
      weekday as day,
      coalesce(sum(invoice.revenue), 0) as revenue,
      count(invoice.id)::integer as sales
    from generate_series(1, 7) weekday
    left join current_invoices invoice
      on extract(isodow from invoice.occurred_at)::integer = weekday
    group by weekday
    order by weekday
  ),
  period_performance as (
    select
      coalesce(period.name, 'Unassigned') as label,
      period.id as period_id,
      sum(invoice.revenue) as revenue,
      count(*)::integer as sales
    from current_invoices invoice
    left join private.inventory_sales_period_assignments assignment
      on assignment.ws_id = p_ws_id
     and assignment.sale_source = 'finance_invoice'
     and assignment.sale_id = invoice.id
    left join private.inventory_sales_periods period
      on period.id = assignment.period_id
     and period.ws_id = p_ws_id
    group by period.id, period.name
    order by revenue desc, label asc
    limit 12
  ),
  funnel as (
    select
      count(*) filter (
        where event.event_type in ('view', 'product_view')
      )::integer as views,
      count(*) filter (where event.event_type = 'add_to_cart')::integer
        as add_to_cart,
      count(*) filter (where event.event_type = 'checkout_started')::integer
        as checkout_started,
      count(*) filter (where event.event_type = 'checkout_created')::integer
        as checkout_created,
      count(*) filter (where event.event_type = 'checkout_completed')::integer
        as completed
    from private.inventory_storefront_events event
    cross join params
    where event.ws_id = p_ws_id
      and event.occurred_at::date between params.start_date and params.end_date
  ),
  quality as (
    select
      count(*) filter (where product.avatar_url is null)::integer
        as products_without_images,
      count(*) filter (where stock.stock_rows = 0)::integer
        as products_without_stock,
      count(*) filter (where stock.unlimited_rows > 0)::integer
        as products_with_unlimited_stock
    from active_products product
    join stock_by_product stock on stock.product_id = product.id
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object(
      'days', params.days,
      'from', params.start_date,
      'to', params.end_date,
      'previousFrom', params.previous_start_date,
      'previousTo', params.previous_end_date
    ),
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
      'estimatedGrossMarginPercentage', costing.margin_percentage,
      'sellThroughPercentage', case
        when current_summary.units + stock_summary.finite_units > 0
          then current_summary.units * 100
            / (current_summary.units + stock_summary.finite_units)
        else 0
      end,
      'inventoryValue', stock_summary.inventory_value,
      'finiteStockUnits', stock_summary.finite_units,
      'activeProducts', stock_summary.products,
      'stockedProducts', stock_summary.stocked_products,
      'lowStockRows', stock_summary.low_stock_rows,
      'outOfStockRows', stock_summary.out_of_stock_rows,
      'unlimitedStockRows', stock_summary.unlimited_rows
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
    'warehouses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'label', label,
        'products', products,
        'stockRows', stock_rows,
        'unlimitedStockRows', unlimited_rows,
        'finiteStockUnits', finite_units,
        'inventoryValue', inventory_value,
        'lowStockRows', low_stock_rows,
        'outOfStockRows', out_of_stock_rows
      ) order by inventory_value desc, label asc)
      from warehouse_health
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
    ), '[]'::jsonb),
    'storefrontFunnel', jsonb_build_object(
      'views', funnel.views,
      'addToCart', funnel.add_to_cart,
      'checkoutStarted', funnel.checkout_started,
      'checkoutCreated', funnel.checkout_created,
      'completed', funnel.completed,
      'conversionRate', case
        when funnel.views > 0 then funnel.completed::numeric / funnel.views
        else 0
      end
    ),
    'quality', jsonb_build_object(
      'productsWithoutImages', quality.products_without_images,
      'productsWithoutStock', quality.products_without_stock,
      'productsWithUnlimitedStock', quality.products_with_unlimited_stock,
      'stockCoveragePercentage', case
        when stock_summary.products > 0
          then stock_summary.stocked_products::numeric * 100
            / stock_summary.products
        else 0
      end
    )
  )
  from params
  cross join current_summary
  cross join previous_summary
  cross join stock_summary
  cross join costing
  cross join funnel
  cross join quality;
$$;

create or replace function private.bulk_create_inventory_storefront_listings_from_stock(
  p_ws_id uuid,
  p_storefront_id uuid,
  p_minor_unit_factor integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  created_count integer := 0;
  eligible_count integer := 0;
  existing_count integer := 0;
  products_without_stock_count integer := 0;
begin
  if not exists (
    select 1
    from private.inventory_storefronts storefront
    where storefront.id = p_storefront_id
      and storefront.ws_id = p_ws_id
  ) then
    raise exception 'Inventory storefront not found';
  end if;

  if p_minor_unit_factor < 1 or p_minor_unit_factor > 1000 then
    raise exception 'Invalid currency minor unit factor';
  end if;

  with active_products as (
    select product.id
    from public.workspace_products product
    where product.ws_id = p_ws_id
      and coalesce(product.archived, false) = false
  )
  select
    count(*) filter (where preferred_stock.product_id is not null),
    count(*) filter (
      where preferred_stock.product_id is not null
        and exists (
          select 1
          from private.inventory_storefront_listings listing
          where listing.storefront_id = p_storefront_id
            and listing.ws_id = p_ws_id
            and listing.listing_type = 'product'
            and listing.product_id = product.id
            and listing.status <> 'archived'
        )
    ),
    count(*) filter (where preferred_stock.product_id is null)
  into eligible_count, existing_count, products_without_stock_count
  from active_products product
  left join lateral (
    select stock.product_id
    from private.inventory_products stock
    join private.inventory_units unit
      on unit.id = stock.unit_id and unit.ws_id = p_ws_id
    join private.inventory_warehouses warehouse
      on warehouse.id = stock.warehouse_id and warehouse.ws_id = p_ws_id
    where stock.product_id = product.id
    order by
      case when stock.amount is null or stock.amount > 0 then 0 else 1 end,
      stock.created_at asc nulls last,
      stock.unit_id,
      stock.warehouse_id
    limit 1
  ) preferred_stock on true;

  with preferred_products as (
    select
      product.id as product_id,
      coalesce(nullif(product.name, ''), 'Untitled product') as title,
      product.description,
      product.avatar_url,
      stock.unit_id,
      stock.warehouse_id,
      greatest(
        0,
        round(coalesce(stock.price, 0) * p_minor_unit_factor)::bigint
      ) as price,
      row_number() over (order by product.created_at asc nulls last, product.id)
        as position
    from public.workspace_products product
    join lateral (
      select candidate.*
      from private.inventory_products candidate
      join private.inventory_units unit
        on unit.id = candidate.unit_id and unit.ws_id = p_ws_id
      join private.inventory_warehouses warehouse
        on warehouse.id = candidate.warehouse_id and warehouse.ws_id = p_ws_id
      where candidate.product_id = product.id
      order by
        case when candidate.amount is null or candidate.amount > 0 then 0 else 1 end,
        candidate.created_at asc nulls last,
        candidate.unit_id,
        candidate.warehouse_id
      limit 1
    ) stock on true
    where product.ws_id = p_ws_id
      and coalesce(product.archived, false) = false
      and not exists (
        select 1
        from private.inventory_storefront_listings listing
        where listing.storefront_id = p_storefront_id
          and listing.ws_id = p_ws_id
          and listing.listing_type = 'product'
          and listing.product_id = product.id
          and listing.status <> 'archived'
      )
  ),
  current_sort as (
    select coalesce(max(listing.sort_order), -1) as max_sort
    from private.inventory_storefront_listings listing
    where listing.storefront_id = p_storefront_id
      and listing.ws_id = p_ws_id
  )
  insert into private.inventory_storefront_listings (
    storefront_id,
    ws_id,
    listing_type,
    product_id,
    unit_id,
    warehouse_id,
    title,
    description,
    image_url,
    price,
    status,
    sort_order,
    max_per_order
  )
  select
    p_storefront_id,
    p_ws_id,
    'product',
    product.product_id,
    product.unit_id,
    product.warehouse_id,
    product.title,
    product.description,
    product.avatar_url,
    product.price,
    'draft',
    current_sort.max_sort + product.position,
    99
  from preferred_products product
  cross join current_sort;

  get diagnostics created_count = row_count;

  return jsonb_build_object(
    'created', created_count,
    'eligible', eligible_count,
    'skippedExisting', existing_count,
    'skippedWithoutStock', products_without_stock_count
  );
end;
$$;

revoke all on function private.get_inventory_analytics(uuid, integer)
from public, anon, authenticated;

revoke all on function private.bulk_create_inventory_storefront_listings_from_stock(
  uuid,
  uuid,
  integer
) from public, anon, authenticated;

grant execute on function private.get_inventory_analytics(uuid, integer)
to service_role;

grant execute on function private.bulk_create_inventory_storefront_listings_from_stock(
  uuid,
  uuid,
  integer
) to service_role;
