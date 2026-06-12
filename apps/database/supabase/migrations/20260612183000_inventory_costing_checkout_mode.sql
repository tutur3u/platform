alter table private.inventory_storefronts
  add column if not exists checkout_mode text not null default 'polar';

update private.inventory_storefronts
set checkout_mode = coalesce(checkout_mode, 'polar');

alter table private.inventory_storefronts
  alter column checkout_mode set not null,
  alter column checkout_mode set default 'polar';

alter table private.inventory_storefronts
  drop constraint if exists inventory_storefronts_checkout_mode_check;

alter table private.inventory_storefronts
  add constraint inventory_storefronts_checkout_mode_check
  check (checkout_mode in ('polar', 'simulated', 'disabled'));

create table if not exists private.inventory_cost_profiles (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid references public.workspace_products(id) on delete set null,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null,
  status text not null default 'active' check (
    status in ('active', 'archived', 'draft')
  ),
  currency text not null default 'USD' check (length(currency) = 3),
  target_retail_price numeric(12, 2) not null default 0 check (
    target_retail_price >= 0
  ),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists private.inventory_cost_scenarios (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references private.inventory_cost_profiles(id)
    on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  batch_size integer not null check (batch_size > 0),
  manufacturing_cost_per_unit numeric(12, 4) not null default 0 check (
    manufacturing_cost_per_unit >= 0
  ),
  art_commission_cost numeric(12, 2) not null default 0 check (
    art_commission_cost >= 0
  ),
  shipping_cost numeric(12, 2) not null default 0 check (
    shipping_cost >= 0
  ),
  tariff_cost numeric(12, 2) not null default 0 check (
    tariff_cost >= 0
  ),
  packaging_cost_per_unit numeric(12, 4) not null default 0 check (
    packaging_cost_per_unit >= 0
  ),
  other_cost_per_unit numeric(12, 4) not null default 0 check (
    other_cost_per_unit >= 0
  ),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists private.inventory_cost_profit_shares (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references private.inventory_cost_profiles(id)
    on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_label text not null,
  share_percentage numeric(7, 4) not null default 0 check (
    share_percentage >= 0
    and share_percentage <= 100
  ),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists inventory_cost_profiles_ws_status_idx
  on private.inventory_cost_profiles (ws_id, status);

create index if not exists inventory_cost_profiles_ws_product_idx
  on private.inventory_cost_profiles (ws_id, product_id);

create index if not exists inventory_cost_profiles_ws_category_idx
  on private.inventory_cost_profiles (ws_id, category_id);

create index if not exists inventory_cost_scenarios_profile_sort_idx
  on private.inventory_cost_scenarios (profile_id, sort_order);

create index if not exists inventory_cost_profit_shares_profile_sort_idx
  on private.inventory_cost_profit_shares (profile_id, sort_order);

alter table private.inventory_cost_profiles enable row level security;
alter table private.inventory_cost_scenarios enable row level security;
alter table private.inventory_cost_profit_shares enable row level security;

revoke all on table private.inventory_cost_profiles
  from public, anon, authenticated;
revoke all on table private.inventory_cost_scenarios
  from public, anon, authenticated;
revoke all on table private.inventory_cost_profit_shares
  from public, anon, authenticated;

grant all on table private.inventory_cost_profiles to service_role;
grant all on table private.inventory_cost_scenarios to service_role;
grant all on table private.inventory_cost_profit_shares to service_role;

drop trigger if exists inventory_cost_profiles_updated_at
  on private.inventory_cost_profiles;
create trigger inventory_cost_profiles_updated_at
  before update
  on private.inventory_cost_profiles
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists inventory_cost_scenarios_updated_at
  on private.inventory_cost_scenarios;
create trigger inventory_cost_scenarios_updated_at
  before update
  on private.inventory_cost_scenarios
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists inventory_cost_profit_shares_updated_at
  on private.inventory_cost_profit_shares;
create trigger inventory_cost_profit_shares_updated_at
  before update
  on private.inventory_cost_profit_shares
  for each row
  execute function public.update_updated_at_column();

create or replace function private.inventory_cost_scenario_metrics(
  p_target_retail_price numeric,
  p_batch_size integer,
  p_manufacturing_cost_per_unit numeric,
  p_art_commission_cost numeric,
  p_shipping_cost numeric,
  p_tariff_cost numeric,
  p_packaging_cost_per_unit numeric,
  p_other_cost_per_unit numeric
) returns jsonb
language sql
immutable
set search_path = private, public, pg_temp
as $$
  with normalized as (
    select
      greatest(coalesce(p_target_retail_price, 0), 0) as target_retail_price,
      greatest(coalesce(p_batch_size, 1), 1) as batch_size,
      greatest(coalesce(p_manufacturing_cost_per_unit, 0), 0)
        as manufacturing_cost_per_unit,
      greatest(coalesce(p_art_commission_cost, 0), 0) as art_commission_cost,
      greatest(coalesce(p_shipping_cost, 0), 0) as shipping_cost,
      greatest(coalesce(p_tariff_cost, 0), 0) as tariff_cost,
      greatest(coalesce(p_packaging_cost_per_unit, 0), 0)
        as packaging_cost_per_unit,
      greatest(coalesce(p_other_cost_per_unit, 0), 0) as other_cost_per_unit
  ),
  calculated as (
    select
      target_retail_price,
      batch_size,
      (
        manufacturing_cost_per_unit
        + packaging_cost_per_unit
        + other_cost_per_unit
        + ((art_commission_cost + shipping_cost + tariff_cost) / batch_size)
      ) as total_cost_per_unit,
      art_commission_cost + shipping_cost + tariff_cost as fixed_costs
    from normalized
  ),
  metrics as (
    select
      total_cost_per_unit,
      target_retail_price - total_cost_per_unit as gross_profit_per_unit,
      case
        when target_retail_price > 0
          then ((target_retail_price - total_cost_per_unit) / target_retail_price) * 100
        else 0
      end as gross_margin_percentage,
      case
        when target_retail_price - total_cost_per_unit > 0
          then ceil(fixed_costs / (target_retail_price - total_cost_per_unit))::integer
        else null
      end as break_even_quantity,
      total_cost_per_unit * batch_size as batch_cost
    from calculated
  )
  select jsonb_build_object(
    'batchCost', round(batch_cost, 2),
    'breakEvenQuantity', break_even_quantity,
    'grossMarginPercentage', round(gross_margin_percentage, 2),
    'grossProfitPerUnit', round(gross_profit_per_unit, 2),
    'totalCostPerUnit', round(total_cost_per_unit, 2)
  )
  from metrics;
$$;

create or replace function private.inventory_cost_profile_payload(
  p_profile_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with profile as (
    select
      p.id,
      p.ws_id,
      p.product_id,
      product.name as product_name,
      p.category_id,
      category.name as category_name,
      p.name,
      p.status,
      p.currency,
      p.target_retail_price,
      p.notes,
      p.created_at,
      p.updated_at
    from private.inventory_cost_profiles p
    left join public.workspace_products product
      on product.id = p.product_id
     and product.ws_id = p.ws_id
    left join public.product_categories category
      on category.id = p.category_id
     and category.ws_id = p.ws_id
    where p.id = p_profile_id
    limit 1
  )
  select jsonb_build_object(
    'id', profile.id,
    'wsId', profile.ws_id,
    'productId', profile.product_id,
    'productName', profile.product_name,
    'categoryId', profile.category_id,
    'categoryName', profile.category_name,
    'name', profile.name,
    'status', profile.status,
    'currency', profile.currency,
    'targetRetailPrice', profile.target_retail_price,
    'notes', profile.notes,
    'scenarios', coalesce(scenarios.items, '[]'::jsonb),
    'profitShares', coalesce(profit_shares.items, '[]'::jsonb),
    'createdAt', profile.created_at::text,
    'updatedAt', profile.updated_at::text
  )
  from profile
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', scenario.id,
        'profileId', scenario.profile_id,
        'wsId', scenario.ws_id,
        'name', scenario.name,
        'batchSize', scenario.batch_size,
        'manufacturingCostPerUnit', scenario.manufacturing_cost_per_unit,
        'artCommissionCost', scenario.art_commission_cost,
        'shippingCost', scenario.shipping_cost,
        'tariffCost', scenario.tariff_cost,
        'packagingCostPerUnit', scenario.packaging_cost_per_unit,
        'otherCostPerUnit', scenario.other_cost_per_unit,
        'sortOrder', scenario.sort_order,
        'metrics',
          private.inventory_cost_scenario_metrics(
            profile.target_retail_price,
            scenario.batch_size,
            scenario.manufacturing_cost_per_unit,
            scenario.art_commission_cost,
            scenario.shipping_cost,
            scenario.tariff_cost,
            scenario.packaging_cost_per_unit,
            scenario.other_cost_per_unit
          ),
        'createdAt', scenario.created_at::text,
        'updatedAt', scenario.updated_at::text
      )
      order by scenario.sort_order asc, scenario.batch_size asc
    ) as items
    from private.inventory_cost_scenarios scenario
    where scenario.profile_id = profile.id
      and scenario.ws_id = profile.ws_id
  ) scenarios on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', share.id,
        'profileId', share.profile_id,
        'wsId', share.ws_id,
        'recipientLabel', share.recipient_label,
        'sharePercentage', share.share_percentage,
        'sortOrder', share.sort_order,
        'createdAt', share.created_at::text,
        'updatedAt', share.updated_at::text
      )
      order by share.sort_order asc, share.recipient_label asc
    ) as items
    from private.inventory_cost_profit_shares share
    where share.profile_id = profile.id
      and share.ws_id = profile.ws_id
  ) profit_shares on true;
