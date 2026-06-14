alter table private.inventory_storefronts
  add column if not exists cover_image_url text,
  add column if not exists analytics_enabled boolean not null default true;

alter table private.inventory_checkout_sessions
  add column if not exists customer_auth_uid uuid
    references auth.users(id) on delete set null;

create index if not exists inventory_checkout_sessions_customer_auth_uid_idx
  on private.inventory_checkout_sessions (customer_auth_uid)
  where customer_auth_uid is not null;

create table if not exists private.inventory_storefront_sections (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  storefront_id uuid not null references private.inventory_storefronts(id)
    on delete cascade,
  section_type text not null check (
    section_type in (
      'cover',
      'featured_banners',
      'featured_listings',
      'product_grid',
      'promo',
      'text'
    )
  ),
  status text not null default 'published' check (
    status in ('draft', 'hidden', 'published')
  ),
  title text,
  description text,
  image_url text,
  href text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists private.inventory_storefront_section_items (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  storefront_id uuid not null references private.inventory_storefronts(id)
    on delete cascade,
  section_id uuid not null references private.inventory_storefront_sections(id)
    on delete cascade,
  listing_id uuid references private.inventory_storefront_listings(id)
    on delete set null,
  bundle_id uuid references private.inventory_bundles(id) on delete set null,
  title text,
  description text,
  image_url text,
  href text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists private.inventory_storefront_events (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  storefront_id uuid not null references private.inventory_storefronts(id)
    on delete cascade,
  event_type text not null check (
    event_type in (
      'add_to_cart',
      'banner_click',
      'checkout_completed',
      'checkout_created',
      'checkout_failed',
      'checkout_started',
      'product_view',
      'remove_from_cart',
      'view'
    )
  ),
  listing_id uuid references private.inventory_storefront_listings(id)
    on delete set null,
  section_id uuid references private.inventory_storefront_sections(id)
    on delete set null,
  checkout_session_id uuid references private.inventory_checkout_sessions(id)
    on delete set null,
  customer_auth_uid uuid references auth.users(id) on delete set null,
  quantity integer check (quantity is null or quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists inventory_storefront_sections_storefront_sort_idx
  on private.inventory_storefront_sections (
    storefront_id,
    status,
    sort_order
  );

create index if not exists inventory_storefront_sections_ws_idx
  on private.inventory_storefront_sections (ws_id, storefront_id);

create index if not exists inventory_storefront_section_items_section_sort_idx
  on private.inventory_storefront_section_items (section_id, sort_order);

create index if not exists inventory_storefront_section_items_ws_idx
  on private.inventory_storefront_section_items (ws_id, storefront_id);

create index if not exists inventory_storefront_events_storefront_time_idx
  on private.inventory_storefront_events (
    storefront_id,
    occurred_at desc
  );

create index if not exists inventory_storefront_events_ws_type_time_idx
  on private.inventory_storefront_events (
    ws_id,
    event_type,
    occurred_at desc
  );

alter table private.inventory_storefront_sections enable row level security;
alter table private.inventory_storefront_section_items enable row level security;
alter table private.inventory_storefront_events enable row level security;

revoke all on table private.inventory_storefront_sections
  from public, anon, authenticated;
revoke all on table private.inventory_storefront_section_items
  from public, anon, authenticated;
revoke all on table private.inventory_storefront_events
  from public, anon, authenticated;

grant all on table private.inventory_storefront_sections to service_role;
grant all on table private.inventory_storefront_section_items to service_role;
grant all on table private.inventory_storefront_events to service_role;

drop trigger if exists inventory_storefront_sections_updated_at
  on private.inventory_storefront_sections;
create trigger inventory_storefront_sections_updated_at
  before update
  on private.inventory_storefront_sections
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists inventory_storefront_section_items_updated_at
  on private.inventory_storefront_section_items;
create trigger inventory_storefront_section_items_updated_at
  before update
  on private.inventory_storefront_section_items
  for each row
  execute function public.update_updated_at_column();

create or replace function public._inventory_create_reserved_line(
  p_ws_id uuid,
  p_checkout_id uuid,
  p_listing_id uuid,
  p_bundle_id uuid,
  p_product_id uuid,
  p_unit_id uuid,
  p_warehouse_id uuid,
  p_title text,
  p_quantity bigint,
  p_unit_price bigint,
  p_expires_at timestamptz,
  p_now timestamptz
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_row private.inventory_products%rowtype;
  reserved_quantity bigint;
  available_quantity bigint;
  new_line_id uuid;
  line_subtotal bigint;
begin
  select stock.*
  into stock_row
  from private.inventory_products stock
  join public.workspace_products product
    on product.id = stock.product_id
  join private.inventory_units unit
    on unit.id = stock.unit_id
  join private.inventory_warehouses warehouse
    on warehouse.id = stock.warehouse_id
  where stock.product_id = p_product_id
    and stock.unit_id = p_unit_id
    and stock.warehouse_id = p_warehouse_id
    and product.ws_id = p_ws_id
    and unit.ws_id = p_ws_id
    and warehouse.ws_id = p_ws_id
  for update of stock;

  if not found then
    raise exception 'INVENTORY_STOCK_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if stock_row.amount is not null then
    reserved_quantity := public._inventory_reserved_quantity(
      p_product_id,
      p_unit_id,
      p_warehouse_id,
      p_now
    );
    available_quantity := stock_row.amount - reserved_quantity;

    if available_quantity < p_quantity then
      raise exception 'INSUFFICIENT_STOCK'
        using errcode = 'P0001';
    end if;
  end if;

  line_subtotal := p_quantity * p_unit_price;

  insert into private.inventory_checkout_lines (
    checkout_session_id,
    listing_id,
    bundle_id,
    product_id,
    unit_id,
    warehouse_id,
    title,
    quantity,
    unit_price,
    subtotal_amount
  )
  values (
    p_checkout_id,
    p_listing_id,
    p_bundle_id,
    p_product_id,
    p_unit_id,
    p_warehouse_id,
    p_title,
    p_quantity,
    p_unit_price,
    line_subtotal
  )
  returning id into new_line_id;

  insert into private.inventory_reservations (
    checkout_session_id,
    checkout_line_id,
    product_id,
    unit_id,
    warehouse_id,
    amount,
    status,
    expires_at
  )
  values (
    p_checkout_id,
    new_line_id,
    p_product_id,
    p_unit_id,
    p_warehouse_id,
    p_quantity,
    'reserved',
    p_expires_at
  );

  return line_subtotal;
end;
$$;

create or replace function public.create_inventory_checkout_session(
  p_storefront_slug text,
  p_payload jsonb,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  storefront_row private.inventory_storefronts%rowtype;
  checkout_row private.inventory_checkout_sessions%rowtype;
  line_payload jsonb;
  quantity bigint;
  subtotal bigint := 0;
  expires_at timestamptz := p_now + interval '15 minutes';
  listing_row private.inventory_storefront_listings%rowtype;
  bundle_row private.inventory_bundles%rowtype;
  component_row record;
  bundle_component_index integer;
begin
  select *
  into storefront_row
  from private.inventory_storefronts
  where slug = p_storefront_slug
    and status = 'published'
  limit 1;

  if not found then
    raise exception 'STOREFRONT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_payload -> 'lines') <> 'array'
    or jsonb_array_length(p_payload -> 'lines') = 0 then
    raise exception 'CHECKOUT_LINES_REQUIRED'
      using errcode = 'P0001';
  end if;

  insert into private.inventory_checkout_sessions (
    ws_id,
    storefront_id,
    customer_auth_uid,
    customer_name,
    customer_email,
    customer_phone,
    note,
    currency,
    status,
    expires_at
  )
  values (
    storefront_row.ws_id,
    storefront_row.id,
    nullif(p_payload ->> 'customerAuthUid', '')::uuid,
    coalesce(nullif(p_payload ->> 'customerName', ''), 'Tuturuuu buyer'),
    lower(coalesce(nullif(p_payload ->> 'customerEmail', ''), 'buyer@users.tuturuuu.local')),
    nullif(p_payload ->> 'customerPhone', ''),
    nullif(p_payload ->> 'note', ''),
    storefront_row.currency,
    'reserved',
    expires_at
  )
  returning * into checkout_row;

  for line_payload in
    select value
    from jsonb_array_elements(p_payload -> 'lines')
  loop
    quantity := greatest(coalesce((line_payload ->> 'quantity')::bigint, 1), 1);

    if line_payload ? 'listingId' or line_payload ? 'listing_id' then
      select *
      into listing_row
      from private.inventory_storefront_listings
      where id = coalesce(
          nullif(line_payload ->> 'listingId', '')::uuid,
          nullif(line_payload ->> 'listing_id', '')::uuid
        )
        and storefront_id = storefront_row.id
        and ws_id = storefront_row.ws_id
        and status = 'published'
      limit 1;

      if not found then
        raise exception 'LISTING_NOT_FOUND'
          using errcode = 'P0001';
      end if;

      if quantity > listing_row.max_per_order then
        raise exception 'LISTING_MAX_PER_ORDER_EXCEEDED'
          using errcode = 'P0001';
      end if;

      if listing_row.listing_type = 'product' then
        subtotal := subtotal + public._inventory_create_reserved_line(
          storefront_row.ws_id,
          checkout_row.id,
          listing_row.id,
          null,
          listing_row.product_id,
          listing_row.unit_id,
          listing_row.warehouse_id,
          listing_row.title,
          quantity,
          listing_row.price,
          expires_at,
          p_now
        );
      else
        select *
        into bundle_row
        from private.inventory_bundles
        where id = listing_row.bundle_id
          and ws_id = storefront_row.ws_id
          and status = 'active'
        limit 1;

        if not found then
          raise exception 'BUNDLE_NOT_FOUND'
            using errcode = 'P0001';
        end if;

        bundle_component_index := 0;
        for component_row in
          select
            component.*,
            product.name as product_name
          from private.inventory_bundle_components component
          join public.workspace_products product
            on product.id = component.product_id
            and product.ws_id = storefront_row.ws_id
          join private.inventory_units unit
            on unit.id = component.unit_id
            and unit.ws_id = storefront_row.ws_id
          join private.inventory_warehouses warehouse
            on warehouse.id = component.warehouse_id
            and warehouse.ws_id = storefront_row.ws_id
          join private.inventory_products stock
            on stock.product_id = product.id
            and stock.unit_id = unit.id
            and stock.warehouse_id = warehouse.id
          where component.bundle_id = bundle_row.id
          order by component.created_at, component.id
        loop
          bundle_component_index := bundle_component_index + 1;
          subtotal := subtotal + public._inventory_create_reserved_line(
            storefront_row.ws_id,
            checkout_row.id,
            listing_row.id,
            bundle_row.id,
            component_row.product_id,
            component_row.unit_id,
            component_row.warehouse_id,
            bundle_row.name || ' - ' || component_row.product_name,
            quantity * component_row.quantity,
            case when bundle_component_index = 1 then listing_row.price else 0 end,
            expires_at,
            p_now
          );
        end loop;

        if bundle_component_index = 0 then
          raise exception 'BUNDLE_COMPONENTS_REQUIRED'
            using errcode = 'P0001';
        end if;
      end if;
    elsif line_payload ? 'bundleId' or line_payload ? 'bundle_id' then
      select *
      into bundle_row
      from private.inventory_bundles
      where id = coalesce(
          nullif(line_payload ->> 'bundleId', '')::uuid,
          nullif(line_payload ->> 'bundle_id', '')::uuid
        )
        and ws_id = storefront_row.ws_id
        and status = 'active'
      limit 1;

      if not found then
        raise exception 'BUNDLE_NOT_FOUND'
          using errcode = 'P0001';
      end if;

      if quantity > bundle_row.max_per_order then
        raise exception 'BUNDLE_MAX_PER_ORDER_EXCEEDED'
          using errcode = 'P0001';
      end if;

      bundle_component_index := 0;
      for component_row in
        select
          component.*,
          product.name as product_name
        from private.inventory_bundle_components component
        join public.workspace_products product
          on product.id = component.product_id
          and product.ws_id = storefront_row.ws_id
        join private.inventory_units unit
          on unit.id = component.unit_id
          and unit.ws_id = storefront_row.ws_id
        join private.inventory_warehouses warehouse
          on warehouse.id = component.warehouse_id
          and warehouse.ws_id = storefront_row.ws_id
        join private.inventory_products stock
          on stock.product_id = product.id
          and stock.unit_id = unit.id
          and stock.warehouse_id = warehouse.id
        where component.bundle_id = bundle_row.id
        order by component.created_at, component.id
      loop
        bundle_component_index := bundle_component_index + 1;
        subtotal := subtotal + public._inventory_create_reserved_line(
          storefront_row.ws_id,
          checkout_row.id,
          null,
          bundle_row.id,
          component_row.product_id,
          component_row.unit_id,
          component_row.warehouse_id,
          bundle_row.name || ' - ' || component_row.product_name,
          quantity * component_row.quantity,
          case when bundle_component_index = 1 then bundle_row.price else 0 end,
          expires_at,
          p_now
        );
      end loop;

      if bundle_component_index = 0 then
        raise exception 'BUNDLE_COMPONENTS_REQUIRED'
          using errcode = 'P0001';
      end if;
    else
      raise exception 'CHECKOUT_LINE_TARGET_REQUIRED'
        using errcode = 'P0001';
    end if;
  end loop;

  update private.inventory_checkout_sessions
  set
    subtotal_amount = subtotal,
    total_amount = subtotal,
    updated_at = p_now
  where id = checkout_row.id
  returning * into checkout_row;

  insert into private.inventory_settlement_ledger_entries (
    ws_id,
    checkout_session_id,
    entry_kind,
    amount,
    currency,
    source
  )
  values
    (
      checkout_row.ws_id,
      checkout_row.id,
      'subtotal',
      subtotal,
      checkout_row.currency,
      'estimate'
    ),
    (
      checkout_row.ws_id,
      checkout_row.id,
      'platform_fee_estimate',
      checkout_row.platform_fee_amount,
      checkout_row.currency,
      'estimate'
    ),
    (
      checkout_row.ws_id,
      checkout_row.id,
      'total',
      checkout_row.total_amount,
      checkout_row.currency,
      'estimate'
    );

  return jsonb_build_object(
    'id', checkout_row.id,
    'publicToken', checkout_row.public_token,
    'status', checkout_row.status,
    'expiresAt', checkout_row.expires_at,
    'totalAmount', checkout_row.total_amount
  );
end;
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
      storefront.cover_image_url,
      storefront.hero_image_url,
      storefront.accent_color,
      storefront.currency,
      storefront.checkout_mode,
      storefront.theme_preset,
      storefront.layout_style,
      storefront.surface_style,
      storefront.corner_style,
      storefront.show_inventory_badges,
      storefront.analytics_enabled,
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
        'coverImageUrl', paged.cover_image_url,
        'heroImageUrl', paged.hero_image_url,
        'accentColor', paged.accent_color,
        'currency', paged.currency,
        'checkoutMode', paged.checkout_mode,
        'themePreset', paged.theme_preset,
        'layoutStyle', paged.layout_style,
        'surfaceStyle', paged.surface_style,
        'cornerStyle', paged.corner_style,
        'showInventoryBadges', paged.show_inventory_badges,
        'analyticsEnabled', paged.analytics_enabled,
        'sections', coalesce(sections.items, '[]'::jsonb),
        'listingsCount', paged.listings_count,
        'createdAt', paged.created_at::text,
        'updatedAt', paged.updated_at::text
      )
    end as storefront
  from counted
  left join paged on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', section.id,
        'wsId', section.ws_id,
        'storefrontId', section.storefront_id,
        'sectionType', section.section_type,
        'status', section.status,
        'title', section.title,
        'description', section.description,
        'imageUrl', section.image_url,
        'href', section.href,
        'sortOrder', section.sort_order,
        'metadata', section.metadata,
        'items', coalesce(section_items.items, '[]'::jsonb),
        'createdAt', section.created_at::text,
        'updatedAt', section.updated_at::text
      )
      order by section.sort_order asc, section.created_at asc
    ) as items
    from private.inventory_storefront_sections section
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'wsId', item.ws_id,
          'storefrontId', item.storefront_id,
          'sectionId', item.section_id,
          'listingId', item.listing_id,
          'bundleId', item.bundle_id,
          'title', item.title,
          'description', item.description,
          'imageUrl', item.image_url,
          'href', item.href,
          'sortOrder', item.sort_order,
          'metadata', item.metadata,
          'createdAt', item.created_at::text,
          'updatedAt', item.updated_at::text
        )
        order by item.sort_order asc, item.created_at asc
      ) as items
      from private.inventory_storefront_section_items item
      where item.section_id = section.id
        and item.ws_id = section.ws_id
    ) section_items on true
    where section.storefront_id = paged.id
      and section.ws_id = paged.ws_id
  ) sections on true;
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
      sf.cover_image_url,
      sf.hero_image_url,
      sf.accent_color,
      sf.currency,
      sf.checkout_mode,
      sf.theme_preset,
      sf.layout_style,
      sf.surface_style,
      sf.corner_style,
      sf.show_inventory_badges,
      sf.analytics_enabled,
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
        'coverImageUrl', storefront.cover_image_url,
        'heroImageUrl', storefront.hero_image_url,
        'accentColor', storefront.accent_color,
        'currency', storefront.currency,
        'checkoutMode', storefront.checkout_mode,
        'themePreset', storefront.theme_preset,
        'layoutStyle', storefront.layout_style,
        'surfaceStyle', storefront.surface_style,
        'cornerStyle', storefront.corner_style,
        'showInventoryBadges', storefront.show_inventory_badges,
        'analyticsEnabled', storefront.analytics_enabled,
        'sections', coalesce(sections.items, '[]'::jsonb),
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
        'id', section.id,
        'wsId', section.ws_id,
        'storefrontId', section.storefront_id,
        'sectionType', section.section_type,
        'status', section.status,
        'title', section.title,
        'description', section.description,
        'imageUrl', section.image_url,
        'href', section.href,
        'sortOrder', section.sort_order,
        'metadata', section.metadata,
        'items', coalesce(section_items.items, '[]'::jsonb),
        'createdAt', section.created_at::text,
        'updatedAt', section.updated_at::text
      )
      order by section.sort_order asc, section.created_at asc
    ) as items
    from private.inventory_storefront_sections section
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'wsId', item.ws_id,
          'storefrontId', item.storefront_id,
          'sectionId', item.section_id,
          'listingId', item.listing_id,
          'bundleId', item.bundle_id,
          'title', item.title,
          'description', item.description,
          'imageUrl', item.image_url,
          'href', item.href,
          'sortOrder', item.sort_order,
          'metadata', item.metadata,
          'createdAt', item.created_at::text,
          'updatedAt', item.updated_at::text
        )
        order by item.sort_order asc, item.created_at asc
      ) as items
      from private.inventory_storefront_section_items item
      where item.section_id = section.id
        and item.ws_id = section.ws_id
    ) section_items on true
    where section.storefront_id = storefront.id
      and section.ws_id = storefront.ws_id
      and section.status = 'published'
  ) sections on true
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
            when listing.listing_type <> 'product' then null
            when stock.product_id is null then 0
            when stock.amount is null then null
            else greatest(
              stock.amount
              - public._inventory_reserved_quantity(
                listing.product_id,
                listing.unit_id,
                listing.warehouse_id,
                p_now
              ),
              0
            )::int
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

