import type { Subscription } from '@tuturuuu/payment/polar';
import { expect, it } from 'vitest';
import {
  comparePolarLegacySnapshot,
  observePolarSubscription,
} from './polar-shadow';

it('reports a period-end cancellation mismatch even while Polar is active', () => {
  const periodStart = new Date('2026-11-01T00:00:00Z');
  const periodEnd = new Date('2026-12-01T00:00:00Z');
  const polar = {
    id: 'subscription',
    product: { id: 'product', metadata: {} },
    prices: [],
    status: 'active',
    createdAt: periodStart,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: true,
    seats: 1,
  } as Subscription;
  const result = observePolarSubscription({
    subscription: polar,
    scope: { provider: 'polar', environment: 'sandbox', application: 'test' },
    observedAt: periodStart.toISOString(),
  });
  if (result.kind !== 'observed') throw new Error('Expected Polar observation');

  const legacy = {
    polar_subscription_id: polar.id,
    product_id: polar.product.id,
    status: 'active',
    current_period_start: periodStart.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: true,
    seat_count: 1,
  };
  expect(
    comparePolarLegacySnapshot({
      legacy,
      observation: result.observation,
      seatBased: true,
    })
  ).toEqual([]);
  expect(
    comparePolarLegacySnapshot({
      legacy: { ...legacy, cancel_at_period_end: false },
      observation: result.observation,
      seatBased: true,
    })
  ).toEqual(['cancel_at_period_end']);
});
