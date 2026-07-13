import 'server-only';

import type { InventoryPolarProductSyncSummary } from '@tuturuuu/internal-api/inventory';
import { getPrivateAdmin, pushRowToPolar } from './polar-product-sync-core';

type StorefrontContextRow = { currency: string; id: string; slug: string };

async function getWorkspaceStorefrontContexts(
  wsId: string
): Promise<Map<string, { currency: string; slug: string }>> {
  const privateAdmin = await getPrivateAdmin();
  const { data } = (await privateAdmin
    .from('inventory_storefronts' as never)
    .select('id, slug, currency')
    .eq('ws_id', wsId)) as { data: StorefrontContextRow[] | null };
  const map = new Map<string, { currency: string; slug: string }>();
  for (const row of data ?? []) {
    map.set(row.id, { currency: row.currency ?? 'USD', slug: row.slug });
  }
  return map;
}

/**
 * Re-pushes every non-archived listing and bundle in a workspace to Polar. Used
 * by the manual sync endpoint and the drift-repair cron to converge rows that
 * were created before Polar was connected or that errored mid-sync.
 */
export async function reconcileWorkspacePolarProducts(wsId: string): Promise<{
  bundles: number;
  listings: number;
  variants: number;
}> {
  const privateAdmin = await getPrivateAdmin();
  const contexts = await getWorkspaceStorefrontContexts(wsId);

  const { data: listings } = (await privateAdmin
    .from('inventory_storefront_listings' as never)
    .select(
      'id, ws_id, storefront_id, title, description, image_url, price, status, polar_product_id'
    )
    .eq('ws_id', wsId)
    .neq('status', 'archived')) as {
    data: Array<{
      description: string | null;
      id: string;
      image_url: string | null;
      polar_product_id: string | null;
      price: number;
      storefront_id: string;
      title: string;
      ws_id: string;
    }> | null;
  };

  const listingContextById = new Map<
    string,
    { description: string | null; storefrontId: string; title: string }
  >();
  for (const listing of listings ?? []) {
    listingContextById.set(listing.id, {
      description: listing.description,
      storefrontId: listing.storefront_id,
      title: listing.title,
    });
    const context = contexts.get(listing.storefront_id);
    await pushRowToPolar('inventory_storefront_listings', 'inventory_listing', {
      currency: context?.currency ?? 'USD',
      description: listing.description,
      imageUrl: listing.image_url,
      name: listing.title,
      polarProductId: listing.polar_product_id,
      priceCents: listing.price,
      rowId: listing.id,
      storefrontSlug: context?.slug ?? null,
      wsId: listing.ws_id,
    });
  }

  const { data: variants } = (await privateAdmin
    .from('inventory_storefront_listing_variants' as never)
    .select(
      'id, ws_id, listing_id, title, image_url, price, polar_product_id, status'
    )
    .eq('ws_id', wsId)
    .eq('status', 'active')) as {
    data: Array<{
      id: string;
      image_url: string | null;
      listing_id: string;
      polar_product_id: string | null;
      price: number;
      title: string | null;
      ws_id: string;
    }> | null;
  };

  for (const variant of variants ?? []) {
    const listingContext = listingContextById.get(variant.listing_id);
    if (!listingContext) continue;
    const context = contexts.get(listingContext.storefrontId);
    await pushRowToPolar(
      'inventory_storefront_listing_variants',
      'inventory_listing_variant',
      {
        currency: context?.currency ?? 'USD',
        description: listingContext.description,
        imageUrl: variant.image_url,
        name: variant.title
          ? `${listingContext.title} - ${variant.title}`
          : listingContext.title,
        polarProductId: variant.polar_product_id,
        priceCents: variant.price,
        rowId: variant.id,
        storefrontSlug: context?.slug ?? null,
        wsId: variant.ws_id,
      }
    );
  }

  const { data: bundles } = (await privateAdmin
    .from('inventory_bundles' as never)
    .select(
      'id, ws_id, storefront_id, name, description, image_url, price, status, polar_product_id'
    )
    .eq('ws_id', wsId)
    .neq('status', 'archived')) as {
    data: Array<{
      description: string | null;
      id: string;
      image_url: string | null;
      name: string;
      polar_product_id: string | null;
      price: number;
      storefront_id: string | null;
      ws_id: string;
    }> | null;
  };

  for (const bundle of bundles ?? []) {
    const context = bundle.storefront_id
      ? contexts.get(bundle.storefront_id)
      : null;
    await pushRowToPolar('inventory_bundles', 'inventory_bundle', {
      currency: context?.currency ?? 'USD',
      description: bundle.description,
      imageUrl: bundle.image_url,
      name: bundle.name,
      polarProductId: bundle.polar_product_id,
      priceCents: bundle.price,
      rowId: bundle.id,
      storefrontSlug: context?.slug ?? null,
      wsId: bundle.ws_id,
    });
  }

  return {
    bundles: bundles?.length ?? 0,
    listings: listings?.length ?? 0,
    variants: variants?.length ?? 0,
  };
}

