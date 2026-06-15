import 'server-only';

import type { InventoryPublicStorefrontResponse } from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { revalidateTag, unstable_cache } from 'next/cache';

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
  // noCookie keeps this read free of request scope so it can be wrapped in
  // unstable_cache (which forbids cookies()/headers()).
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
  const load = unstable_cache(
    (innerSlug: string) => loadPublicStorefront(innerSlug),
    ['inventory-public-storefront'],
    { revalidate: 300, tags: [publicStorefrontTag(slug)] }
  );
  return load(slug);
}

export function revalidatePublicStorefront(slug: string) {
  // Next 16 requires the cache-life profile; "max" purges the tag immediately.
  revalidateTag(publicStorefrontTag(slug), 'max');
}
