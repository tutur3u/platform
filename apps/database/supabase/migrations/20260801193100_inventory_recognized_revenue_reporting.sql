-- Reporting surfaces consume the integer-minor-unit revenue allocation instead
-- of the provider-facing charged-line layout retained for payment audits.

drop function if exists private.list_inventory_sales_export_rows(uuid, uuid);

create function private.list_inventory_sales_export_rows(
  p_ws_id uuid,
  p_period_id uuid
)
returns table (
  sale_id uuid,
  sale_source text,
  period_id uuid,
  period_name text,
  created_at timestamptz,
  completed_at timestamptz,
  sale_amount numeric,
  currency text,
  monetary_unit text,
  customer_name text,
  customer_email text,
  creator_name text,
  wallet_name text,
  category_name text,
  notice text,
  note text,
  transaction_id text,
  finance_invoice_id uuid,
  public_token text,
  checkout_provider text,
  polar_order_id text,
  square_order_id text,
  line_id uuid,
  product_id uuid,
  product_name text,
  owner_id uuid,
  owner_name text,
  unit_id uuid,
  unit_name text,
  warehouse_id uuid,
  warehouse_name text,
  quantity numeric,
  unit_price numeric,
  line_total numeric,
  allocation_source text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with selected_period as (
    select period.id, period.name
    from private.inventory_sales_periods period
    where period.id = p_period_id and period.ws_id = p_ws_id
  ),
  assigned_sales as (
    select assignment.sale_id, assignment.sale_source,
      period.id as period_id, period.name as period_name
    from private.inventory_sales_period_assignments assignment
    join selected_period period on period.id = assignment.period_id
    where assignment.ws_id = p_ws_id
  ),
  finance_rows as (
    select
      invoice.id as sale_id,
      'finance_invoice'::text as sale_source,
      assigned.period_id,
      assigned.period_name,
      invoice.created_at,
      invoice.completed_at,
      invoice.paid_amount::numeric as sale_amount,
      null::text as currency,
      'major'::text as monetary_unit,
      coalesce(customer.full_name, customer.display_name) as customer_name,
      customer.email as customer_email,
      coalesce(creator.full_name, platform_creator.display_name) as creator_name,
      wallet.name as wallet_name,
      category.name as category_name,
      invoice.notice,
      invoice.note,
      invoice.transaction_id::text,
      invoice.id as finance_invoice_id,
      null::text as public_token,
      'manual'::text as checkout_provider,
      null::text as polar_order_id,
      null::text as square_order_id,
      null::uuid as line_id,
      line.product_id,
      line.product_name,
      line.owner_id,
      nullif(line.owner_name, '') as owner_name,
      line.unit_id,
      nullif(line.product_unit, '') as unit_name,
      line.warehouse_id,
      nullif(line.warehouse, '') as warehouse_name,
      line.amount::numeric as quantity,
      line.price::numeric as unit_price,
      (line.amount * line.price)::numeric as line_total,
      'direct'::text as allocation_source
    from assigned_sales assigned
    join public.finance_invoices invoice
      on assigned.sale_source = 'finance_invoice'
     and invoice.id = assigned.sale_id
     and invoice.ws_id = p_ws_id
    left join public.finance_invoice_products line on line.invoice_id = invoice.id
    left join private.workspace_wallets wallet
      on wallet.id = invoice.wallet_id and wallet.ws_id = p_ws_id
    left join public.transaction_categories category
      on category.id = invoice.category_id and category.ws_id = p_ws_id
    left join public.workspace_users customer
      on customer.id = invoice.customer_id and customer.ws_id = p_ws_id
    left join public.workspace_users creator
      on creator.id = invoice.creator_id and creator.ws_id = p_ws_id
    left join public.users platform_creator
      on platform_creator.id = invoice.platform_creator_id
  ),
  checkout_rows as (
    select
      checkout.id as sale_id,
      'checkout_session'::text as sale_source,
      assigned.period_id,
      assigned.period_name,
      checkout.created_at,
      checkout.completed_at,
      checkout.total_amount::numeric as sale_amount,
      checkout.currency,
      'minor'::text as monetary_unit,
      nullif(checkout.customer_name, '') as customer_name,
      nullif(checkout.customer_email, '') as customer_email,
      null::text as creator_name,
      wallet.name as wallet_name,
      category.name as category_name,
      checkout.public_token as notice,
      checkout.note,
      checkout.finance_transaction_id::text as transaction_id,
      checkout.finance_invoice_id,
      checkout.public_token,
      checkout.checkout_provider,
      checkout.polar_order_id,
      checkout.square_order_id,
      line.id as line_id,
      line.product_id,
      coalesce(product.name, line.title) as product_name,
      product.owner_id,
      owner.name as owner_name,
      line.unit_id,
      unit.name as unit_name,
      line.warehouse_id,
      warehouse.name as warehouse_name,
      line.quantity::numeric as quantity,
      case when line.quantity > 0
        then line.recognized_revenue_amount::numeric / line.quantity
        else 0::numeric
      end as unit_price,
      line.recognized_revenue_amount::numeric as line_total,
      line.revenue_allocation_source as allocation_source
    from assigned_sales assigned
    join private.inventory_checkout_sessions checkout
      on assigned.sale_source = 'checkout_session'
     and checkout.id = assigned.sale_id
     and checkout.ws_id = p_ws_id
     and checkout.status = 'completed'
    left join private.inventory_checkout_lines line
      on line.checkout_session_id = checkout.id
    left join public.workspace_products product
      on product.id = line.product_id and product.ws_id = p_ws_id
    left join private.inventory_owners owner
      on owner.id = product.owner_id and owner.ws_id = p_ws_id
    left join private.inventory_units unit
      on unit.id = line.unit_id and unit.ws_id = p_ws_id
    left join private.inventory_warehouses warehouse
      on warehouse.id = line.warehouse_id and warehouse.ws_id = p_ws_id
    left join private.workspace_wallets wallet
      on wallet.id = checkout.cash_wallet_id and wallet.ws_id = p_ws_id
    left join public.transaction_categories category
      on category.id = checkout.cash_category_id and category.ws_id = p_ws_id
  ),
  combined as (
    select * from finance_rows
    union all
    select * from checkout_rows
  )
  select * from combined
  order by coalesce(completed_at, created_at) desc nulls last,
    sale_id, product_name nulls last, line_id nulls last;
$$;

revoke all on function private.list_inventory_sales_export_rows(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.list_inventory_sales_export_rows(uuid, uuid)
  to service_role;

create or replace function private.list_inventory_revenue_share_earnings(
  p_ws_id uuid,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_partner_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (total_count integer, earning jsonb)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with source_lines as (
    select
      checkout.id as sale_id,
      coalesce(checkout.completed_at, checkout.updated_at, checkout.created_at) as sold_at,
      checkout.currency,
      line.product_id,
      product.name as product_name,
      line.quantity::numeric as units_sold,
      line.recognized_revenue_amount::numeric as attributed_revenue,
      stock.revenue_share_partner_id as partner_id,
      stock.revenue_share_bps
    from private.inventory_checkout_lines line
    join private.inventory_checkout_sessions checkout
      on checkout.id = line.checkout_session_id
     and checkout.ws_id = p_ws_id
     and checkout.status = 'completed'
    join private.inventory_products stock
      on stock.product_id = line.product_id
     and stock.unit_id = line.unit_id
     and stock.warehouse_id = line.warehouse_id
    join public.workspace_products product
      on product.id = line.product_id and product.ws_id = p_ws_id
    where stock.revenue_share_partner_id is not null
      and stock.revenue_share_bps > 0
      and (p_start_at is null or coalesce(checkout.completed_at, checkout.updated_at, checkout.created_at) >= p_start_at)
      and (p_end_at is null or coalesce(checkout.completed_at, checkout.updated_at, checkout.created_at) < p_end_at)
      and (p_partner_id is null or stock.revenue_share_partner_id = p_partner_id)

    union all

    select
      invoice.id as sale_id,
      coalesce(invoice.completed_at, invoice.created_at) as sold_at,
      'USD'::text as currency,
      line.product_id,
      coalesce(product.name, line.product_name) as product_name,
      line.amount::numeric as units_sold,
      (line.amount * line.price)::numeric as attributed_revenue,
      stock.revenue_share_partner_id as partner_id,
      stock.revenue_share_bps
    from public.finance_invoice_products line
    join public.finance_invoices invoice
      on invoice.id = line.invoice_id
     and invoice.ws_id = p_ws_id
     and invoice.completed_at is not null
    join private.inventory_products stock
      on stock.product_id = line.product_id
     and stock.unit_id = line.unit_id
     and stock.warehouse_id = line.warehouse_id
    left join public.workspace_products product
      on product.id = line.product_id and product.ws_id = p_ws_id
    where stock.revenue_share_partner_id is not null
      and stock.revenue_share_bps > 0
      and not exists (
        select 1 from private.inventory_checkout_sessions checkout
        where checkout.finance_invoice_id = invoice.id
          and checkout.ws_id = p_ws_id
      )
      and (p_start_at is null or coalesce(invoice.completed_at, invoice.created_at) >= p_start_at)
      and (p_end_at is null or coalesce(invoice.completed_at, invoice.created_at) < p_end_at)
      and (p_partner_id is null or stock.revenue_share_partner_id = p_partner_id)
  ),
  grouped as (
    select
      source_lines.partner_id,
      owner.name as partner_name,
      owner.avatar_url,
      source_lines.revenue_share_bps,
      source_lines.currency,
      count(distinct source_lines.sale_id)::integer as sales_count,
      count(distinct source_lines.product_id)::integer as product_count,
      sum(source_lines.units_sold)::numeric as units_sold,
      sum(source_lines.attributed_revenue)::numeric as attributed_revenue,
      min(source_lines.sold_at) as first_sale_at,
      max(source_lines.sold_at) as last_sale_at,
      array_agg(distinct source_lines.product_name order by source_lines.product_name) as products
    from source_lines
    join private.inventory_owners owner
      on owner.id = source_lines.partner_id and owner.ws_id = p_ws_id
    group by source_lines.partner_id, owner.name, owner.avatar_url,
      source_lines.revenue_share_bps, source_lines.currency
  ),
  counted as (
    select count(*)::integer as total_count from grouped
  ),
  paged as (
    select * from grouped
    order by (attributed_revenue * revenue_share_bps / 10000.0) desc,
      partner_name asc
    limit greatest(1, least(coalesce(p_limit, 50), 250))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    case when paged.partner_id is null then null else jsonb_build_object(
      'partnerId', paged.partner_id,
      'partnerName', paged.partner_name,
      'avatarUrl', paged.avatar_url,
      'revenueShareBps', paged.revenue_share_bps,
      'splitPercent', round(paged.revenue_share_bps::numeric / 100, 2),
      'currency', paged.currency,
      'attributedRevenue', round(paged.attributed_revenue)::bigint,
      'earnedAmount', round(paged.attributed_revenue * paged.revenue_share_bps / 10000.0)::bigint,
      'unitsSold', paged.units_sold,
      'salesCount', paged.sales_count,
      'productCount', paged.product_count,
      'products', paged.products,
      'firstSaleAt', paged.first_sale_at,
      'lastSaleAt', paged.last_sale_at
    ) end as earning
  from counted left join paged on true;
$$;

revoke all on function private.list_inventory_revenue_share_earnings(
  uuid, timestamptz, timestamptz, uuid, integer, integer
) from public, anon, authenticated;
grant execute on function private.list_inventory_revenue_share_earnings(
  uuid, timestamptz, timestamptz, uuid, integer, integer
) to service_role;

-- Keep the established analytics implementation intact while replacing its
-- one checkout-line revenue expression. Fail loudly if the prior canonical
-- definition changes so a future migration cannot silently restore legacy
-- bundle attribution.
do $$
declare
  analytics_definition text;
  recognized_definition text;
begin
  analytics_definition := pg_get_functiondef(
    'private.get_inventory_sales_analytics(uuid,integer,text)'::regprocedure
  );
  recognized_definition := replace(
    analytics_definition,
    'coalesce(line.subtotal_amount, 0)::numeric',
    'coalesce(line.recognized_revenue_amount, 0)::numeric'
  );
  if recognized_definition = analytics_definition then
    raise exception 'INVENTORY_ANALYTICS_REVENUE_EXPRESSION_NOT_FOUND';
  end if;
  execute recognized_definition;
end;
$$;
