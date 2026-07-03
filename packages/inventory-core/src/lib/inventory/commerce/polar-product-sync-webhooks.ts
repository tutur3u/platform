import 'server-only';

import type {
  InventoryBundle,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import type { Product } from '@tuturuuu/payment/polar';
import { after } from 'next/server';
import { serverLogger } from '../../infrastructure/log-drain';
import { resolveInventoryPolarContext } from './polar-core';
import { assertInventoryPolarWorkspace } from './polar-errors';
import {
  extractErrorMessage,
  getStorefrontContext,
  markRowSyncState,
  type SyncKind,
  type SyncTable,
  syncBundleToPolar,
  syncListingToPolar,
  syncVariantToPolar,
  type VariantPolarSyncInput,
} from './polar-product-sync-core';

export function scheduleVariantPolarSync(input: VariantPolarSyncInput) {
  schedulePush(() => syncVariantToPolar(input));
}

function getSyncMetadata(
  value: unknown,
  expectedWsId?: string
): {
  kind: SyncKind;
  rowId: string;
  wsId: string;
} | null {
  if (!value || typeof value !== 'object') return null;
  const metadata = value as Record<string, unknown>;
  const kind = metadata.kind;
  if (
    kind !== 'inventory_listing' &&
    kind !== 'inventory_bundle' &&
    kind !== 'inventory_listing_variant'
  ) {
    return null;
  }
  if (typeof metadata.rowId !== 'string' || typeof metadata.wsId !== 'string') {
    return null;
  }
  assertInventoryPolarWorkspace({
    actualWsId: metadata.wsId,
    expectedWsId,
  });
  return { kind, rowId: metadata.rowId, wsId: metadata.wsId };
}

function syncTableForKind(kind: SyncKind): SyncTable {
  if (kind === 'inventory_listing') return 'inventory_storefront_listings';
  if (kind === 'inventory_listing_variant') {
    return 'inventory_storefront_listing_variants';
  }
  return 'inventory_bundles';
}

function getFixedPriceAmount(product: Product): number | null {
  const prices = (product.prices ?? []) as Array<{
    amountType?: string;
    priceAmount?: number | null;
  }>;
  const fixed = prices.find(
    (price) =>
      price.amountType === 'fixed' && typeof price.priceAmount === 'number'
  );
  return typeof fixed?.priceAmount === 'number' ? fixed.priceAmount : null;
}

/**
 * Pull side of the 2-way sync: applies a Polar product.created/updated event
 * back onto the inventory listing/bundle it maps to. Returns true when the
 * product belonged to inventory (so the webhook can stop), false otherwise.
 */
export async function applyPolarProductToInventory(
  product: Product,
  expectedWsId?: string
): Promise<boolean> {
  const metadata = getSyncMetadata(product.metadata, expectedWsId);
  if (!metadata) return false;

  const table = syncTableForKind(metadata.kind);
  const nameColumn = metadata.kind === 'inventory_bundle' ? 'name' : 'title';

  const update: Record<string, unknown> = {
    polar_last_error: null,
    polar_price_id: product.prices?.[0]?.id ?? null,
    polar_product_id: product.id,
    polar_sync_status: 'synced',
    polar_synced_at: new Date().toISOString(),
  };
  // A variant's title is the option label we own (the Polar product name is the
  // combined "Listing - Variant" string), so never overwrite it from Polar.
  if (
    metadata.kind !== 'inventory_listing_variant' &&
    typeof product.name === 'string' &&
    product.name.trim()
  ) {
    update[nameColumn] = product.name;
  }
  if (typeof product.description === 'string') {
    update.description = product.description;
  }
  const priceAmount = getFixedPriceAmount(product);
  if (priceAmount !== null) update.price = priceAmount;

  await markRowSyncState(table, metadata.rowId, metadata.wsId, update);
  return true;
}

export function hasInventoryProductMetadata(value: unknown) {
  return Boolean(getSyncMetadata(value));
}

/**
 * Schedules a best-effort Polar push to run after the response is sent so the
 * inventory write stays fast and never fails on a Polar hiccup. Falls back to a
 * detached promise when called outside a request scope (e.g. cron).
 */
function schedulePush(run: () => Promise<void>) {
  const safeRun = () => run().catch(() => undefined);
  try {
    after(safeRun);
  } catch {
    void safeRun();
  }
}

export function scheduleListingPolarSync(listing: InventoryStorefrontListing) {
  schedulePush(() => syncListingToPolar(listing));
}

export function scheduleBundlePolarSync(bundle: InventoryBundle) {
  schedulePush(() => syncBundleToPolar(bundle));
}

/**
 * Archives a Polar product after the inventory row that mapped to it is hard
 * deleted, so a removed listing/bundle can no longer be purchased on Polar.
 * The row is already gone, so this works purely from the captured product id.
 */
export function scheduleInventoryPolarProductArchive(args: {
  polarProductId: string | null;
  storefrontId: string | null;
  wsId: string;
}) {
  if (!args.polarProductId) return;
  schedulePush(async () => {
    const { slug } = await getStorefrontContext(args.storefrontId);
    const context = await resolveInventoryPolarContext({
      storefrontSlug: slug,
      wsId: args.wsId,
    });
    if (!context) return;
    try {
      await context.polar.products.update({
        id: args.polarProductId as string,
        productUpdate: { isArchived: true },
      });
    } catch (error) {
      serverLogger.warn('Inventory Polar product archive-on-delete failed', {
        error: extractErrorMessage(error),
        polarProductId: args.polarProductId,
        wsId: args.wsId,
      });
    }
  });
}
