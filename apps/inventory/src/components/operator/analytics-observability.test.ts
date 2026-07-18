import type { InventoryAnalyticsResponse } from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import { deriveAnalyticsSignals } from './analytics-observability';

describe('deriveAnalyticsSignals', () => {
  it('derives operational coverage from the analytics snapshot', () => {
    const data = {
      observability: { dataPoints: 4, queryDurationMs: 82 },
      storefrontFunnel: { checkoutCreated: 8, completed: 6 },
      summary: { activeProducts: 10, stockedProducts: 8 },
      trend: [{ sales: 2 }, { sales: 0 }, { sales: 1 }, { sales: 0 }],
    } as unknown as InventoryAnalyticsResponse;

    expect(deriveAnalyticsSignals(data)).toMatchObject({
      activityCoverage: 50,
      activeDays: 2,
      catalogReadiness: 80,
      checkoutCompletion: 75,
      queryDurationMs: 82,
      totalDays: 4,
    });
  });

  it('keeps empty snapshots finite and safe', () => {
    const data = {
      observability: { dataPoints: 0, queryDurationMs: 0 },
      storefrontFunnel: { checkoutCreated: 0, completed: 0 },
      summary: {},
      trend: [],
    } as unknown as InventoryAnalyticsResponse;

    expect(deriveAnalyticsSignals(data)).toMatchObject({
      activityCoverage: 0,
      catalogReadiness: 0,
      checkoutCompletion: 0,
    });
  });
});
