create or replace function private.get_inventory_catalog_products(
  p_ws_id uuid,
  p_include_stock boolean default false,
  p_product_id uuid default null,
  p_category_id uuid default null,
  p_manufacturer_id uuid default null,
  p_search text default null,
  p_status text default 'active',
  p_sort_by text default 'created_at',
  p_sort_order text default 'desc',
  p_offset integer default 0,
  p_limit integer default 10
)
returns table (
  total_count integer,
  product jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      product.*,
      manufacturer.name as manufacturer_sort_name
    from public.workspace_products product
    left join private.inventory_manufacturers manufacturer
      on manufacturer.id = product.manufacturer_id
     and manufacturer.ws_id = p_ws_id
    where product.ws_id = p_ws_id
      and (p_product_id is null or product.id = p_product_id)
      and (p_category_id is null or product.category_id = p_category_id)
      and (p_manufacturer_id is null or product.manufacturer_id = p_manufacturer_id)
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or product.name ilike '%' || p_search || '%'
      )
      and (
        coalesce(p_status, 'active') = 'all'
        or (coalesce(p_status, 'active') = 'active' and product.archived = false)
        or (coalesce(p_status, 'active') = 'archived' and product.archived = true)
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by
      case
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'created_at'
        then created_at
      end asc nulls last,
      case
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'created_at'
        then created_at
      end desc nulls last,
      case
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'manufacturer'
        then manufacturer_sort_name
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'id'
        then id::text
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'name'
        then name
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'description'
        then description
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'usage'
        then usage
        when coalesce(p_sort_order, 'desc') = 'asc'
          and coalesce(p_sort_by, 'created_at') = 'category_id'
        then category_id::text
      end asc nulls last,
      case
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'manufacturer'
        then manufacturer_sort_name
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'id'
        then id::text
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'name'
        then name
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'description'
        then description
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'usage'
        then usage
        when coalesce(p_sort_order, 'desc') <> 'asc'
          and coalesce(p_sort_by, 'created_at') = 'category_id'
        then category_id::text
      end desc nulls last,
      created_at desc,
      id asc
    limit greatest(1, least(coalesce(p_limit, 10), 10000))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    product_json.product
  from counted
  left join paged product on true
  left join public.product_categories category
    on category.id = product.category_id
  left join private.inventory_manufacturers manufacturer
    on manufacturer.id = product.manufacturer_id
   and manufacturer.ws_id = p_ws_id
  left join private.inventory_owners owner
    on owner.id = product.owner_id
   and owner.ws_id = p_ws_id
  left join public.transaction_categories finance_category
    on finance_category.id = product.finance_category_id
   and finance_category.ws_id = p_ws_id
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'amount', stock.amount,
          'min_amount', stock.min_amount,
          'price', stock.price,
          'warehouse_id', stock.warehouse_id,
          'unit_id', stock.unit_id,
          'revenue_share_partner_id', stock.revenue_share_partner_id,
          'revenue_share_bps', stock.revenue_share_bps,
          'created_at', stock.created_at,
          'inventory_units',
            case
              when unit.id is null then null
              else jsonb_build_object('id', unit.id, 'name', unit.name)
            end,
          'inventory_warehouses',
            case
              when warehouse.id is null then null
              else jsonb_build_object('id', warehouse.id, 'name', warehouse.name)
            end,
          'revenue_share_partner',
            case
              when stock_partner.id is null then null
              else jsonb_build_object(
                'id', stock_partner.id,
                'name', stock_partner.name,
                'avatar_url', stock_partner.avatar_url,
                'linked_workspace_user_id', stock_partner.linked_workspace_user_id
              )
            end
        )
        order by stock.warehouse_id, stock.unit_id, stock.created_at
      ),
      '[]'::jsonb
    ) as items
    from private.inventory_products stock
    left join private.inventory_units unit
      on unit.id = stock.unit_id
     and unit.ws_id = p_ws_id
    left join private.inventory_warehouses warehouse
      on warehouse.id = stock.warehouse_id
     and warehouse.ws_id = p_ws_id
    left join private.inventory_owners stock_partner
      on stock_partner.id = stock.revenue_share_partner_id
     and stock_partner.ws_id = p_ws_id
    where stock.product_id = product.id
  ) stock_items on p_include_stock and product.id is not null
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'amount', stock_change.amount,
          'created_at', stock_change.created_at,
          'warehouse_id', stock_change.warehouse_id,
          'beneficiary',
            case
              when beneficiary.id is null then null
              else jsonb_build_object(
                'full_name', beneficiary.full_name,
                'email', beneficiary.email
              )
            end,
          'creator',
            case
              when creator.id is null then null
              else jsonb_build_object(
                'full_name', creator.full_name,
                'email', creator.email
              )
            end,
          'warehouse',
            case
              when stock_change_warehouse.id is null then null
              else jsonb_build_object(
                'id', stock_change_warehouse.id,
                'name', stock_change_warehouse.name
              )
            end
        )
        order by stock_change.created_at desc
      ),
      '[]'::jsonb
    ) as items
    from public.product_stock_changes stock_change
    left join public.workspace_users beneficiary
      on beneficiary.id = stock_change.beneficiary_id
     and beneficiary.ws_id = p_ws_id
    left join public.workspace_users creator
      on creator.id = stock_change.creator_id
     and creator.ws_id = p_ws_id
    left join private.inventory_warehouses stock_change_warehouse
      on stock_change_warehouse.id = stock_change.warehouse_id
     and stock_change_warehouse.ws_id = p_ws_id
    where stock_change.product_id = product.id
  ) stock_changes on p_include_stock and product.id is not null
  left join lateral (
    select
      case
        when product.id is null then null
        else jsonb_build_object(
          'id', product.id,
          'name', product.name,
          'manufacturer_id', product.manufacturer_id,
          'description', product.description,
          'usage', product.usage,
          'category_id', product.category_id,
          'owner_id', product.owner_id,
          'finance_category_id', product.finance_category_id,
          'created_at', product.created_at,
          'ws_id', product.ws_id,
          'archived', product.archived,
          'product_categories',
            case
              when category.id is null then null
              else jsonb_build_object('name', category.name)
            end,
          'inventory_manufacturers',
            case
              when manufacturer.id is null then null
              else jsonb_build_object('id', manufacturer.id, 'name', manufacturer.name)
            end,
          'inventory_owners',
            case
              when owner.id is null then null
              else jsonb_build_object(
                'id', owner.id,
                'name', owner.name,
                'avatar_url', owner.avatar_url,
                'linked_workspace_user_id', owner.linked_workspace_user_id
              )
            end,
          'transaction_categories',
            case
              when finance_category.id is null then null
              else jsonb_build_object(
                'id', finance_category.id,
                'name', finance_category.name,
                'color', finance_category.color,
                'icon', finance_category.icon
              )
            end,
          'inventory_products',
            case
              when p_include_stock then coalesce(stock_items.items, '[]'::jsonb)
              else null
            end,
          'product_stock_changes',
            case
              when p_include_stock then coalesce(stock_changes.items, '[]'::jsonb)
              else null
            end
        )
      end as product
  ) product_json on true;
