import type { InventoryCheckoutSession } from '@tuturuuu/internal-api/inventory';

export type StorefrontOrderState = 'confirmed' | 'needs_attention' | 'pending';

type OrderStateInput = Pick<
  InventoryCheckoutSession,
  'polarStatus' | 'squareStatus' | 'status'
>;

const FAILED_PROVIDER_STATUSES = new Set([
  'cancel_requested',
  'canceled',
  'cancelled',
  'expired',
  'failed',
]);

const CONFIRMED_PROVIDER_STATUSES = new Set(['completed', 'paid']);

export function getStorefrontOrderState(
  order?: OrderStateInput | null
): StorefrontOrderState {
  if (!order) return 'pending';

  const providerStatus = order.squareStatus ?? order.polarStatus;
  if (providerStatus && FAILED_PROVIDER_STATUSES.has(providerStatus)) {
    return 'needs_attention';
  }

  if (order.status === 'cancelled' || order.status === 'expired') {
    return 'needs_attention';
  }

  if (
    order.status === 'completed' ||
    (providerStatus && CONFIRMED_PROVIDER_STATUSES.has(providerStatus))
  ) {
    return 'confirmed';
  }

  return 'pending';
}

export function formatStorefrontOrderStatus(order: OrderStateInput) {
  return (order.squareStatus ?? order.polarStatus ?? order.status).replaceAll(
    '_',
    ' '
  );
}