$$;

create or replace function private.list_inventory_cost_profiles(
  p_ws_id uuid,
  p_search text default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
) returns table (
  total_count integer,
  profile jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      p.id,
      p.created_at,
      p.name
    from private.inventory_cost_profiles p
    left join public.workspace_products product
      on product.id = p.product_id
     and product.ws_id = p.ws_id
    left join public.product_categories category
      on category.id = p.category_id
     and category.ws_id = p.ws_id
    where p.ws_id = p_ws_id
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or p.status = p_status
      )
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or p.name ilike '%' || p_search || '%'
        or product.name ilike '%' || p_search || '%'
        or category.name ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc nulls last, name asc
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    case
      when paged.id is null then null
      else private.inventory_cost_profile_payload(paged.id)
    end as profile
  from counted
  left join paged on true;
$$;

create or replace function private.get_inventory_cost_profile(
  p_ws_id uuid,
  p_profile_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select private.inventory_cost_profile_payload(profile.id)
  from private.inventory_cost_profiles profile
  where profile.ws_id = p_ws_id
    and profile.id = p_profile_id
  limit 1;
$$;

create or replace function private.get_inventory_costing_analytics(
  p_ws_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with scenario_metrics as (
    select
      profile.id as profile_id,
      profile.name as profile_name,
      profile.currency,
      profile.target_retail_price,
      scenario.id as scenario_id,
      scenario.name as scenario_name,
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
     and scenario.ws_id = profile.ws_id
    where profile.ws_id = p_ws_id
      and profile.status <> 'archived'
  ),
  summarized as (
    select
      (
        select count(*)::integer
        from private.inventory_cost_profiles profile
        where profile.ws_id = p_ws_id
          and profile.status <> 'archived'
      ) as profiles_count,
      count(*)::integer as scenarios_count,
      coalesce(
        round(avg((metrics ->> 'grossMarginPercentage')::numeric), 2),
        0
      ) as average_margin_percentage,
      min((metrics ->> 'breakEvenQuantity')::integer)
        filter (where metrics ->> 'breakEvenQuantity' is not null)
        as lowest_break_even_quantity
    from scenario_metrics
  )
  select jsonb_build_object(
    'profilesCount', coalesce(summarized.profiles_count, 0),
    'scenariosCount', coalesce(summarized.scenarios_count, 0),
    'averageMarginPercentage',
      coalesce(summarized.average_margin_percentage, 0),
    'lowestBreakEvenQuantity', summarized.lowest_break_even_quantity,
    'scenarios',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'profileId', scenario_metrics.profile_id,
              'profileName', scenario_metrics.profile_name,
              'scenarioId', scenario_metrics.scenario_id,
              'scenarioName', scenario_metrics.scenario_name,
              'currency', scenario_metrics.currency,
              'batchSize', scenario_metrics.batch_size,
              'targetRetailPrice', scenario_metrics.target_retail_price,
              'totalCostPerUnit',
                (scenario_metrics.metrics ->> 'totalCostPerUnit')::numeric,
              'grossProfitPerUnit',
                (scenario_metrics.metrics ->> 'grossProfitPerUnit')::numeric,
              'grossMarginPercentage',
                (scenario_metrics.metrics ->> 'grossMarginPercentage')::numeric,
              'breakEvenQuantity',
                (scenario_metrics.metrics ->> 'breakEvenQuantity')::integer,
              'batchCost', (scenario_metrics.metrics ->> 'batchCost')::numeric
            )
            order by scenario_metrics.profile_name asc,
              scenario_metrics.batch_size asc
          )
          from scenario_metrics
        ),
        '[]'::jsonb
      )
  )
  from summarized;
