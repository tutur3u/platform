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
    metadata: { wsId: 'workspace' },
    product: {
      id: 'product',
      metadata: { product_tier: 'PLUS' },
      organizationId: 'test',
    },
    prices: [],
    status: 'active',
    modifiedAt: null,
    createdAt: periodStart,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: true,
    canceledAt: null,
    seats: 1,
  } satisfies Parameters<typeof observePolarSubscription>[0]['subscription'];
  const scope = {
    provider: 'polar',
    environment: 'sandbox',
    application: 'test',
  } as const;
  const result = observePolarSubscription({
    subscription: polar,
    scope,
    observedAt: periodStart.toISOString(),
  });
  if (result.kind !== 'observed') throw new Error('Expected Polar observation');

  const legacy = {
    ws_id: 'workspace',
    updated_at: periodStart.toISOString(),
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
      legacyScope: scope,
      observation: result.observation,
      seatBased: true,
    })
  ).toEqual([]);
  expect(
    comparePolarLegacySnapshot({
      legacy: { ...legacy, cancel_at_period_end: false },
      legacyScope: scope,
      observation: result.observation,
      seatBased: true,
    })
  ).toEqual(['cancel_at_period_end']);
  expect(
    comparePolarLegacySnapshot({
      legacy: {
        ...legacy,
        ws_id: 'another-workspace',
        updated_at: periodEnd.toISOString(),
        seat_count: null,
      },
      legacyScope: { ...scope, environment: 'production' },
      observation: { ...result.observation, quantity: null },
      seatBased: true,
    })
  ).toEqual(['environment', 'ws_id', 'updated_at', 'seat_count']);
});
