alter table private.inventory_storefronts
  add column if not exists deleted_at timestamptz;

create index if not exists inventory_storefronts_ws_active_idx
  on private.inventory_storefronts (ws_id, created_at desc)
  where deleted_at is null;

comment on column private.inventory_storefronts.deleted_at is
  'Soft-delete marker. Checkout and audit history keep referencing the storefront row.';

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
      storefront.polar_environment,
      storefront.created_at,
      storefront.updated_at,
      (
        select count(*)::integer
        from private.inventory_storefront_listings listing
        where listing.storefront_id = storefront.id
      ) as listings_count
    from private.inventory_storefronts storefront
    where storefront.ws_id = p_ws_id
      and storefront.deleted_at is null
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
        'polarEnvironment', paged.polar_environment,
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
