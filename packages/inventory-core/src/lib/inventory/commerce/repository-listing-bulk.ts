import 'server-only';

import { getMinorUnitFactor } from '@tuturuuu/utils/money';
import {
  createPrivateInventoryClient,
  revalidateStorefrontById,
  type SupabaseErrorLike,
} from './repository-shared';

type StorefrontBulkImportResult = {
  created: number;
  eligible: number;
  skippedExisting: number;
  skippedWithoutStock: number;
};

/**
 * Creates draft listings for products that do not already have a live listing.
 * Existing listings are deliberately never updated or deleted.
 */
export async function bulkCreateStorefrontListingsFromStock(
  wsId: string,
  storefrontId: string,
  currency: string
) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory.rpc(
    'bulk_create_inventory_storefront_listings_from_stock' as never,
    {
      p_minor_unit_factor: getMinorUnitFactor(currency),
      p_storefront_id: storefrontId,
      p_ws_id: wsId,
    } as never
  )) as {
    data: StorefrontBulkImportResult | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  if (!data) throw new Error('Storefront bulk import returned no result');

  await revalidateStorefrontById(wsId, storefrontId);
  return data;
}