export type SyncStatusRow = {
  name: string;
  polar_last_error: string | null;
  polar_product_id: string | null;
  polar_sync_status: string | null;
  polar_synced_at: string | null;
};

function emptyCounts(): InventoryPolarProductSyncSummary['listings'] {
  return { disabled: 0, error: 0, pending: 0, synced: 0, total: 0 };
}

/**
 * Aggregates the Polar sync state of a workspace's listings and bundles for the
 * Polar hub sync-health card: counts by status, the most recent errors, and the
 * latest successful sync time.
 */
export async function getInventoryPolarProductSyncSummary(
  wsId: string
): Promise<InventoryPolarProductSyncSummary> {
  const privateAdmin = await getPrivateAdmin();
  const [listingRes, bundleRes] = await Promise.all([
    privateAdmin
      .from('inventory_storefront_listings' as never)
      .select(
        'title, polar_product_id, polar_sync_status, polar_synced_at, polar_last_error'
      )
      .eq('ws_id', wsId)
      .neq('status', 'archived'),
    privateAdmin
      .from('inventory_bundles' as never)
      .select(
        'name, polar_product_id, polar_sync_status, polar_synced_at, polar_last_error'
      )
      .eq('ws_id', wsId)
      .neq('status', 'archived'),
  ]);

  if (listingRes.error) {
    throw new Error(
      listingRes.error.message ?? 'Failed to load Polar listing sync state'
    );
  }
  if (bundleRes.error) {
    throw new Error(
      bundleRes.error.message ?? 'Failed to load Polar bundle sync state'
    );
  }

  return buildPolarProductSyncSummary(
    ((listingRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      name: String(row.title ?? ''),
      polar_last_error: (row.polar_last_error as string | null) ?? null,
      polar_product_id: (row.polar_product_id as string | null) ?? null,
      polar_sync_status: (row.polar_sync_status as string | null) ?? null,
      polar_synced_at: (row.polar_synced_at as string | null) ?? null,
    })),
    ((bundleRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      name: String(row.name ?? ''),
      polar_last_error: (row.polar_last_error as string | null) ?? null,
      polar_product_id: (row.polar_product_id as string | null) ?? null,
      polar_sync_status: (row.polar_sync_status as string | null) ?? null,
      polar_synced_at: (row.polar_synced_at as string | null) ?? null,
    }))
  );
}

export function buildPolarProductSyncSummary(
  listingRows: SyncStatusRow[],
  bundleRows: SyncStatusRow[]
): InventoryPolarProductSyncSummary {
  const listings = emptyCounts();
  const bundles = emptyCounts();
  const errors: InventoryPolarProductSyncSummary['errors'] = [];
  const items: InventoryPolarProductSyncSummary['items'] = [];
  let lastSyncedAt: string | null = null;

  const tally = (
    counts: InventoryPolarProductSyncSummary['listings'],
    rows: SyncStatusRow[],
    kind: 'bundle' | 'listing'
  ) => {
    for (const row of rows) {
      counts.total += 1;
      const status =
        row.polar_sync_status === 'synced' ||
        row.polar_sync_status === 'error' ||
        row.polar_sync_status === 'disabled'
          ? row.polar_sync_status
          : 'pending';
      counts[status] += 1;
      items.push({
        kind,
        name: row.name,
        polarProductId: row.polar_product_id,
        status,
        syncedAt: row.polar_synced_at,
      });
      if (
        row.polar_synced_at &&
        (!lastSyncedAt || row.polar_synced_at > lastSyncedAt)
      ) {
        lastSyncedAt = row.polar_synced_at;
      }
      if (row.polar_sync_status === 'error' && row.polar_last_error) {
        errors.push({
          error: row.polar_last_error,
          kind,
          name: row.name,
          syncedAt: row.polar_synced_at,
        });
      }
    }
  };

  tally(listings, listingRows, 'listing');
  tally(bundles, bundleRows, 'bundle');

  return {
    bundles,
    errors: errors.slice(0, 8),
    items,
    lastSyncedAt,
    listings,
  };
}
