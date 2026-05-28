import 'server-only';

import type {
  InventoryListingStatus,
  InventoryStorefrontListingPayload,
  InventoryStorefrontPayload,
  InventoryStorefrontStatus,
} from '@tuturuuu/internal-api/inventory';
import { getPlatformSql } from '@/lib/database/platform-sql';
import {
  type ListingRow,
  type ListQuery,
  mapListing,
  mapStorefront,
  type StorefrontRow,
} from './mappers';

function normalizePagination(page?: number, pageSize?: number) {
  const limit = Math.max(1, Math.min(pageSize ?? 25, 100));
  const offset = (Math.max(1, page ?? 1) - 1) * limit;
  return { limit, offset };
}

function normalizeSearch(q?: string) {
  const value = q?.trim();
  return value ? `%${value}%` : null;
}

export async function listStorefronts(
  wsId: string,
  query: ListQuery<InventoryStorefrontStatus> = {}
) {
  const sql = getPlatformSql();
  const { limit, offset } = normalizePagination(query.page, query.pageSize);
  const search = normalizeSearch(query.q);
  const status = query.status && query.status !== 'all' ? query.status : null;

  const rows = await sql<StorefrontRow[]>`
    select
      storefront.id,
      storefront.ws_id,
      storefront.slug,
      storefront.name,
      storefront.description,
      storefront.status,
      storefront.hero_image_url,
      storefront.accent_color,
      storefront.currency,
      storefront.created_at::text as created_at,
      storefront.updated_at::text as updated_at,
      (
        select count(*)::int
        from private.inventory_storefront_listings listing
        where listing.storefront_id = storefront.id
      ) as listings_count
    from private.inventory_storefronts storefront
    where storefront.ws_id = ${wsId}
      and (${status}::text is null or storefront.status = ${status})
      and (
        ${search}::text is null
        or storefront.name ilike ${search}
        or storefront.slug ilike ${search}
      )
    order by storefront.created_at desc
    limit ${limit}
    offset ${offset}
  `;

  const [countRow] = await sql<{ count: number }[]>`
    select count(*)::int as count
    from private.inventory_storefronts storefront
    where storefront.ws_id = ${wsId}
      and (${status}::text is null or storefront.status = ${status})
      and (
        ${search}::text is null
        or storefront.name ilike ${search}
        or storefront.slug ilike ${search}
      )
  `;

  return { count: countRow?.count ?? 0, data: rows.map(mapStorefront) };
}

export async function createStorefront(
  wsId: string,
  payload: InventoryStorefrontPayload
) {
  const sql = getPlatformSql();
  const [row] = await sql<StorefrontRow[]>`
    insert into private.inventory_storefronts (
      ws_id,
      slug,
      name,
      description,
      status,
      hero_image_url,
      accent_color,
      currency
    )
    values (
      ${wsId},
      ${payload.slug},
      ${payload.name},
      ${payload.description ?? null},
      ${payload.status ?? 'draft'},
      ${payload.heroImageUrl ?? null},
      ${payload.accentColor ?? null},
      ${payload.currency ?? 'USD'}
    )
    returning
      id,
      ws_id,
      slug,
      name,
      description,
      status,
      hero_image_url,
      accent_color,
      currency,
      created_at::text as created_at,
      updated_at::text as updated_at,
      0::int as listings_count
  `;

  if (!row) {
    throw new Error('Failed to create inventory storefront');
  }

  return mapStorefront(row);
}

export async function updateStorefront(
  wsId: string,
  storefrontId: string,
  payload: Partial<InventoryStorefrontPayload>
) {
  const sql = getPlatformSql();
  const [row] = await sql<StorefrontRow[]>`
    update private.inventory_storefronts
    set
      slug = coalesce(${payload.slug ?? null}, slug),
      name = coalesce(${payload.name ?? null}, name),
      description = ${payload.description ?? null},
      status = coalesce(${payload.status ?? null}, status),
      hero_image_url = ${payload.heroImageUrl ?? null},
      accent_color = ${payload.accentColor ?? null},
      currency = coalesce(${payload.currency ?? null}, currency)
    where id = ${storefrontId}
      and ws_id = ${wsId}
    returning
      id,
      ws_id,
      slug,
      name,
      description,
      status,
      hero_image_url,
      accent_color,
      currency,
      created_at::text as created_at,
      updated_at::text as updated_at,
      (
        select count(*)::int
        from private.inventory_storefront_listings listing
        where listing.storefront_id = private.inventory_storefronts.id
      ) as listings_count
  `;

  return row ? mapStorefront(row) : null;
}