create or replace function private.list_inventory_storefront_listings(
  p_ws_id uuid,
  p_storefront_id uuid,
  p_status text default null
)
returns table (
  total_count integer,
  listing jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      listing.id,
      listing.storefront_id,
      listing.ws_id,
      listing.listing_type,
      listing.product_id,
      listing.unit_id,
      unit.name as unit_name,
      listing.warehouse_id,
      warehouse.name as warehouse_name,
      listing.bundle_id,
      listing.title,
      listing.description,
      listing.image_url,
      listing.price,
      listing.compare_at_price,
      listing.status,
      listing.sort_order,
      listing.max_per_order,
      listing.created_at,
      listing.updated_at,
      case
        when listing.listing_type <> 'product' then null
        when stock.product_id is null then 0
        when stock.amount is null then null
        else greatest(
          stock.amount
          - public._inventory_reserved_quantity(
            listing.product_id,
            listing.unit_id,
            listing.warehouse_id,
            now()
          ),
          0
        )::integer
      end as available_quantity
    from private.inventory_storefront_listings listing
    left join private.inventory_products stock
      on stock.product_id = listing.product_id
     and stock.unit_id = listing.unit_id
     and stock.warehouse_id = listing.warehouse_id
    left join private.inventory_units unit
      on unit.id = listing.unit_id
     and unit.ws_id = p_ws_id
    left join private.inventory_warehouses warehouse
      on warehouse.id = listing.warehouse_id
     and warehouse.ws_id = p_ws_id
    where listing.ws_id = p_ws_id
      and listing.storefront_id = p_storefront_id
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or listing.status = p_status
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  )
  select
    counted.total_count,
    case
      when filtered.id is null then null
      else jsonb_build_object(
        'id', filtered.id,
        'storefrontId', filtered.storefront_id,
        'wsId', filtered.ws_id,
        'listingType', filtered.listing_type,
        'productId', filtered.product_id,
        'bundleId', filtered.bundle_id,
        'unitId', filtered.unit_id,
        'warehouseId', filtered.warehouse_id,
        'title', filtered.title,
        'description', filtered.description,
        'imageUrl', filtered.image_url,
        'price', filtered.price,
        'compareAtPrice', filtered.compare_at_price,
        'status', filtered.status,
        'sortOrder', filtered.sort_order,
        'maxPerOrder', filtered.max_per_order,
        'availableQuantity', filtered.available_quantity,
        'unitName', filtered.unit_name,
        'warehouseName', filtered.warehouse_name,
        'createdAt', filtered.created_at::text,
        'updatedAt', filtered.updated_at::text
      )
    end as listing
  from counted
  left join filtered on true
  order by filtered.sort_order asc nulls last, filtered.created_at desc nulls last;
