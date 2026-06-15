import 'server-only';

import {
  type InventoryBundle,
  type InventoryPolarProductSyncSummary,
  type InventoryStorefrontListing,
  toPolarCurrency,
} from '@tuturuuu/internal-api/inventory';
import type { Product } from '@tuturuuu/payment/polar';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { after } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { resolveInventoryPolarContext } from './polar';

type SupabaseErrorLike = { message?: string } | null;

type SyncTable = 'inventory_storefront_listings' | 'inventory_bundles';

type SyncKind = 'inventory_listing' | 'inventory_bundle';

type PolarSyncRow = {
  currency: string;
  description: string | null;
  imageUrl: string | null;
  name: string;
  polarProductId: string | null;
  priceCents: number;
  rowId: string;
  storefrontSlug: string | null;
  wsId: string;
};

async function getPrivateAdmin() {
  return (await createAdminClient()).schema('private');
}

/**
 * Reads the row's current Polar product id straight from the DB so we reuse an
 * existing Polar product (update) instead of creating a duplicate on every edit.
 * Decoupled from the listing/bundle mappers, which hydrate through RPCs that do
 * not surface the private Polar columns.
 */
async function getCurrentPolarProductId(
  table: SyncTable,
  rowId: string,
  wsId: string
): Promise<string | null> {
  const privateAdmin = await getPrivateAdmin();
  const { data } = (await privateAdmin
    .from(table as never)
    .select('polar_product_id')
    .eq('id', rowId)
    .eq('ws_id', wsId)
    .maybeSingle()) as {
    data: { polar_product_id?: string | null } | null;
  };
  return data?.polar_product_id ?? null;
}

/**
 * Looks up the storefront slug + currency a listing/bundle belongs to so the
 * Polar product price uses the right currency and checkout targets the right
 * environment. Bundles may not be tied to a storefront, in which case we fall
 * back to the workspace deployment default and USD.
 */
async function getStorefrontContext(storefrontId: string | null): Promise<{
  currency: string;
  slug: string | null;
}> {
  if (!storefrontId) return { currency: 'USD', slug: null };

  const privateAdmin = await getPrivateAdmin();
  const { data } = (await privateAdmin
    .from('inventory_storefronts' as never)
    .select('slug, currency')
    .eq('id', storefrontId)
    .maybeSingle()) as {
    data: { currency?: string | null; slug?: string | null } | null;
  };

  return {
    currency: data?.currency ?? 'USD',
    slug: data?.slug ?? null,
  };
}

async function markRowSyncState(
  table: SyncTable,
  rowId: string,
  wsId: string,
  values: Record<string, unknown>
) {
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from(table as never)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', rowId)
    .eq('ws_id', wsId)) as { error: SupabaseErrorLike };

  if (error) {
    serverLogger.warn('Failed to persist Polar product sync state', {
      error: error.message,
      rowId,
      table,
    });
  }
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Unknown Polar error';
}

/**
 * Pushes one inventory listing/bundle into Polar as a product with a fixed
 * price. Best-effort and non-throwing: a Polar outage or missing integration
 * must never fail the underlying inventory write. Reuses an existing Polar
 * product when the row already maps to one, otherwise creates it.
 */
