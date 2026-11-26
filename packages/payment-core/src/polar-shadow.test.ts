import { expect, it } from 'vitest';
import {
  comparePolarLegacySnapshot,
  observePolarSubscription,
} from './polar-shadow';

const periodStart = new Date('2026-11-01T00:00:00Z');
const periodEnd = new Date('2026-12-01T00:00:00Z');
const polar = {
  id: 'subscription',
  amount: 1000,
  currency: 'usd',
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
it('reports a period-end cancellation mismatch even while Polar is active', () => {
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

it('does not exclude products before validating provider scope', () => {
  expect(
    observePolarSubscription({
      subscription: {
        ...polar,
        product: {
          ...polar.product,
          organizationId: 'wrong-org',
          metadata: { product_type: 'ai_credit_pack' },
        },
      },
      scope,
      observedAt: periodStart.toISOString(),
    })
  ).toEqual({ kind: 'exception', reason: 'invalid_scope' });
});

it('rejects invalid seats and malformed timestamps without throwing', () => {
  const observedAt = periodStart.toISOString();
  expect(
    observePolarSubscription({
      subscription: { ...polar, seats: 0 },
      scope,
      observedAt,
    })
  ).toEqual({ kind: 'exception', reason: 'invalid_seats' });
  expect(
    observePolarSubscription({
      subscription: { ...polar, currentPeriodEnd: new Date('invalid') },
      scope,
      observedAt,
    })
  ).toEqual({ kind: 'exception', reason: 'invalid_timestamp' });
  expect(
    observePolarSubscription({
      subscription: { ...polar, currentPeriodStart: observedAt },
      scope,
      observedAt,
    }).kind
  ).toBe('observed');
});

it('retains VND minor amounts without converting to USD or scaling decimals', () => {
  const result = observePolarSubscription({
    subscription: { ...polar, currency: 'vnd', amount: 249_000 },
    scope,
    observedAt: periodStart.toISOString(),
  });
  expect(result).toMatchObject({
    kind: 'observed',
    observation: { nativeAmount: { currency: 'vnd', minorAmount: 249_000 } },
  });
});