$$;

create or replace function private.list_inventory_storefronts(
  p_ws_id uuid,
  p_search text default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  total_count integer,
  storefront jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      storefront.id,
      storefront.ws_id,
      storefront.slug,
      storefront.name,
      storefront.description,
      storefront.status,
      storefront.visibility,
      storefront.hero_image_url,
      storefront.accent_color,
      storefront.currency,
      storefront.checkout_mode,
      storefront.theme_preset,
      storefront.layout_style,
      storefront.surface_style,
      storefront.corner_style,
      storefront.show_inventory_badges,
      storefront.created_at,
      storefront.updated_at,
      (
        select count(*)::integer
        from private.inventory_storefront_listings listing
        where listing.storefront_id = storefront.id
      ) as listings_count
    from private.inventory_storefronts storefront
    where storefront.ws_id = p_ws_id
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or storefront.status = p_status
      )
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or storefront.name ilike '%' || p_search || '%'
        or storefront.slug ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc nulls last, name asc
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    case
      when paged.id is null then null
      else jsonb_build_object(
        'id', paged.id,
        'wsId', paged.ws_id,
        'slug', paged.slug,
        'name', paged.name,
        'description', paged.description,
        'status', paged.status,
        'visibility', paged.visibility,
        'heroImageUrl', paged.hero_image_url,
        'accentColor', paged.accent_color,
        'currency', paged.currency,
        'checkoutMode', paged.checkout_mode,
        'themePreset', paged.theme_preset,
        'layoutStyle', paged.layout_style,
        'surfaceStyle', paged.surface_style,
        'cornerStyle', paged.corner_style,
        'showInventoryBadges', paged.show_inventory_badges,
        'listingsCount', paged.listings_count,
        'createdAt', paged.created_at::text,
        'updatedAt', paged.updated_at::text
      )
    end as storefront
  from counted
  left join paged on true;