async function pushRowToPolar(
  table: SyncTable,
  kind: SyncKind,
  row: PolarSyncRow
) {
  const context = await resolveInventoryPolarContext({
    storefrontSlug: row.storefrontSlug,
    wsId: row.wsId,
  });

  if (!context) {
    // No Polar integration for this workspace/environment yet — leave the row
    // pending so a later sync (or connecting Polar) can pick it up.
    await markRowSyncState(table, row.rowId, row.wsId, {
      polar_sync_status: 'disabled',
      polar_last_error: null,
    });
    return;
  }

  const { environment, polar } = context;
  const currency = toPolarCurrency(row.currency);
  const priceAmount = Math.max(0, Math.round(row.priceCents));
  // Polar requires the organization's default presentment currency (USD) to be
  // present on every product and selects the price matching the checkout
  // currency. So price the product in USD plus the storefront's currency (same
  // numeric amount — the storefront-currency price is the one ever charged,
  // since our checkout always uses the storefront currency). Fixed prices are
  // immutable, so each update replaces the whole price list.
  const prices = Array.from(new Set(['usd', currency])).map((code) => ({
    amountType: 'fixed' as const,
    priceAmount,
    priceCurrency: code as never,
  }));
  const metadata = {
    environment,
    kind,
    rowId: row.rowId,
    wsId: row.wsId,
  };

  try {
    let productId =
      row.polarProductId ??
      (await getCurrentPolarProductId(table, row.rowId, row.wsId));
    let priceId: string | null = null;

    // A Polar product's price currency is immutable. If the storefront currency
    // changed since the product was created (its prices no longer include the
    // target currency), recreate the product instead of updating it.
    if (productId) {
      try {
        const existing = await polar.products.get({ id: productId });
        const existingCurrencies = (
          (existing.prices ?? []) as Array<{ priceCurrency?: string | null }>
        )
          .map((p) => p.priceCurrency?.toLowerCase())
          .filter((c): c is string => Boolean(c));
        if (
          existingCurrencies.length &&
          !existingCurrencies.includes(currency)
        ) {
          productId = null;
        }
      } catch {
        // If the product can't be fetched (deleted/invalid), recreate it.
        productId = null;
      }
    }

    if (productId) {
      const updated = await polar.products.update({
        id: productId,
        productUpdate: {
          description: row.description ?? undefined,
          metadata,
          name: row.name,
          prices,
        },
      });
      priceId = updated.prices?.[0]?.id ?? null;
    } else {
      const created = await polar.products.create({
        description: row.description ?? undefined,
        metadata,
        name: row.name,
        prices,
        visibility: 'public',
      });
      productId = created.id;
      priceId = created.prices?.[0]?.id ?? null;
    }

    await markRowSyncState(table, row.rowId, row.wsId, {
      polar_environment: environment,
      polar_last_error: null,
      polar_price_id: priceId,
      polar_product_id: productId,
      polar_sync_status: 'synced',
      polar_synced_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = extractErrorMessage(error);
    serverLogger.warn('Inventory Polar product push failed', {
      error: message,
      kind,
      rowId: row.rowId,
      wsId: row.wsId,
    });
    await markRowSyncState(table, row.rowId, row.wsId, {
      polar_last_error: message,
      polar_sync_status: 'error',
    });
  }
}

export async function syncListingToPolar(listing: InventoryStorefrontListing) {
  // Archived listings should not advertise a buyable Polar product.
  if (listing.status === 'archived') return;

  const { currency, slug } = await getStorefrontContext(listing.storefrontId);
  await pushRowToPolar('inventory_storefront_listings', 'inventory_listing', {
    currency,
    description: listing.description ?? null,
    imageUrl: listing.imageUrl ?? null,
    name: listing.title,
    polarProductId: listing.polarProductId ?? null,
    priceCents: listing.price,
    rowId: listing.id,
    storefrontSlug: slug,
    wsId: listing.wsId,
  });
}

export async function syncBundleToPolar(bundle: InventoryBundle) {
  if (bundle.status === 'archived') return;

  const { currency, slug } = await getStorefrontContext(bundle.storefrontId);
  await pushRowToPolar('inventory_bundles', 'inventory_bundle', {
    currency,
    description: bundle.description ?? null,
    imageUrl: bundle.imageUrl ?? null,
    name: bundle.name,
    polarProductId: bundle.polarProductId ?? null,
    priceCents: bundle.price,
    rowId: bundle.id,
    storefrontSlug: slug,
    wsId: bundle.wsId,
  });
}

function getSyncMetadata(value: unknown): {
  kind: SyncKind;
  rowId: string;
  wsId: string;
} | null {
  if (!value || typeof value !== 'object') return null;
  const metadata = value as Record<string, unknown>;
  const kind = metadata.kind;
  if (kind !== 'inventory_listing' && kind !== 'inventory_bundle') return null;
  if (typeof metadata.rowId !== 'string' || typeof metadata.wsId !== 'string') {
    return null;
  }
  return { kind, rowId: metadata.rowId, wsId: metadata.wsId };
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
  product: Product
): Promise<boolean> {
  const metadata = getSyncMetadata(product.metadata);
  if (!metadata) return false;

  const table: SyncTable =
    metadata.kind === 'inventory_listing'
      ? 'inventory_storefront_listings'
      : 'inventory_bundles';
  const nameColumn = metadata.kind === 'inventory_listing' ? 'title' : 'name';

  const update: Record<string, unknown> = {
    polar_last_error: null,
    polar_price_id: product.prices?.[0]?.id ?? null,
    polar_product_id: product.id,
    polar_sync_status: 'synced',
    polar_synced_at: new Date().toISOString(),
  };
  if (typeof product.name === 'string' && product.name.trim()) {
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

  for (const listing of listings ?? []) {
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
  };
}

type SyncStatusRow = {
  name: string;
  polar_last_error: string | null;
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
      .select('title, polar_sync_status, polar_synced_at, polar_last_error')
      .eq('ws_id', wsId)
      .neq('status', 'archived'),
    privateAdmin
      .from('inventory_bundles' as never)
      .select('name, polar_sync_status, polar_synced_at, polar_last_error')
      .eq('ws_id', wsId)
      .neq('status', 'archived'),
  ]);

  const listings = emptyCounts();
  const bundles = emptyCounts();
  const errors: InventoryPolarProductSyncSummary['errors'] = [];
  let lastSyncedAt: string | null = null;

  const tally = (
    counts: InventoryPolarProductSyncSummary['listings'],
    rows: SyncStatusRow[],
    kind: 'bundle' | 'listing'
  ) => {
    for (const row of rows) {
      counts.total += 1;
      const status = (row.polar_sync_status ?? 'pending') as
        | 'synced'
        | 'pending'
        | 'error'
        | 'disabled';
      if (
        status === 'synced' ||
        status === 'pending' ||
        status === 'error' ||
        status === 'disabled'
      ) {
        counts[status] += 1;
      }
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

  tally(
    listings,
    ((listingRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      name: String(r.title ?? ''),
      polar_last_error: (r.polar_last_error as string | null) ?? null,
      polar_sync_status: (r.polar_sync_status as string | null) ?? null,
      polar_synced_at: (r.polar_synced_at as string | null) ?? null,
    })),
    'listing'
  );
  tally(
    bundles,
    ((bundleRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      name: String(r.name ?? ''),
      polar_last_error: (r.polar_last_error as string | null) ?? null,
      polar_sync_status: (r.polar_sync_status as string | null) ?? null,
      polar_synced_at: (r.polar_synced_at as string | null) ?? null,
    })),
    'bundle'
  );

  return { bundles, errors: errors.slice(0, 8), lastSyncedAt, listings };
}
