import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Order } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { syncUsagePackOrder } from './usage-pack-order';

test('only a bound, single-price pack reaches usage fulfillment', async () => {
  const original = process.env.POLAR_SANDBOX_PACK_PRODUCT_ID;
  process.env.POLAR_SANDBOX_PACK_PRODUCT_ID = 'sandbox-fixture';
  const calls: unknown[] = [];
  const db = {
    rpc: async (_: string, args: unknown) => {
      calls.push(args);
      return { error: null };
    },
  } as unknown as TypedSupabaseClient;
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
    await syncUsagePackOrder(db, { ...order, productId: 'ordinary' }, 'ws');
    await assert.rejects(syncUsagePackOrder(db, { ...order, subtotalAmount: 1 }, 'ws'));
    assert.equal(calls.length, 0);
    await syncUsagePackOrder(db, order, 'ws');
    assert.deepEqual(calls, [{
      p_ws: 'ws', p_order: 'order', p_product: 'sandbox-fixture',
      p_customer_ref: 'workspace_ws', p_meter: 'sandbox_seconds', p_status: 'paid',
      p_net_cents: 500, p_created: new Date(0).toISOString(),
      p_observed: new Date(0).toISOString(), p_end: null,
    }]);
  } finally {
    if (original === undefined) delete process.env.POLAR_SANDBOX_PACK_PRODUCT_ID;
    else process.env.POLAR_SANDBOX_PACK_PRODUCT_ID = original;
  }
});
