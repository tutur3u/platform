create or replace function private.get_inventory_dashboard_snapshot(
  p_ws_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with counts as (
    select
      (
        select count(*)::integer
        from public.workspace_products product
        where product.ws_id = p_ws_id
          and coalesce(product.archived, false) = false
      ) as products_count,
      (
        select count(*)::integer
        from private.inventory_products stock
        join public.workspace_products product
          on product.id = stock.product_id
         and product.ws_id = p_ws_id
         and coalesce(product.archived, false) = false
      ) as stock_rows_count,
      (
        select count(*)::integer
        from private.get_inventory_low_stock_products(p_ws_id)
      ) as low_stock_count,
      (
        select count(*)::integer
        from public.product_categories category
        where category.ws_id = p_ws_id
      ) as categories_count,
      (
        select count(*)::integer
        from private.inventory_owners owner
        where owner.ws_id = p_ws_id
      ) as owners_count,
      (
        select count(*)::integer
        from private.inventory_manufacturers manufacturer
        where manufacturer.ws_id = p_ws_id
      ) as manufacturers_count,
      (
        select count(*)::integer
        from private.inventory_units unit
        where unit.ws_id = p_ws_id
      ) as units_count,
      (
        select count(*)::integer
        from private.inventory_warehouses warehouse
        where warehouse.ws_id = p_ws_id
      ) as warehouses_count,
      (
        select count(*)::integer
        from private.inventory_suppliers supplier
        where supplier.ws_id = p_ws_id
      ) as suppliers_count,
      (
        select count(*)::integer
        from private.inventory_batches batch
        join private.inventory_warehouses warehouse
          on warehouse.id = batch.warehouse_id
         and warehouse.ws_id = p_ws_id
      ) as batches_count,
      (
        select count(*)::integer
        from private.inventory_storefronts storefront
        where storefront.ws_id = p_ws_id
          and storefront.status <> 'archived'
      ) as storefronts_count,
      (
        select count(*)::integer
        from private.inventory_storefronts storefront
        where storefront.ws_id = p_ws_id
          and storefront.status = 'published'
      ) as published_storefronts_count,
      (
        select count(*)::integer
        from private.inventory_storefront_listings listing
        where listing.ws_id = p_ws_id
          and listing.status <> 'archived'
      ) as listings_count,
      (
        select count(*)::integer
        from private.inventory_storefront_listings listing
        where listing.ws_id = p_ws_id
          and listing.status = 'published'
      ) as published_listings_count,
      (
        select count(*)::integer
        from private.inventory_bundles bundle
        where bundle.ws_id = p_ws_id
          and bundle.status <> 'archived'
      ) as bundles_count,
      (
        select count(*)::integer
        from private.inventory_bundles bundle
        where bundle.ws_id = p_ws_id
          and bundle.status = 'active'
      ) as active_bundles_count,
      (
        select count(*)::integer
        from private.inventory_checkout_sessions checkout
        where checkout.ws_id = p_ws_id
      ) as checkouts_count,
      (
        select count(*)::integer
        from private.inventory_checkout_sessions checkout
        where checkout.ws_id = p_ws_id
          and checkout.status = 'reserved'
      ) as reserved_checkouts_count,
      (
        select count(*)::integer
        from private.inventory_checkout_sessions checkout
        where checkout.ws_id = p_ws_id
          and checkout.status = 'reserved'
          and checkout.expires_at < now()
      ) as stale_checkouts_count,
      (
        select count(*)::integer
        from public.finance_invoices invoice
        where invoice.ws_id = p_ws_id
          and exists (
            select 1
            from public.finance_invoice_products line
            where line.invoice_id = invoice.id
          )
      ) as sales_count,
      (
        select count(*)::integer
        from private.inventory_cost_profiles profile
        where profile.ws_id = p_ws_id
          and profile.status <> 'archived'
      ) as costing_profiles_count,
      (
        select count(*)::integer
        from private.inventory_polar_integrations integration
        where integration.ws_id = p_ws_id
          and integration.status = 'ready'
      ) as polar_ready_count,
      (
        select count(*)::integer
        from private.inventory_storefronts storefront
        where storefront.ws_id = p_ws_id
          and storefront.checkout_mode = 'simulated'
          and storefront.status <> 'archived'
      ) as simulated_checkout_storefronts_count
  ),
  sales_lines as (
    select
      invoice.created_at::date as sale_day,
      coalesce(line.amount, 0) * coalesce(line.price, 0) as revenue,
      coalesce(line.amount, 0) as quantity,
      coalesce(nullif(line.owner_name, ''), 'Unassigned') as owner_name,
      coalesce(category.name, 'Uncategorized') as category_name
    from public.finance_invoice_products line
    join public.finance_invoices invoice
      on invoice.id = line.invoice_id
     and invoice.ws_id = p_ws_id
    left join public.workspace_products product
      on product.id = line.product_id
    left join public.product_categories category
      on category.id = product.category_id
  ),
  revenue_trend as (
    select
      day::date as sale_day,
      coalesce(sum(sales_lines.revenue), 0) as revenue,
      coalesce(sum(sales_lines.quantity), 0) as quantity
    from generate_series(
      (current_date - interval '13 days')::date,
      current_date,
      interval '1 day'
    ) day
    left join sales_lines
      on sales_lines.sale_day = day::date
    group by day::date
    order by day::date asc
  ),
  category_mix as (
    select
      category_name,
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(quantity), 0) as quantity
    from sales_lines
    group by category_name
  ),
  owner_mix as (
    select
      owner_name,
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(quantity), 0) as quantity
    from sales_lines
    group by owner_name
  ),
  costing_scenarios as (
    select
      profile.id as profile_id,
      profile.name as profile_name,
      scenario.id as scenario_id,
      scenario.name as scenario_name,
      profile.currency,
      profile.target_retail_price,
      scenario.batch_size,
      private.inventory_cost_scenario_metrics(
        profile.target_retail_price,
        scenario.batch_size,
        scenario.manufacturing_cost_per_unit,
        scenario.art_commission_cost,
        scenario.shipping_cost,
        scenario.tariff_cost,
        scenario.packaging_cost_per_unit,
        scenario.other_cost_per_unit
      ) as metrics
    from private.inventory_cost_profiles profile
    join private.inventory_cost_scenarios scenario
      on scenario.profile_id = profile.id
     and scenario.ws_id = p_ws_id
    where profile.ws_id = p_ws_id
      and profile.status <> 'archived'
  ),
  costing_summary as (
    select
      count(distinct profile_id)::integer as profiles_count,
      count(*)::integer as scenarios_count,
      round(
        coalesce(avg((metrics ->> 'grossMarginPercentage')::numeric), 0),
        2
      ) as average_margin_percentage,
      min((metrics ->> 'breakEvenQuantity')::integer)
        filter (where metrics ->> 'breakEvenQuantity' is not null)
        as lowest_break_even_quantity,
      (
        select jsonb_build_object(
          'profileId', profile_id,
          'profileName', profile_name,
          'scenarioId', scenario_id,
          'scenarioName', scenario_name,
          'grossMarginPercentage',
            (metrics ->> 'grossMarginPercentage')::numeric,
          'breakEvenQuantity',
            nullif(metrics ->> 'breakEvenQuantity', '')::integer
        )
        from costing_scenarios
        order by (metrics ->> 'grossMarginPercentage')::numeric desc
        limit 1
      ) as best_scenario,
      (
        select jsonb_build_object(
          'profileId', profile_id,
          'profileName', profile_name,
          'scenarioId', scenario_id,
          'scenarioName', scenario_name,
          'grossMarginPercentage',
            (metrics ->> 'grossMarginPercentage')::numeric,
          'breakEvenQuantity',
            nullif(metrics ->> 'breakEvenQuantity', '')::integer
        )
        from costing_scenarios
        order by (metrics ->> 'grossMarginPercentage')::numeric asc
        limit 1
      ) as weakest_scenario
    from costing_scenarios
  ),
  storefront_summary as (
    select
      count(*) filter (where storefront.status = 'published')::integer
        as published_count,
      count(*) filter (
        where not exists (
          select 1
          from private.inventory_storefront_listings listing
          where listing.storefront_id = storefront.id
            and listing.status = 'published'
        )
      )::integer as without_published_listings_count,
      count(*) filter (
        where storefront.hero_image_url is null
          or nullif(storefront.accent_color, '') is null
      )::integer as theme_gaps_count,
      count(*) filter (where storefront.checkout_mode = 'polar')::integer
        as polar_checkout_count,
      count(*) filter (where storefront.checkout_mode = 'simulated')::integer
        as simulated_checkout_count,
      count(*) filter (where storefront.checkout_mode = 'disabled')::integer
        as disabled_checkout_count
    from private.inventory_storefronts storefront
    where storefront.ws_id = p_ws_id
      and storefront.status <> 'archived'
  ),
  low_stock_risks as (
    select jsonb_build_object(
      'kind', 'low_stock',
      'severity', 'high',
      'view', 'stock',
      'entityId', product ->> 'product_id',
      'label', product ->> 'product_name',
      'detail',
        concat(
          coalesce(product ->> 'warehouse_name', 'Unassigned'),
          ' · ',
          coalesce(product ->> 'amount', '0'),
          '/',
          coalesce(product ->> 'min_amount', '0'),
          ' ',
          coalesce(product ->> 'unit_name', '')
        ),
      'metric', coalesce((product ->> 'amount')::numeric, 0)
    ) as item
    from private.get_inventory_low_stock_products(p_ws_id)
    order by coalesce((product ->> 'amount')::numeric, 0) asc,
      product ->> 'product_name' asc
    limit 6
  ),
  stale_checkout_risks as (
    select jsonb_build_object(
      'kind', 'stale_checkout',
      'severity', 'medium',
      'view', 'commerce',
      'entityId', checkout.id,
      'label', coalesce(nullif(checkout.customer_name, ''), checkout.public_token),
      'detail', checkout.expires_at::text,
      'metric', checkout.total_amount
    ) as item
    from private.inventory_checkout_sessions checkout
    where checkout.ws_id = p_ws_id
      and checkout.status = 'reserved'
      and checkout.expires_at < now()
    order by checkout.expires_at asc
    limit 4
  ),
  storefront_risks as (
    select jsonb_build_object(
      'kind', 'storefront_ready',
      'severity', 'medium',
      'view', 'storefront',
      'entityId', storefront.id,
      'label', storefront.name,
      'detail',
        case
          when storefront.status <> 'published' then 'not_published'
          when not exists (
            select 1
            from private.inventory_storefront_listings listing
            where listing.storefront_id = storefront.id
              and listing.status = 'published'
          ) then 'no_published_listings'
          when storefront.checkout_mode = 'polar'
            and not exists (
              select 1
              from private.inventory_polar_integrations integration
              where integration.ws_id = p_ws_id
                and integration.status = 'ready'
            ) then 'polar_not_ready'
          else 'ready'
        end,
      'metric', coalesce(listing_count.count, 0)
    ) as item
    from private.inventory_storefronts storefront
    left join lateral (
      select count(*)::integer as count
      from private.inventory_storefront_listings listing
      where listing.storefront_id = storefront.id
        and listing.status = 'published'
    ) listing_count on true
    where storefront.ws_id = p_ws_id
      and storefront.status <> 'archived'
      and (
        storefront.status <> 'published'
        or coalesce(listing_count.count, 0) = 0
        or (
          storefront.checkout_mode = 'polar'
          and not exists (
            select 1
            from private.inventory_polar_integrations integration
            where integration.ws_id = p_ws_id
              and integration.status = 'ready'
          )
        )
      )
    order by storefront.created_at desc nulls last
    limit 4
  ),
  risk_items as (
    select item from low_stock_risks
    union all
    select item from stale_checkout_risks
    union all
    select item from storefront_risks
  ),
  action_items as (
    select jsonb_build_object(
      'kind', 'setup_resources',
      'view', 'setup',
      'priority', 1
    ) as item
    from counts
    where categories_count = 0
      or units_count = 0
      or warehouses_count = 0
      or suppliers_count = 0
    union all
    select jsonb_build_object(
      'kind', 'create_product',
      'view', 'catalog',
      'priority', 2
    )
    from counts
    where products_count = 0
    union all
    select jsonb_build_object(
      'kind', 'create_costing',
      'view', 'costing',
      'priority', 3
    )
    from counts
    where costing_profiles_count = 0
    union all
    select jsonb_build_object(
      'kind', 'publish_storefront',
      'view', 'storefront',
      'priority', 4
    )
    from counts
    where published_storefronts_count = 0
      or published_listings_count = 0
    union all
    select jsonb_build_object(
      'kind', 'resolve_low_stock',
      'view', 'stock',
      'priority', 5
    )
    from counts
    where low_stock_count > 0
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'products', counts.products_count,
      'stockRows', counts.stock_rows_count,
      'lowStock', counts.low_stock_count,
      'categories', counts.categories_count,
      'owners', counts.owners_count,
      'manufacturers', counts.manufacturers_count,
      'units', counts.units_count,
      'warehouses', counts.warehouses_count,
      'suppliers', counts.suppliers_count,
      'batches', counts.batches_count,
      'storefronts', counts.storefronts_count,
      'publishedStorefronts', counts.published_storefronts_count,
      'listings', counts.listings_count,
      'publishedListings', counts.published_listings_count,
      'bundles', counts.bundles_count,
      'activeBundles', counts.active_bundles_count,
      'checkouts', counts.checkouts_count,
      'reservedCheckouts', counts.reserved_checkouts_count,
      'staleCheckouts', counts.stale_checkouts_count,
      'sales', counts.sales_count,
      'costingProfiles', counts.costing_profiles_count,
      'polarReady', counts.polar_ready_count,
      'simulatedCheckoutStorefronts',
        counts.simulated_checkout_storefronts_count
    ),
    'readiness', jsonb_build_array(
      jsonb_build_object(
        'key', 'setup',
        'view', 'setup',
        'score',
          round((
            (
              case when counts.categories_count > 0 then 1 else 0 end
              + case when counts.owners_count > 0 then 1 else 0 end
              + case when counts.manufacturers_count > 0 then 1 else 0 end
              + case when counts.units_count > 0 then 1 else 0 end
              + case when counts.warehouses_count > 0 then 1 else 0 end
              + case when counts.suppliers_count > 0 then 1 else 0 end
            )::numeric / 6
          ) * 100),
        'completed',
          (
            case when counts.categories_count > 0 then 1 else 0 end
            + case when counts.owners_count > 0 then 1 else 0 end
            + case when counts.manufacturers_count > 0 then 1 else 0 end
            + case when counts.units_count > 0 then 1 else 0 end
            + case when counts.warehouses_count > 0 then 1 else 0 end
            + case when counts.suppliers_count > 0 then 1 else 0 end
          ),
        'total', 6
      ),
      jsonb_build_object(
        'key', 'products',
        'view', 'catalog',
        'score',
          round((
            (
              case when counts.products_count > 0 then 1 else 0 end
              + case when counts.stock_rows_count > 0 then 1 else 0 end
              + case when counts.low_stock_count = 0
                    and counts.products_count > 0 then 1 else 0 end
            )::numeric / 3
          ) * 100),
        'completed',
          (
            case when counts.products_count > 0 then 1 else 0 end
            + case when counts.stock_rows_count > 0 then 1 else 0 end
            + case when counts.low_stock_count = 0
                  and counts.products_count > 0 then 1 else 0 end
          ),
        'total', 3
      ),
      jsonb_build_object(
        'key', 'costing',
        'view', 'costing',
        'score',
          case when counts.costing_profiles_count > 0 then 100 else 0 end,
        'completed',
          case when counts.costing_profiles_count > 0 then 1 else 0 end,
        'total', 1
      ),
      jsonb_build_object(
        'key', 'storefront',
        'view', 'storefront',
        'score',
          round((
            (
              case when counts.storefronts_count > 0 then 1 else 0 end
              + case when counts.published_storefronts_count > 0 then 1 else 0 end
              + case when counts.published_listings_count > 0 then 1 else 0 end
            )::numeric / 3
          ) * 100),
        'completed',
          (
            case when counts.storefronts_count > 0 then 1 else 0 end
            + case when counts.published_storefronts_count > 0 then 1 else 0 end
            + case when counts.published_listings_count > 0 then 1 else 0 end
          ),
        'total', 3
      ),
      jsonb_build_object(
        'key', 'checkout',
        'view', 'commerce',
        'score',
          case
            when counts.polar_ready_count > 0
              or counts.simulated_checkout_storefronts_count > 0 then 100
            else 0
          end,
        'completed',
          case
            when counts.polar_ready_count > 0
              or counts.simulated_checkout_storefronts_count > 0 then 1
            else 0
          end,
        'total', 1
      )
    ),
    'risks',
      coalesce((
        select jsonb_agg(item order by (item ->> 'severity') asc)
        from risk_items
      ), '[]'::jsonb),
    'actions',
      coalesce((
        select jsonb_agg(item order by (item ->> 'priority')::integer asc)
        from action_items
      ), '[]'::jsonb),
    'analytics', jsonb_build_object(
      'revenueTrend',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'date', sale_day::text,
              'revenue', revenue,
              'quantity', quantity
            )
            order by sale_day asc
          )
          from revenue_trend
        ), '[]'::jsonb),
      'categoryMix',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'label', category_name,
              'revenue', revenue,
              'quantity', quantity
            )
            order by revenue desc, category_name asc
          )
          from (
            select *
            from category_mix
            order by revenue desc, category_name asc
            limit 8
          ) bounded_category_mix
        ), '[]'::jsonb),
      'ownerMix',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'label', owner_name,
              'revenue', revenue,
              'quantity', quantity
            )
            order by revenue desc, owner_name asc
          )
          from (
            select *
            from owner_mix
            order by revenue desc, owner_name asc
            limit 8
          ) bounded_owner_mix
        ), '[]'::jsonb)
    ),
    'costing', jsonb_build_object(
      'profilesCount', coalesce(costing_summary.profiles_count, 0),
      'scenariosCount', coalesce(costing_summary.scenarios_count, 0),
      'averageMarginPercentage',
        coalesce(costing_summary.average_margin_percentage, 0),
      'lowestBreakEvenQuantity',
        costing_summary.lowest_break_even_quantity,
      'bestScenario', costing_summary.best_scenario,
      'weakestScenario', costing_summary.weakest_scenario
    ),
    'storefrontHealth', jsonb_build_object(
      'published', coalesce(storefront_summary.published_count, 0),
      'withoutPublishedListings',
        coalesce(storefront_summary.without_published_listings_count, 0),
      'themeGaps', coalesce(storefront_summary.theme_gaps_count, 0),
      'polarCheckout', coalesce(storefront_summary.polar_checkout_count, 0),
      'simulatedCheckout',
        coalesce(storefront_summary.simulated_checkout_count, 0),
      'disabledCheckout', coalesce(storefront_summary.disabled_checkout_count, 0)
    )
  )
  from counts
  left join costing_summary on true
  left join storefront_summary on true;
$$;

revoke all on function private.get_inventory_dashboard_snapshot(uuid)
from public, anon, authenticated;

grant execute on function private.get_inventory_dashboard_snapshot(uuid)
to service_role;
