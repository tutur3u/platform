import 'server-only';

import type { InventoryPublicStorefrontResponse } from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';

/**
 * Cache tag for a single public storefront payload. Inventory writes
 * (storefront/listing/bundle create, update, delete) call
 * `revalidatePublicStorefront(slug)` so the cached payload refreshes
 * immediately instead of waiting for the time-based revalidation.
 */
export function publicStorefrontTag(slug: string) {
  return `inventory-storefront:${slug}`;
}

async function loadPublicStorefront(slug: string) {
  // noCookie keeps this read free of request scope so it can run inside the
  // shared `use cache` scope (which forbids cookies()/headers()).
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_public_inventory_storefront', {
      p_storefront_slug: slug,
    });

  if (error) throw error;

  return (data as InventoryPublicStorefrontResponse | null) ?? null;
}

export async function getPublicStorefront(slug: string) {
  // Fresh read used on the reservation/checkout path where stale stock would be
  // unsafe; the GET read path uses the cached variant below.
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_public_inventory_storefront', {
      p_storefront_slug: slug,
    });

  if (error) throw error;

  return (data as InventoryPublicStorefrontResponse | null) ?? null;
}

/**
 * Read-path variant that caches the (expensive RPC-built) storefront payload on
 * the serving side. Keyed per slug and tagged so writes can bust it. Storefront
 * visibility/auth is still enforced by the caller after this returns, so caching
 * the data does not bypass access control.
 */
export async function getCachedPublicStorefront(slug: string) {
  'use cache';

  // Storefront reads are event-driven: writes invalidate the tag below. The
  // long revalidation interval is only a safety net for missed external writes,
  // while deployments continue to invalidate the build-scoped cache normally.
  cacheLife({
    stale: 300,
    revalidate: 31_536_000,
    expire: 315_360_000,
  });
  cacheTag(publicStorefrontTag(slug));

  return loadPublicStorefront(slug);
}

export function revalidatePublicStorefront(slug: string) {
  // Route handlers need the next read to observe stock/catalog writes. The
  // Server Action-only updateTag API cannot be used from these shared services.
  revalidateTag(publicStorefrontTag(slug), { expire: 0 });
}

export async function revalidateWorkspaceStorefronts(wsId: string) {
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .schema('private')
    .from('inventory_storefronts')
    .select('slug')
    .eq('ws_id', wsId)
    .neq('status', 'archived');

  if (error) throw error;

  for (const storefront of data ?? []) {
    if (storefront.slug) revalidatePublicStorefront(storefront.slug);
  }
}

export async function revalidateStorefrontByCheckoutId(
  wsId: string,
  checkoutId: string
) {
  const sbAdmin = await createAdminClient();
  const inventory = sbAdmin.schema('private');
  const { data: checkout, error: checkoutError } = await inventory
    .from('inventory_checkout_sessions')
    .select('storefront_id')
    .eq('id', checkoutId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (checkoutError) throw checkoutError;
  if (!checkout?.storefront_id) return;

  const { data: storefront, error: storefrontError } = await inventory
    .from('inventory_storefronts')
    .select('slug')
    .eq('id', checkout.storefront_id)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (storefrontError) throw storefrontError;
  if (storefront?.slug) revalidatePublicStorefront(storefront.slug);
}

export async function safelyRevalidateWorkspaceStorefronts(wsId: string) {
  try {
    await revalidateWorkspaceStorefronts(wsId);
  } catch (error) {
    console.error('Failed to revalidate workspace storefronts', {
      error,
      wsId,
    });
  }
}

export async function safelyRevalidateStorefrontByCheckoutId(
  wsId: string,
  checkoutId: string
) {
  try {
    await revalidateStorefrontByCheckoutId(wsId, checkoutId);
  } catch (error) {
    console.error('Failed to revalidate checkout storefront', {
      checkoutId,
      error,
      wsId,
    });
  }
}
