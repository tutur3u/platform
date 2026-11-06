import { getInventoryPublicStorefront } from '@tuturuuu/internal-api/inventory';
import {
  DEMO_STOREFRONT_SLUG,
  demoPublicStorefront,
} from './storefront-fixture';

export async function getOptionalInventoryPublicStorefront(
  storeSlug: string,
  options?: Parameters<typeof getInventoryPublicStorefront>[1]
) {
  try {
    const response = await getInventoryPublicStorefront(storeSlug, options);
    // A non-storefront body (for example a proxy or egress error page on
    // Cloudflare) must not crash the render with an undefined storefront.
    return isPublicStorefrontResponse(response) ? response : null;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    if (storeSlug === DEMO_STOREFRONT_SLUG) return demoPublicStorefront;
    return null;
  }
}

export function isNotFoundError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 404
  );
}

function isPublicStorefrontResponse<T>(value: T): value is NonNullable<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'storefront' in value &&
    typeof value.storefront === 'object' &&
    value.storefront !== null &&
    !Array.isArray(value.storefront) &&
    'listings' in value &&
    Array.isArray(value.listings) &&
    'bundles' in value &&
    Array.isArray(value.bundles)
  );
}
