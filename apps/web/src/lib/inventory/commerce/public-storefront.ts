import 'server-only';

import type { InventoryBundleComponent } from '@tuturuuu/internal-api/inventory';
import { getPlatformSql } from '@/lib/database/platform-sql';
import {
  type BundleComponentRow,
  type BundleRow,
  type ListingRow,
  mapBundle,
  mapComponent,
  mapListing,
  mapStorefront,
  type StorefrontRow,
} from './mappers';

async function listPublicBundleComponents(wsId: string, bundleIds: string[]) {
  if (bundleIds.length === 0) {
    return new Map<string, InventoryBundleComponent[]>();
  }

  const sql = getPlatformSql();
  const rows = await sql<BundleComponentRow[]>`
    select
      component.id,
      component.bundle_id,
      component.product_id,
      product.name as product_name,
      component.unit_id,
      unit.name as unit_name,
      component.warehouse_id,
      warehouse.name as warehouse_name,
      component.quantity::int as quantity
    from private.inventory_bundle_components component
    join public.workspace_products product
      on product.id = component.product_id
      and product.ws_id = ${wsId}
    join private.inventory_units unit
      on unit.id = component.unit_id
      and unit.ws_id = ${wsId}
    join private.inventory_warehouses warehouse
      on warehouse.id = component.warehouse_id
      and warehouse.ws_id = ${wsId}
    join private.inventory_products stock
      on stock.product_id = product.id
      and stock.unit_id = unit.id
      and stock.warehouse_id = warehouse.id
    where component.bundle_id = any(${bundleIds}::uuid[])
    order by product.name asc, component.created_at asc
  `;

  const grouped = new Map<string, InventoryBundleComponent[]>();
  for (const row of rows) {
    const current = grouped.get(row.bundle_id) ?? [];
    current.push(mapComponent(row));
    grouped.set(row.bundle_id, current);
  }
  return grouped;
}

export async function getPublicStorefront(slug: string) {
  const sql = getPlatformSql();
  const [storefront] = await sql<StorefrontRow[]>`
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
          and listing.status = 'published'
      ) as listings_count
    from private.inventory_storefronts storefront
    where storefront.slug = ${slug}
      and storefront.status = 'published'
    limit 1
  `;

  if (!storefront) {
    return null;
  }

  const listings = await sql<ListingRow[]>`
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
    where listing.storefront_id = ${storefront.id}
      and listing.status = 'published'
    order by listing.sort_order asc, listing.created_at desc
  `;

  const bundles = await sql<BundleRow[]>`
    select
      bundle.id,
      bundle.ws_id,
      bundle.storefront_id,
      bundle.slug,
      bundle.name,
      bundle.description,
      bundle.image_url,
      bundle.price,
      bundle.status,
      bundle.max_per_order,
      bundle.created_at::text as created_at,
      bundle.updated_at::text as updated_at,
      null::int as available_quantity
    from private.inventory_bundles bundle
    where bundle.ws_id = ${storefront.ws_id}
      and bundle.status = 'active'
      and (
        bundle.storefront_id = ${storefront.id}
        or exists (
          select 1
          from private.inventory_storefront_listings listing
          where listing.storefront_id = ${storefront.id}
            and listing.bundle_id = bundle.id
            and listing.status = 'published'
        )
      )
    order by bundle.created_at desc
  `;

  const components = await listPublicBundleComponents(
    storefront.ws_id,
    bundles.map((bundle) => bundle.id)
  );

  return {
    bundles: bundles.map((bundle) => mapBundle(bundle, components)),
    listings: listings.map(mapListing),
    storefront: mapStorefront(storefront),
  };
}