$$;

create or replace function private.get_inventory_checkout_by_public_token(
  p_public_token text
) returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with checkout_session as (
    select
      checkout.id,
      checkout.ws_id,
      checkout.public_token,
      checkout.status,
      checkout.customer_auth_uid,
      checkout.customer_name,
      checkout.customer_email,
      checkout.customer_phone,
      checkout.note,
      checkout.currency,
      checkout.subtotal_amount,
      checkout.platform_fee_amount,
      checkout.processing_fee_estimate_amount,
      checkout.conversion_fee_estimate_amount,
      checkout.total_amount,
      checkout.expires_at,
      checkout.completed_at,
      checkout.finance_invoice_id,
      checkout.polar_checkout_id,
      checkout.polar_checkout_url,
      checkout.polar_environment,
      checkout.polar_order_id,
      checkout.polar_product_id,
      checkout.polar_status
    from private.inventory_checkout_sessions checkout
    where checkout.public_token = p_public_token
    limit 1
  )
  select jsonb_build_object(
    'id', checkout_session.id,
    'wsId', checkout_session.ws_id,
    'publicToken', checkout_session.public_token,
    'status', checkout_session.status,
    'customerAuthUid', checkout_session.customer_auth_uid,
    'customerName', checkout_session.customer_name,
    'customerEmail', checkout_session.customer_email,
    'customerPhone', checkout_session.customer_phone,
    'note', checkout_session.note,
    'currency', checkout_session.currency,
    'subtotalAmount', checkout_session.subtotal_amount,
    'platformFeeAmount', checkout_session.platform_fee_amount,
    'processingFeeEstimateAmount', checkout_session.processing_fee_estimate_amount,
    'conversionFeeEstimateAmount', checkout_session.conversion_fee_estimate_amount,
    'totalAmount', checkout_session.total_amount,
    'expiresAt', checkout_session.expires_at::text,
    'completedAt', checkout_session.completed_at::text,
    'financeInvoiceId', checkout_session.finance_invoice_id,
    'polarCheckoutId', checkout_session.polar_checkout_id,
    'polarCheckoutUrl', checkout_session.polar_checkout_url,
    'polarEnvironment', checkout_session.polar_environment,
    'polarOrderId', checkout_session.polar_order_id,
    'polarProductId', checkout_session.polar_product_id,
    'polarStatus', checkout_session.polar_status,
    'lines', coalesce(lines.items, '[]'::jsonb)
  )
  from checkout_session
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', line.id,
        'listingId', line.listing_id,
        'bundleId', line.bundle_id,
        'productId', line.product_id,
        'unitId', line.unit_id,
        'warehouseId', line.warehouse_id,
        'title', line.title,
        'quantity', line.quantity::int,
        'unitPrice', line.unit_price,
        'subtotalAmount', line.subtotal_amount
      )
      order by line.created_at asc
    ) as items
    from private.inventory_checkout_lines line
    where line.checkout_session_id = checkout_session.id
  ) lines on true;
