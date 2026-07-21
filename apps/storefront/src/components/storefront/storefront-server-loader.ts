import 'server-only';

import { cache } from 'react';
import { INVENTORY_APP_URL } from '@/constants/common';
import { getOptionalInventoryPublicStorefront } from './storefront-loader';

/**
 * Request-scoped deduplication for metadata and page rendering. The durable,
 * tagged cache remains in Inventory so a catalog write has exactly one cache
 * to invalidate across deployments.
 */
export const getServerInventoryStorefront = cache((storeSlug: string) =>
  getOptionalInventoryPublicStorefront(storeSlug, {
    baseUrl: INVENTORY_APP_URL,
  }).catch(() => null)
);