$$;

create or replace function private.list_inventory_revenue_share_earnings(
  p_ws_id uuid,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_partner_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  total_count integer,
  earning jsonb
)
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
      line.subtotal_amount::numeric as attributed_revenue,
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
      on product.id = line.product_id
     and product.ws_id = p_ws_id
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
      on product.id = line.product_id
     and product.ws_id = p_ws_id
    where stock.revenue_share_partner_id is not null
      and stock.revenue_share_bps > 0
      and not exists (
        select 1
        from private.inventory_checkout_sessions checkout
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
      on owner.id = source_lines.partner_id
     and owner.ws_id = p_ws_id
    group by
      source_lines.partner_id,
      owner.name,
      owner.avatar_url,
      source_lines.revenue_share_bps,
      source_lines.currency
  ),
  counted as (
    select count(*)::integer as total_count
    from grouped
  ),
  paged as (
    select *
    from grouped
    order by (attributed_revenue * revenue_share_bps / 10000.0) desc,
      partner_name asc
    limit greatest(1, least(coalesce(p_limit, 50), 250))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    case
      when paged.partner_id is null then null
      else jsonb_build_object(
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
      )
    end as earning
  from counted
  left join paged on true;
$$;

revoke all on function private.get_inventory_catalog_products(
  uuid, boolean, uuid, uuid, uuid, text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function private.get_inventory_catalog_products(
  uuid, boolean, uuid, uuid, uuid, text, text, text, text, integer, integer
) to service_role;

revoke all on function private.list_inventory_revenue_share_earnings(
  uuid, timestamptz, timestamptz, uuid, integer, integer
) from public, anon, authenticated;
grant execute on function private.list_inventory_revenue_share_earnings(
  uuid, timestamptz, timestamptz, uuid, integer, integer
) to service_role;