$$;

create or replace function private.get_public_inventory_storefront(
  p_storefront_slug text,
  p_now timestamptz default now()
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with storefront as (
    select
      sf.id,
      sf.ws_id,
      sf.slug,
      sf.name,
      sf.description,
      sf.status,
      sf.visibility,
      sf.hero_image_url,
      sf.accent_color,
      sf.currency,
      sf.checkout_mode,
      sf.theme_preset,
      sf.layout_style,
      sf.surface_style,
      sf.corner_style,
      sf.show_inventory_badges,
      sf.created_at,
      sf.updated_at,
      (
        select count(*)::int
        from private.inventory_storefront_listings listing
        where listing.storefront_id = sf.id
          and listing.status = 'published'
      ) as listings_count
    from private.inventory_storefronts sf
    where sf.slug = p_storefront_slug
      and sf.status = 'published'
    limit 1
  )
  select jsonb_build_object(
    'storefront',
      jsonb_build_object(
        'id', storefront.id,
        'wsId', storefront.ws_id,
        'slug', storefront.slug,
        'name', storefront.name,
        'description', storefront.description,
        'status', storefront.status,
        'visibility', storefront.visibility,
        'heroImageUrl', storefront.hero_image_url,
        'accentColor', storefront.accent_color,
        'currency', storefront.currency,
        'checkoutMode', storefront.checkout_mode,
        'themePreset', storefront.theme_preset,
        'layoutStyle', storefront.layout_style,
        'surfaceStyle', storefront.surface_style,
        'cornerStyle', storefront.corner_style,
        'showInventoryBadges', storefront.show_inventory_badges,
        'listingsCount', storefront.listings_count,
        'createdAt', storefront.created_at::text,
        'updatedAt', storefront.updated_at::text
      ),
    'listings', coalesce(listings.items, '[]'::jsonb),
    'bundles', coalesce(bundles.items, '[]'::jsonb)
  )
  from storefront
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', listing.id,
        'storefrontId', listing.storefront_id,
        'wsId', listing.ws_id,
        'listingType', listing.listing_type,
        'productId', listing.product_id,
        'bundleId', listing.bundle_id,
        'unitId', listing.unit_id,
        'warehouseId', listing.warehouse_id,
        'title', listing.title,
        'description', listing.description,
        'imageUrl', listing.image_url,
        'price', listing.price,
        'compareAtPrice', listing.compare_at_price,
        'status', listing.status,
        'sortOrder', listing.sort_order,
        'maxPerOrder', listing.max_per_order,
        'availableQuantity',
          case
            when listing.listing_type = 'product' then greatest(
              coalesce(stock.amount, 0)
              - public._inventory_reserved_quantity(
                listing.product_id,
                listing.unit_id,
                listing.warehouse_id,
                p_now
              ),
              0
            )::int
            else null
          end,
        'unitName', unit.name,
        'warehouseName', warehouse.name,
        'createdAt', listing.created_at::text,
        'updatedAt', listing.updated_at::text
      )
      order by listing.sort_order asc, listing.created_at desc
    ) as items
    from private.inventory_storefront_listings listing
    left join private.inventory_products stock
      on stock.product_id = listing.product_id
     and stock.unit_id = listing.unit_id
     and stock.warehouse_id = listing.warehouse_id
    left join private.inventory_units unit
      on unit.id = listing.unit_id
     and unit.ws_id = storefront.ws_id
    left join private.inventory_warehouses warehouse
      on warehouse.id = listing.warehouse_id
     and warehouse.ws_id = storefront.ws_id
    where listing.storefront_id = storefront.id
      and listing.status = 'published'
  ) listings on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', bundle.id,
        'wsId', bundle.ws_id,
        'storefrontId', bundle.storefront_id,
        'slug', bundle.slug,
        'name', bundle.name,
        'description', bundle.description,
        'imageUrl', bundle.image_url,
        'price', bundle.price,
        'status', bundle.status,
        'maxPerOrder', bundle.max_per_order,
        'availableQuantity', null,
        'components', coalesce(components.items, '[]'::jsonb),
        'createdAt', bundle.created_at::text,
        'updatedAt', bundle.updated_at::text
      )
      order by bundle.created_at desc
    ) as items
    from private.inventory_bundles bundle
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', component.id,
          'bundleId', component.bundle_id,
          'productId', component.product_id,
          'productName', product.name,
          'unitId', component.unit_id,
          'unitName', unit.name,
          'warehouseId', component.warehouse_id,
          'warehouseName', warehouse.name,
          'quantity', component.quantity::int
        )
        order by product.name asc, component.created_at asc
      ) as items
      from private.inventory_bundle_components component
      join public.workspace_products product
        on product.id = component.product_id
       and product.ws_id = storefront.ws_id
      join private.inventory_units unit
        on unit.id = component.unit_id
       and unit.ws_id = storefront.ws_id
      join private.inventory_warehouses warehouse
        on warehouse.id = component.warehouse_id
       and warehouse.ws_id = storefront.ws_id
      join private.inventory_products stock
        on stock.product_id = product.id
       and stock.unit_id = unit.id
       and stock.warehouse_id = warehouse.id
      where component.bundle_id = bundle.id
    ) components on true
    where bundle.ws_id = storefront.ws_id
      and bundle.status = 'active'
      and (
        bundle.storefront_id = storefront.id
        or exists (
          select 1
          from private.inventory_storefront_listings listing
          where listing.storefront_id = storefront.id
            and listing.bundle_id = bundle.id
            and listing.status = 'published'
        )
      )
  ) bundles on true;
$$;

revoke all on function private.inventory_cost_scenario_metrics(
  numeric,
  integer,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric
) from public, anon, authenticated;
revoke all on function private.inventory_cost_profile_payload(uuid)
  from public, anon, authenticated;
revoke all on function private.list_inventory_cost_profiles(
  uuid,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
revoke all on function private.get_inventory_cost_profile(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.get_inventory_costing_analytics(uuid)
  from public, anon, authenticated;
revoke all on function private.list_inventory_storefronts(
  uuid,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
revoke all on function private.get_public_inventory_storefront(
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function private.inventory_cost_scenario_metrics(
  numeric,
  integer,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric
) to service_role;
grant execute on function private.inventory_cost_profile_payload(uuid)
  to service_role;
grant execute on function private.list_inventory_cost_profiles(
  uuid,
  text,
  text,
  integer,
  integer
) to service_role;
grant execute on function private.get_inventory_cost_profile(uuid, uuid)
  to service_role;
grant execute on function private.get_inventory_costing_analytics(uuid)
  to service_role;
grant execute on function private.list_inventory_storefronts(
  uuid,
  text,
  text,
  integer,
  integer
) to service_role;
grant execute on function private.get_public_inventory_storefront(
  text,
  timestamptz
) to service_role;
