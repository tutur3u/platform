import 'server-only';

import type { InventoryPolarEnvironment } from '@tuturuuu/internal-api/inventory';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  decryptIntegrationToken,
  ensureInventoryPolarProduct,
  extractErrorMessage,
  getIntegration,
} from './polar-core';
import {
  buildPolarDiscountInput,
  type PromotionForPolar,
} from './promotions-polar';

/**
 * Mirrors an inventory promotion to a Polar discount so it applies at Polar
 * checkout. Best-effort and non-throwing: returns the created discount id (and
 * the environment used), or null if the workspace has no usable Polar
 * integration or the Polar call fails. Prefers a production integration, then
 * sandbox.
 */
export async function syncInventoryPromotionDiscount({
  promotion,
  wsId,
}: {
  promotion: PromotionForPolar;
  wsId: string;
}): Promise<{
  discountId: string | null;
  environment: InventoryPolarEnvironment | null;
}> {
  const environments: InventoryPolarEnvironment[] = ['production', 'sandbox'];

  for (const environment of environments) {
    const integration = await getIntegration({ environment, wsId });
    if (!integration?.access_token_encrypted) continue;

    try {
      const productId = await ensureInventoryPolarProduct({
        environment,
        wsId,
      });
      const accessToken = await decryptIntegrationToken(integration);
      const polar = createPolarClient({ accessToken, environment });
      // Fixed discounts need a currency; promotions are workspace-level, so we
      // default to USD (percentage discounts ignore it).
      const input = buildPolarDiscountInput(promotion, 'USD', productId);
      const discount = await polar.discounts.create(input as never);
      return { discountId: discount.id, environment };
    } catch (error) {
      console.warn('Inventory promotion Polar discount sync failed', {
        environment,
        error: extractErrorMessage(error),
        wsId,
      });
      return { discountId: null, environment };
    }
  }

  return { discountId: null, environment: null };
}
