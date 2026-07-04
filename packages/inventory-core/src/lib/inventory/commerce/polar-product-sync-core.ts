import 'server-only';

import {
  type InventoryBundle,
  type InventoryStorefrontListing,
  type InventoryVariantStatus,
  toPolarCurrency,
} from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveInventoryPolarContext } from './polar-core';

export type SupabaseErrorLike = { message?: string } | null;

export type SyncTable =
  | 'inventory_storefront_listings'
  | 'inventory_bundles'
  | 'inventory_storefront_listing_variants';

export type SyncKind =
  | 'inventory_listing'
  | 'inventory_bundle'
  | 'inventory_listing_variant';

export type PolarSyncRow = {
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

export async function getPrivateAdmin() {
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
export async function getStorefrontContext(
  storefrontId: string | null
): Promise<{
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

export async function markRowSyncState(
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
    console.warn('Failed to persist Polar product sync state', {
      error: error.message,
      rowId,
      table,
    });
  }
}

export function extractErrorMessage(error: unknown) {
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
export async function pushRowToPolar(
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
          // Re-publishing a previously archived row must un-archive its Polar
          // product so it becomes buyable again.
          isArchived: false,
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
    console.warn('Inventory Polar product push failed', {
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

/**
 * Archives the Polar product a row maps to so it stops advertising a buyable
 * product once the inventory row is archived. Best-effort and non-throwing,
 * matching the push path. No-op when the row never synced to Polar.
 */
export async function archiveRowInPolar(
  table: SyncTable,
  rowId: string,
  wsId: string,
  storefrontSlug: string | null
) {
  const productId = await getCurrentPolarProductId(table, rowId, wsId);
  if (!productId) return;

  const context = await resolveInventoryPolarContext({ storefrontSlug, wsId });
  if (!context) return;

  try {
    await context.polar.products.update({
      id: productId,
      productUpdate: { isArchived: true },
    });
    await markRowSyncState(table, rowId, wsId, {
      polar_last_error: null,
      polar_sync_status: 'synced',
      polar_synced_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = extractErrorMessage(error);
    console.warn('Inventory Polar product archive failed', {
      error: message,
      rowId,
      table,
      wsId,
    });
    await markRowSyncState(table, rowId, wsId, {
      polar_last_error: message,
      polar_sync_status: 'error',
    });
  }
}

export async function syncListingToPolar(listing: InventoryStorefrontListing) {
  const { currency, slug } = await getStorefrontContext(listing.storefrontId);

  // Archived listings should not advertise a buyable Polar product — archive
  // the mapped Polar product instead of leaving it public.
  if (listing.status === 'archived') {
    await archiveRowInPolar(
      'inventory_storefront_listings',
      listing.id,
      listing.wsId,
      slug
    );
    return;
  }

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
  const { currency, slug } = await getStorefrontContext(bundle.storefrontId);

  // Archived bundles should not advertise a buyable Polar product — archive the
  // mapped Polar product instead of leaving it public.
  if (bundle.status === 'archived') {
    await archiveRowInPolar('inventory_bundles', bundle.id, bundle.wsId, slug);
    return;
  }

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

export type VariantPolarSyncInput = {
  variantId: string;
  wsId: string;
  storefrontId: string | null;
  listingTitle: string;
  variantLabel: string | null;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  polarProductId: string | null;
  status: InventoryVariantStatus;
};

/**
 * Each variant is its own buyable Polar product (name = "Listing - Variant").
 * Mirrors syncListingToPolar but for the per-variant SKU table. Archived/hidden
 * variants archive their Polar product instead of staying public.
 */
export async function syncVariantToPolar(input: VariantPolarSyncInput) {
  const { currency, slug } = await getStorefrontContext(input.storefrontId);

  if (input.status !== 'active') {
    await archiveRowInPolar(
      'inventory_storefront_listing_variants',
      input.variantId,
      input.wsId,
      slug
    );
    return;
  }

  const name = input.variantLabel
    ? `${input.listingTitle} - ${input.variantLabel}`
    : input.listingTitle;

  await pushRowToPolar(
    'inventory_storefront_listing_variants',
    'inventory_listing_variant',
    {
      currency,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      name,
      polarProductId: input.polarProductId ?? null,
      priceCents: input.priceCents,
      rowId: input.variantId,
      storefrontSlug: slug,
      wsId: input.wsId,
    }
  );
}