$$;

create or replace function private.list_inventory_checkouts(
  p_ws_id uuid,
  p_search text default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  total_count integer,
  checkout jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with filtered as (
    select
      checkout.id,
      checkout.ws_id,
      checkout.public_token,
      checkout.status,
      checkout.customer_auth_uid,
      checkout.customer_name,
      checkout.customer_email,
      checkout.customer_phone,
      checkout.note,
      checkout.currency,
      checkout.subtotal_amount,
      checkout.platform_fee_amount,
      checkout.processing_fee_estimate_amount,
      checkout.conversion_fee_estimate_amount,
      checkout.total_amount,
      checkout.expires_at,
      checkout.completed_at,
      checkout.finance_invoice_id,
      checkout.polar_checkout_id,
      checkout.polar_checkout_url,
      checkout.polar_environment,
      checkout.polar_order_id,
      checkout.polar_product_id,
      checkout.polar_status,
      checkout.created_at
    from private.inventory_checkout_sessions checkout
    where checkout.ws_id = p_ws_id
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or checkout.status = p_status
      )
      and (
        coalesce(nullif(p_search, ''), '') = ''
        or checkout.customer_name ilike '%' || p_search || '%'
        or checkout.customer_email ilike '%' || p_search || '%'
        or checkout.public_token ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select count(*)::integer as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc nulls last
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
        'publicToken', paged.public_token,
        'status', paged.status,
        'customerAuthUid', paged.customer_auth_uid,
        'customerName', paged.customer_name,
        'customerEmail', paged.customer_email,
        'customerPhone', paged.customer_phone,
        'note', paged.note,
        'currency', paged.currency,
        'subtotalAmount', paged.subtotal_amount,
        'platformFeeAmount', paged.platform_fee_amount,
        'processingFeeEstimateAmount', paged.processing_fee_estimate_amount,
        'conversionFeeEstimateAmount', paged.conversion_fee_estimate_amount,
        'totalAmount', paged.total_amount,
        'expiresAt', paged.expires_at::text,
        'completedAt', paged.completed_at::text,
        'financeInvoiceId', paged.finance_invoice_id,
        'polarCheckoutId', paged.polar_checkout_id,
        'polarCheckoutUrl', paged.polar_checkout_url,
        'polarEnvironment', paged.polar_environment,
        'polarOrderId', paged.polar_order_id,
        'polarProductId', paged.polar_product_id,
        'polarStatus', paged.polar_status,
        'lines', coalesce(lines.items, '[]'::jsonb)
      )
    end as checkout
  from counted
  left join paged on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', line.id,
        'listingId', line.listing_id,
        'bundleId', line.bundle_id,
        'productId', line.product_id,
        'unitId', line.unit_id,
        'warehouseId', line.warehouse_id,
        'title', line.title,
        'quantity', line.quantity::integer,
        'unitPrice', line.unit_price,
        'subtotalAmount', line.subtotal_amount
      )
      order by line.created_at asc
    ) as items
    from private.inventory_checkout_lines line
    where line.checkout_session_id = paged.id
  ) lines on true;
$$;

revoke all on function public._inventory_create_reserved_line(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  bigint,
  bigint,
  timestamptz,
  timestamptz
) from public;

revoke all on function public.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) from public, anon, authenticated;

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

revoke all on function private.list_inventory_storefront_listings(
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function private.get_inventory_checkout_by_public_token(text)
  from public, anon, authenticated;

revoke all on function private.list_inventory_checkouts(
  uuid,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public._inventory_create_reserved_line(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  bigint,
  bigint,
  timestamptz,
  timestamptz
) to service_role;

grant execute on function public.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) to service_role;

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

grant execute on function private.list_inventory_storefront_listings(
  uuid,
  uuid,
  text
) to service_role;

grant execute on function private.get_inventory_checkout_by_public_token(text)
  to service_role;

grant execute on function private.list_inventory_checkouts(
  uuid,
  text,
  text,
  integer,
  integer
) to service_role;
