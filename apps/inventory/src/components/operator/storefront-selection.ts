import type { InventoryStorefront } from '@tuturuuu/internal-api/inventory';

export function resolveActiveStorefrontId(
  storefronts: Pick<InventoryStorefront, 'id'>[],
  requestedStorefrontId: string | null
) {
  return storefronts.some(
    (storefront) => storefront.id === requestedStorefrontId
  )
    ? (requestedStorefrontId ?? '')
    : (storefronts[0]?.id ?? '');
}
