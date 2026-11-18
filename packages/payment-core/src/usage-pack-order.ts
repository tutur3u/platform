import type { Order } from '@tuturuuu/payment/polar';

export function usagePackOrderArgs(order: Order, wsId: string) {
  if (!order.productId) return;
  const bindings = [
    {
      id: process.env.POLAR_SANDBOX_PACK_PRODUCT_ID,
      meter: 'sandbox_seconds',
      price: 500,
    },
    {
      id: process.env.POLAR_LARGE_ROOM_PACK_PRODUCT_ID,
      meter: 'participant_seconds',
      price: 500,
    },
    {
      id: process.env.POLAR_STORAGE_PACK_PRODUCT_ID,
      meter: 'stored_bytes',
      price: 300,
    },
  ].filter((entry) => entry.id === order.productId);
  if (bindings.length === 0) return;
  const binding = bindings[0]!;
  if (bindings.length !== 1) throw new Error('Ambiguous usage product mapping');
  if (order.status === 'pending') return;
  const storage = binding.meter === 'stored_bytes';
  if (
    !order.customer.externalId ||
    order.currency.toLowerCase() !== 'usd' ||
    order.items.length !== 1 ||
    order.items[0]?.proration ||
    order.subtotalAmount !== binding.price ||
    order.items[0]?.amount !== binding.price ||
    order.discountAmount !== 0 ||
    (storage
      ? !order.subscription
      : order.billingReason !== 'purchase' || order.subscriptionId !== null)
  )
    throw new Error('Usage order requires reconciliation');

  return {
    p_ws: wsId,
    p_order: order.id,
    p_product: order.productId,
    p_customer_ref: order.customer.externalId,
    p_meter: binding.meter,
    p_status: order.status,
    p_net_cents:
      order.netAmount - order.refundedAmount + order.refundedTaxAmount,
    p_created: order.createdAt.toISOString(),
    p_observed: (order.modifiedAt ?? order.createdAt).toISOString(),
    p_end: order.subscription?.currentPeriodEnd.toISOString() ?? null,
  };
}