export async function listStorefrontListings(
  wsId: string,
  storefrontId: string,
  query: {
    status?: InventoryStorefrontStatus | InventoryListingStatus | 'all';
  } = {}
) {
  const sql = getPlatformSql();
  const status = query.status && query.status !== 'all' ? query.status : null;
  const rows = await sql<ListingRow[]>`
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
      listing.created_at::text as created_at,
      listing.updated_at::text as updated_at,
      case
        when listing.listing_type = 'product' then greatest(
          coalesce(stock.amount, 0)
          - public._inventory_reserved_quantity(
            listing.product_id,
            listing.unit_id,
            listing.warehouse_id,
            now()
          ),
          0
        )::int
        else null
      end as available_quantity
    from private.inventory_storefront_listings listing
    left join private.inventory_products stock
      on stock.product_id = listing.product_id
      and stock.unit_id = listing.unit_id
      and stock.warehouse_id = listing.warehouse_id
    left join private.inventory_units unit
      on unit.id = listing.unit_id
    left join private.inventory_warehouses warehouse
      on warehouse.id = listing.warehouse_id
    where listing.ws_id = ${wsId}
      and listing.storefront_id = ${storefrontId}
      and (${status}::text is null or listing.status = ${status})
    order by listing.sort_order asc, listing.created_at desc
  `;

  return { count: rows.length, data: rows.map(mapListing) };
}

async function assertListingTarget(
  wsId: string,
  payload: InventoryStorefrontListingPayload
) {
  const sql = getPlatformSql();

  if ((payload.listingType ?? 'product') === 'product') {
    const [row] = await sql<{ id: string }[]>`
      select product.id
      from public.workspace_products product
      join private.inventory_products stock
        on stock.product_id = product.id
      where product.ws_id = ${wsId}
        and product.id = ${payload.productId ?? null}
        and stock.unit_id = ${payload.unitId ?? null}
        and stock.warehouse_id = ${payload.warehouseId ?? null}
      limit 1
    `;
    if (!row) throw new Error('Invalid inventory listing product target');
    return;
  }

  const [row] = await sql<{ id: string }[]>`
    select id
    from private.inventory_bundles
    where ws_id = ${wsId}
      and id = ${payload.bundleId ?? null}
    limit 1
  `;
  if (!row) throw new Error('Invalid inventory listing bundle target');
}

async function assertStorefrontTarget(wsId: string, storefrontId: string) {
  const sql = getPlatformSql();
  const [row] = await sql<{ id: string }[]>`
    select id
    from private.inventory_storefronts
    where id = ${storefrontId}
      and ws_id = ${wsId}
    limit 1
  `;

  if (!row) throw new Error('Invalid inventory storefront target');
}

export async function createStorefrontListing(
  wsId: string,
  storefrontId: string,
  payload: InventoryStorefrontListingPayload
) {
  await assertStorefrontTarget(wsId, storefrontId);
  await assertListingTarget(wsId, payload);

  const sql = getPlatformSql();
  const listingType = payload.listingType ?? 'product';
  const [row] = await sql<ListingRow[]>`
    insert into private.inventory_storefront_listings (
      storefront_id,
      ws_id,
      listing_type,
      product_id,
      unit_id,
      warehouse_id,
      bundle_id,
      title,
      description,
      image_url,
      price,
      compare_at_price,
      status,
      sort_order,
      max_per_order
    )
    values (
      ${storefrontId},
      ${wsId},
      ${listingType},
      ${listingType === 'product' ? (payload.productId ?? null) : null},
      ${listingType === 'product' ? (payload.unitId ?? null) : null},
      ${listingType === 'product' ? (payload.warehouseId ?? null) : null},
      ${listingType === 'bundle' ? (payload.bundleId ?? null) : null},
      ${payload.title},
      ${payload.description ?? null},
      ${payload.imageUrl ?? null},
      ${payload.price},
      ${payload.compareAtPrice ?? null},
      ${payload.status ?? 'draft'},
      ${payload.sortOrder ?? 0},
      ${payload.maxPerOrder ?? 99}
    )
    returning
      id,
      storefront_id,
      ws_id,
      listing_type,
      product_id,
      unit_id,
      null::text as unit_name,
      warehouse_id,
      null::text as warehouse_name,
      bundle_id,
      title,
      description,
      image_url,
      price,
      compare_at_price,
      status,
      sort_order,
      max_per_order,
      created_at::text as created_at,
      updated_at::text as updated_at,
      null::int as available_quantity
  `;

  if (!row) {
    throw new Error('Failed to create inventory storefront listing');
  }

  return mapListing(row);
}
