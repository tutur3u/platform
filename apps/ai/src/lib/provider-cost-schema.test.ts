import { describe, expect, it } from 'vitest';
import { providerCostSchema } from './provider-cost-schema';

const valid = {
  provider: 'apify',
  externalRunId: 'run_123',
  service: 'apify/facebook-posts-scraper',
  amountUsd: 0.126,
  currency: 'USD',
  source: 'provider_api',
  occurredAt: '2026-07-01T00:00:00Z',
  observedAt: '2026-09-01T00:00:00Z',
};
describe('provider-cost ingestion', () => {
  it('accepts historical runs and genuine zero costs', () => {
    expect(providerCostSchema.safeParse(valid).success).toBe(true);
    expect(
      providerCostSchema.safeParse({ ...valid, amountUsd: 0 }).success
    ).toBe(true);
  });
  it.each([-1, NaN, Infinity, 1_000_000_000, '0.1', null])(
    'rejects invalid cost %s',
    (amountUsd) => {
      expect(
        providerCostSchema.safeParse({ ...valid, amountUsd }).success
      ).toBe(false);
    }
  );
  it('rejects guessed costs, identity injection, and wrong dates/currency', () => {
    for (const extra of [
      { source: 'estimate' },
      { appId: 'other' },
      { workspaceId: 'other' },
      { currency: 'VND' },
      { observedAt: '2026-06-01T00:00:00Z' },
    ]) {
      expect(providerCostSchema.safeParse({ ...valid, ...extra }).success).toBe(
        false
      );
    }
  });
});
