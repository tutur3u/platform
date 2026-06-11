import { getInventoryPublicStorefront } from '@tuturuuu/internal-api/inventory';
import {
  DEMO_STOREFRONT_SLUG,
  demoPublicStorefront,
} from './storefront-fixture';

export async function getOptionalInventoryPublicStorefront(storeSlug: string) {
  try {
    return await getInventoryPublicStorefront(storeSlug);
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
    (error as { status?: unknown }).status === 404
  );
}
