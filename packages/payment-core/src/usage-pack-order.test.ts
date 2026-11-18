import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Order } from '@tuturuuu/payment/polar';
import { usagePackOrderArgs } from './usage-pack-order';

test('only a bound, single-price pack reaches usage fulfillment', () => {
  const original = process.env.POLAR_SANDBOX_PACK_PRODUCT_ID;
  process.env.POLAR_SANDBOX_PACK_PRODUCT_ID = 'sandbox-fixture';
  const order = {
    id: 'order',
    productId: 'sandbox-fixture',
    customer: { externalId: 'workspace_ws' },
    currency: 'usd',
    createdAt: new Date(0),
    items: [{ amount: 500, proration: false }],
    subtotalAmount: 500,
    netAmount: 500,
    discountAmount: 0,
    refundedAmount: 0,
    refundedTaxAmount: 0,
    status: 'paid',
    billingReason: 'purchase',
    subscriptionId: null,
  } as unknown as Order;
  try {
    assert.equal(
      usagePackOrderArgs({ ...order, productId: 'ordinary' }, 'ws'),
      undefined
    );
    assert.throws(
      () => usagePackOrderArgs({ ...order, subtotalAmount: 1 }, 'ws'),
      /requires reconciliation/
    );
    assert.deepEqual(usagePackOrderArgs(order, 'ws'), {
      p_ws: 'ws',
      p_order: 'order',
      p_product: 'sandbox-fixture',
      p_customer_ref: 'workspace_ws',
      p_meter: 'sandbox_seconds',
      p_status: 'paid',
      p_net_cents: 500,
      p_created: new Date(0).toISOString(),
      p_observed: new Date(0).toISOString(),
      p_end: null,
    });
  } finally {
    if (original === undefined)
      delete process.env.POLAR_SANDBOX_PACK_PRODUCT_ID;
    else process.env.POLAR_SANDBOX_PACK_PRODUCT_ID = original;
  }
});
